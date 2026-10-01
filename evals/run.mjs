#!/usr/bin/env node
// Runner de evals: ejecuta misiones sintéticas con el tech lead real (Agent SDK + plugin oficina) y las califica.
//   node evals/run.mjs [--case 01-bugfix] [--model opus] [--kit ../office-kit] [--budget 5] [--keep] [--out evals/results]
// Requiere Claude Code con sesión iniciada (`claude login`) o ANTHROPIC_API_KEY. Cada caso crea su fixture en un
// directorio temporal, corre la sesión en él y lo califica con grade.mjs. Las preguntas al humano se difieren
// (igual que en el ejecutor), así el caso 03 termina en `deferred_tool_use`.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport, gradeCase } from './grade.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter(x => x.length));
const kit = resolve(args.kit ?? join(here, '..', 'office-kit'));
const model = typeof args.model === 'string' ? args.model : 'opus';
const budget = Number(args.budget ?? 5);
const outDir = resolve(args.out ?? join(here, 'results'));
mkdirSync(outDir, { recursive: true });

const cases = readdirSync(join(here, 'cases')).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(readFileSync(join(here, 'cases', f), 'utf8')))
  .filter(c => !args.case || c.id === args.case || c.id.startsWith(String(args.case)));
if (cases.length === 0) { console.error('ningún caso coincide'); process.exit(64); }

const schema = JSON.parse(readFileSync(join(kit, 'schemas', 'mission-result.schema.json'), 'utf8'));
const leadPrompt = readFileSync(join(kit, 'agents', 'tech-lead.md'), 'utf8').replace(/^---[\s\S]*?---\s*/m, '');

function buildPrompt(c) {
  return [
    `/oficina:mission "${c.title}"`,
    '',
    `Misión eval_${c.id} en el repo oficina-eval-fixture.`,
    `Objetivo: ${c.goal}`,
    `Criterio de aceptación propuesto por el humano:\n${c.acceptance.map(a => `- ${a}`).join('\n')}`,
    'Al terminar, el informe final debe cumplir el esquema de salida estructurada (status, tests con evidence_id reales, etc.).',
  ].join('\n');
}

const results = [];
for (const c of cases) {
  const dest = join(mkdtempSync(join(tmpdir(), `oficina-eval-${c.id}-`)), 'repo');
  execFileSync('bash', [join(here, 'fixtures', 'make-fixture.sh'), dest, c.variant], { stdio: 'inherit' });
  const evidenceDir = join(dest, '.oficina', 'evidence');
  const started = Date.now();
  const log = [];
  let final = { subtype: 'none', structured: null, deferred: null, numTurns: 0, costUsd: 0 };
  console.log(`\n=== ${c.id} · ${c.title} · modelo ${model} · ${dest}`);
  try {
    const q = query({
      prompt: buildPrompt(c),
      options: {
        cwd: dest,
        model,
        permissionMode: 'acceptEdits',
        allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Agent', 'Skill', 'AskUserQuestion', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'],
        plugins: [{ type: 'local', path: kit }],
        settingSources: ['project'],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: leadPrompt },
        maxTurns: c.max_turns ?? 60,
        maxBudgetUsd: budget,
        env: { ...process.env, OFICINA_ROOT: dest, OFICINA_EVIDENCE_DIR: evidenceDir, OFICINA_MISSION_ID: `eval_${c.id}`, CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '2', CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' },
        outputFormat: { type: 'json_schema', schema },
        hooks: {
          PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [async () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'defer', permissionDecisionReason: 'eval: la pregunta se registra y la sesión termina' } })] }],
        },
      },
    });
    for await (const m of q) {
      if (m.type === 'assistant') {
        for (const block of m.message?.content ?? []) {
          if (block.type === 'tool_use') { log.push({ t: Date.now() - started, tool: block.name, input: summarize(block.input) }); process.stdout.write(`  [${block.name}] ${summarize(block.input)}\n`); }
          else if (block.type === 'text' && !m.parent_tool_use_id) process.stdout.write(`  lead: ${String(block.text).slice(0, 200).replace(/\n/g, ' ')}\n`);
        }
      } else if (m.type === 'result') {
        final = { subtype: m.subtype, structured: m.structured_output ?? null, deferred: m.deferred_tool_use ? { name: m.deferred_tool_use.name } : null, numTurns: m.num_turns, costUsd: m.total_cost_usd };
      }
    }
  } catch (e) {
    final = { ...final, subtype: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
  const graded = gradeCase(c, { dest, result: final, schema });
  graded.duration_s = Math.round((Date.now() - started) / 1000);
  graded.model = model;
  graded.dest = dest;
  results.push(graded);
  writeFileSync(join(outDir, `${new Date(started).toISOString().replace(/[:.]/g, '-')}-${c.id}.json`), JSON.stringify({ case: c, model, result: final, graded, log }, null, 2));
  console.log(formatReport([graded]));
  if (!args.keep) rmSync(dirname(dest), { recursive: true, force: true });
}

console.log('\n' + formatReport(results));
process.exit(results.every(r => r.pass) ? 0 : 1);

function summarize(input) {
  if (!input || typeof input !== 'object') return '';
  const i = input;
  return String(i.command ?? i.file_path ?? i.pattern ?? i.skill ?? i.subagent_type ?? i.description ?? '').slice(0, 120);
}
