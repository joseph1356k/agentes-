// M5: servidor MCP en proceso con las herramientas de la oficina. El agente las ve como mcp__oficina__<tool>.
// El agente nunca recibe credenciales: cada handler delega en el backend (Supabase vía el ejecutor).
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { OfficeToolsBackend } from './types.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

export const OFFICE_TOOL_NAMES = [
  'mcp__oficina__mission_get', 'mcp__oficina__plan_set', 'mcp__oficina__acceptance_set', 'mcp__oficina__decision_record',
  'mcp__oficina__learning_record', 'mcp__oficina__child_mission_create', 'mcp__oficina__review_request', 'mcp__oficina__attention',
];

export function createOfficeServer(backend: OfficeToolsBackend) {
  const wrap = async <T>(fn: () => Promise<T>, ok: (v: T) => string) => {
    try { return text(ok(await fn())); } catch (e) { return fail(`oficina: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const missionGet = tool(
    'mission_get',
    'Devuelve la misión actual tal como está en la oficina: objetivo, criterio de aceptación, decisiones, plan, estado, rama, sub-misiones y sus estados.',
    {},
    async () => wrap(() => backend.missionGet(), v => JSON.stringify(v, null, 2)),
    { annotations: { readOnlyHint: true } },
  );

  const planSet = tool(
    'plan_set',
    'Registra el plan de la misión (enfoque, archivos a tocar, contratos, riesgos, pruebas) para que el humano lo vea en el dashboard. Úsalo antes de implementar en misiones N2/N3 o de riesgo medio/alto. Opcionalmente fija criterio de aceptación, nivel y riesgo.',
    {
      plan: z.string().min(40).describe('Plan en Markdown: objetivo, enfoque, archivos/módulos, contratos, riesgos, pruebas que lo demuestran'),
      acceptance: z.array(z.string()).optional().describe('Criterio de aceptación (2 a 6 condiciones comprobables)'),
      level: z.enum(['N0', 'N1', 'N2', 'N3']).optional(),
      risk: z.enum(['low', 'medium', 'high']).optional(),
    },
    async (a) => wrap(() => backend.planSet(a.plan, { acceptance: a.acceptance, level: a.level, risk: a.risk }), () => 'Plan registrado en la oficina.'),
  );

  const acceptanceSet = tool(
    'acceptance_set',
    'Fija o actualiza el criterio de aceptación de la misión (condiciones comprobables que el informe final debe cumplir).',
    { acceptance: z.array(z.string().min(5)).min(1).max(8) },
    async (a) => wrap(() => backend.acceptanceSet(a.acceptance), () => `Criterio de aceptación registrado (${a.acceptance.length} condiciones).`),
  );

  const decisionRecord = tool(
    'decision_record',
    'Registra una decisión. scope "mission" = supuesto o decisión local de esta misión; scope "shared" = afecta a otras misiones (propónla también como ADR en docs/decisions con estado proposed).',
    {
      text: z.string().min(10),
      rationale: z.string().min(10),
      scope: z.enum(['mission', 'shared']),
      adr_path: z.string().optional().describe('Ruta del ADR propuesto, si scope es shared'),
    },
    async (a) => wrap(() => backend.decisionRecord(a), id => `Decisión registrada (${id}).`),
  );

  const learningRecord = tool(
    'learning_record',
    'Registra un aprendizaje VERIFICADO (con evidencia: id ev_..., commit, prueba) para el equipo. No registres hipótesis.',
    {
      text: z.string().min(10),
      evidence: z.string().min(3).describe('ev_..., SHA, ruta de prueba o referencia comprobable'),
      scope: z.enum(['repo', 'area', 'team']).default('repo'),
      area: z.enum(['memoria', 'voz', 'computer-use', 'backend', 'frontend', 'calidad']).optional(),
    },
    async (a) => wrap(() => backend.learningRecord(a), id => `Aprendizaje registrado (${id}).`),
  );

  const childMissionCreate = tool(
    'child_mission_create',
    'Crea una sub-misión de esta misión (funcionalidades complejas: una por unidad integrable). Hereda repo y rama base (la rama de esta misión). depends_on acepta ids de otras sub-misiones que deben estar en revisión o más allá antes de empezar. Nace en cola o en borrador según la configuración de la misión padre.',
    {
      title: z.string().min(5).max(120),
      goal: z.string().min(20),
      acceptance: z.array(z.string()).optional(),
      subdir: z.string().optional().describe('Carpeta del proyecto en monorepos'),
      depends_on: z.array(z.string()).optional(),
      priority: z.number().int().min(0).max(100).optional(),
      required_platform: z.enum(['darwin', 'linux', 'win32']).optional(),
    },
    async (a) => wrap(() => backend.childMissionCreate(a), r => `Sub-misión creada: ${r.id} (${r.status}).`),
  );

  const reviewRequest = tool(
    'review_request',
    'Pide que la oficina ejecute una revisión independiente (perfil revisor, contexto limpio) al terminar esta sesión. Úsalo si el riesgo real resultó mayor que el previsto.',
    { reason: z.string().min(5) },
    async (a) => wrap(() => backend.reviewRequest(a.reason), () => 'Revisión independiente solicitada; se ejecutará al terminar la sesión.'),
  );

  const attention = tool(
    'attention',
    'Avisa al humano de algo que requiere su atención sin bloquear la misión (p. ej. una decisión tomada por ti que conviene revisar, un riesgo detectado, un acceso que faltará más adelante).',
    { text: z.string().min(5) },
    async (a) => wrap(() => backend.attention(a.text), () => 'Aviso enviado al dashboard.'),
  );

  return createSdkMcpServer({ name: 'oficina', version: '0.2.0', tools: [missionGet, planSet, acceptanceSet, decisionRecord, learningRecord, childMissionCreate, reviewRequest, attention] });
}
