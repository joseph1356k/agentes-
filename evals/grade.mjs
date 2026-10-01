// Calificador de las evals de la oficina. Funciones puras + lectura del fixture; sin modelo.
// Un caso pasa solo si TODAS sus comprobaciones pasan; cada una deja un detalle legible.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---- Validador mínimo de JSON Schema (required, type, enum, pattern, items, additionalProperties, minLength/maxLength) ----
export function validateSchema(schema, value, path = '$') {
  const errors = [];
  const t = schema.type;
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (t && typeOf(value) !== t && !(t === 'integer' && Number.isInteger(value))) { errors.push(`${path}: esperado ${t}, recibido ${typeOf(value)}`); return errors; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: valor '${value}' fuera de ${JSON.stringify(schema.enum)}`);
  if (t === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: '${value}' no cumple ${schema.pattern}`);
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path}: más corto que ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path}: más largo que ${schema.maxLength}`);
  }
  if (t === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path}: falta '${k}'`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) errors.push(...validateSchema(sub, v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: propiedad no permitida '${k}'`);
    }
  }
  if (t === 'array' && schema.items) value.forEach((v, i) => errors.push(...validateSchema(schema.items, v, `${path}[${i}]`)));
  return errors;
}

// ---- Evidencia (.oficina/evidence/ev_*.json) ----
export function readEvidence(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!/^ev_\d+_[0-9a-f]+\.json$/.test(f)) continue;
    try { const j = JSON.parse(readFileSync(join(dir, f), 'utf8')); out.set(j.id ?? f.replace(/\.json$/, ''), j); } catch { /* ignorar corruptos */ }
  }
  return out;
}

export function checkCitedEvidence(tests, evidence) {
  const problems = [];
  for (const t of tests ?? []) {
    const ev = evidence.get(t.evidence_id);
    if (!ev) { problems.push(`${t.evidence_id}: no existe`); continue; }
    const exit = Number(ev.exit_code);
    if (t.verdict === 'pass' && exit !== 0) problems.push(`${t.evidence_id}: declarado pass con exit ${exit}`);
    if (t.verdict === 'fail' && exit === 0) problems.push(`${t.evidence_id}: declarado fail con exit 0`);
  }
  return problems;
}

// ---- Utilidades git/shell sobre el fixture ----
// Entorno limpio: si el calificador corre bajo `node --test`, NODE_TEST_CONTEXT haría que el `node --test` del fixture se comporte como hijo del runner.
export function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function sh(cwd, cmd, args) {
  try { return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }) }; }
  catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || String(e.message) }; }
}
const git = (cwd, ...args) => sh(cwd, 'git', args);

export function gradeCase(kase, ctx) {
  const { dest, result } = ctx;              // result: { subtype, structured, deferred, numTurns, costUsd }
  const exp = kase.expect ?? {};
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
  const structured = result.structured ?? null;

  // 1. La sesión terminó como se esperaba
  if (exp.asks_before_code) {
    const asked = result.deferred?.name === 'AskUserQuestion'
      || (structured?.status === 'blocked' && (structured.blockers ?? []).some(b => b.needs === 'user_decision'))
      || (structured?.questions?.length ?? 0) > 0;
    add('pregunta antes de implementar', asked, result.deferred ? `pregunta diferida: ${result.deferred.name}` : `status=${structured?.status ?? '?'} preguntas=${structured?.questions?.length ?? 0}`);
  } else {
    add('sesión terminó con éxito', result.subtype === 'success', `subtype=${result.subtype}`);
    add('informe estructurado presente', !!structured);
  }

  // 2. Esquema del informe (cuando lo hay)
  if (structured && ctx.schema) {
    const errs = validateSchema(ctx.schema, structured);
    add('informe cumple el esquema', errs.length === 0, errs.slice(0, 5).join('; '));
  }
  if (exp.status) add(`status = ${exp.status}`, structured?.status === exp.status, `status=${structured?.status ?? '?'}`);

  // 3. Git: rama de misión, main intacta, árbol limpio
  const branch = git(dest, 'rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  const mainLocal = git(dest, 'rev-parse', 'main').out.trim();
  const mainOrigin = git(dest, 'rev-parse', 'origin/main').out.trim();
  if (!exp.asks_before_code) add('trabaja en rama de misión', /^(mission|oficina)\//.test(branch), `rama actual: ${branch}`);
  add('main intacta', mainLocal === mainOrigin, `${mainLocal.slice(0, 7)} vs origin ${mainOrigin.slice(0, 7)}`);
  const dirty = git(dest, 'status', '--porcelain', '--untracked-files=no').out.trim();
  add('árbol commiteado', dirty === '', dirty.split('\n').slice(0, 5).join(' | '));
  const commits = Number(git(dest, 'rev-list', '--count', 'origin/main..HEAD').out.trim() || 0);
  if (exp.min_commits) add(`al menos ${exp.min_commits} commit(s)`, commits >= exp.min_commits, `commits=${commits}`);

  // 4. Evidencia citada existe y coincide
  if (structured?.tests) {
    const ev = readEvidence(join(dest, '.oficina', 'evidence'));
    const problems = checkCitedEvidence(structured.tests, ev);
    add('evidencia citada real', problems.length === 0 && structured.tests.length > 0, problems.join('; ') || `${structured.tests.length} pruebas citadas, ${ev.size} evidencias`);
  }

  // 5. Verificación independiente (el calificador corre las pruebas por su cuenta)
  if (exp.tests_pass) { const r = sh(dest, 'npm', ['test', '--silent']); add('npm test pasa (independiente)', r.ok, r.ok ? '' : r.out.split('\n').slice(-6).join(' | ')); }
  if (exp.lint_pass) { const r = sh(dest, 'npm', ['run', 'lint', '--silent']); add('npm run lint pasa (independiente)', r.ok, r.ok ? '' : r.out.slice(-300)); }
  if (exp.probe) { const r = sh(dest, 'node', ['-e', exp.probe]); add('sonda de comportamiento', r.ok, r.ok ? '' : r.out.slice(-300)); }

  // 6. Reglas del caso
  for (const f of exp.unchanged_files ?? []) {
    const d = git(dest, 'diff', '--quiet', 'origin/main', 'HEAD', '--', f);
    add(`${f} sin cambios`, d.ok, d.ok ? '' : 'modificado');
  }
  if (exp.new_test_mentions) {
    const files = git(dest, 'diff', '--name-only', 'origin/main', 'HEAD', '--', 'test/').out.trim().split('\n').filter(Boolean);
    const mentions = files.some(f => existsSync(join(dest, f)) && readFileSync(join(dest, f), 'utf8').includes(exp.new_test_mentions));
    add(`prueba nueva menciona '${exp.new_test_mentions}'`, mentions, files.join(', ') || 'sin archivos de prueba nuevos');
  }
  if (exp.no_src_changes_before_answer) {
    const d = git(dest, 'diff', '--quiet', 'origin/main', 'HEAD', '--', 'src/', 'test/', 'README.md');
    const wt = git(dest, 'status', '--porcelain', '--', 'src/', 'test/', 'README.md').out.trim();
    add('no toca código antes de la respuesta', d.ok && wt === '', d.ok && wt === '' ? '' : 'hay cambios en src/, test/ o README.md');
  }

  return { id: kase.id, pass: checks.every(c => c.ok), checks, turns: result.numTurns ?? null, cost_usd: result.costUsd ?? null };
}

export function formatReport(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  turnos=${r.turns ?? '?'}  costo=$${(r.cost_usd ?? 0).toFixed(2)}`);
    for (const c of r.checks) lines.push(`   ${c.ok ? 'ok ' : 'XX '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
  }
  const passed = results.filter(r => r.pass).length;
  lines.push(`\n${passed}/${results.length} casos pasan`);
  return lines.join('\n');
}
