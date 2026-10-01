# Equipo y delegación

Cómo están definidos los perfiles, por qué así, y cómo se encarga y devuelve trabajo. Los archivos reales están en `office-kit/agents/` y `office-kit/skills/`.

## 1. Principios de diseño de los perfiles

1. **Instrucciones breves + mapa + comandos + pruebas + referencias.** Cada perfil tiene un prompt corto que dice qué le importa, qué evidencia debe dejar y cómo devuelve el trabajo; el conocimiento del área va en un playbook (`skills/playbook-<área>`) y el mapa real del repo en `docs/oficina/areas/<área>.md`, que produce la misión de inventario. "Eres experto" no aparece en ningún prompt.
2. **Comprobar, no suponer.** Todos empiezan leyendo el estado real (Graphify, docs del repo, archivos) y terminan con evidencia `ev_...`.
3. **Mismo protocolo para todos.** El skill `protocolo` se precarga en cada agente y, por si el precargado fallara, cada prompt indica leerlo desde `${CLAUDE_PLUGIN_ROOT}`.
4. **Alcance verificable.** Un especialista solo edita los archivos de su encargo (`scope-guard`). Dos agentes nunca escriben el mismo archivo.
5. **Memoria por agente y por repo.** `memory: project` → `.claude/agent-memory/<agente>/MEMORY.md` en cada repo: aprendizajes verificados con evidencia, no opiniones.
6. **Modelos elegidos por rol, no por moda.** Lead y revisor con el modelo fuerte (juicio, integración, revisión); implementación con el modelo medio; triage con el económico. Se mide y se ajusta (`docs/08-FASES-Y-ACEPTACION.md`).

## 2. Los perfiles

| Agente | Frontmatter clave | Qué le importa | Evidencia que deja |
|---|---|---|---|
| `tech-lead` | `model: opus`, `effort: high`, `memory: project`, sin restricción de herramientas (necesita `Agent`, `AskUserQuestion`) | objetivo, criterio de aceptación, nivel y riesgo, contratos, integración, informe | informe `mission-result` con todas las `ev_...` |
| `memoria-contexto` | `model: sonnet`, `maxTurns: 80`, herramientas de código + `Agent(Explore)` | recuerdos, recuperación, contexto, preferencias/correcciones, aislamiento entre usuarios | recuerdo correcto, corrección aplicada, aislamiento, sin memoria, presupuesto |
| `voz-conversacion` | ídem | captura, transcripción, síntesis, interrupciones, reconexión, latencia | fixtures de audio, latencia antes/después, interrupción, reconexión |
| `computer-use` | ídem | catálogo de acciones, permisos, verificación por efecto, recuperación, simuladores | acción verificada, fallo con recuperación, permiso denegado, idempotencia |
| `backend-agentes` | ídem | contratos, migraciones, auth/RLS, agentes del producto, observabilidad | contratos probados, migración aplicada, typecheck/lint, plan de reversión |
| `frontend-experiencia` | ídem | recorridos con todos los estados, visibilidad del asistente, configuración, accesibilidad | pruebas de componente/recorrido, build, capturas |
| `calidad` | ídem; no corrige código de producto salvo encargo explícito | pirámide real, recorridos críticos, evaluaciones de comportamiento, regresiones, incidentes | suite completa, evaluaciones, `## Riesgos pendientes` |
| `revisor` | `model: opus`, `tools: Read, Glob, Grep, Bash`, `disallowedTools: Edit, Write, NotebookEdit`, hook `readonly-guard` | corrección, seguridad, compatibilidad, pruebas no debilitadas, claridad | `## Veredicto` + hallazgos con severidad y `archivo:línea` |

Notas:
- Todos los agentes que escriben código precargan `oficina:protocolo` y `oficina:estandar` (promesa antes que código, cambios pequeños, seguridad, evidencia); los especialistas además su `playbook-<área>`. El texto íntegro de cada prompt está en `docs/11-SYSTEM-PROMPTS.md`.
- El tech lead, cuando corre bajo el ejecutor, tiene las herramientas de la oficina (`mcp__oficina__*`) para registrar plan, criterio, decisiones y aprendizajes, crear sub-misiones (`/oficina:spec`), pedir revisión y pedir atención sin bloquear. Sigue las recetas por tipo de tarea (`/oficina:recipe-*`).
- El `revisor` también corre como sesión automática del ejecutor (M9) para riesgo ≥ medio, N3 o `require_review`, con el mismo prompt y herramientas de solo lectura.
- `AskUserQuestion` no existe dentro de subagentes (limitación verificada). Por eso los especialistas devuelven preguntas en `## Bloqueos` y el lead decide si preguntar al humano.
- `revisor` no es un octavo perfil: es el perfil de calidad con modelo fuerte, contexto limpio y solo lectura, como pide el brief ("una nueva sesión o subagente basta").
- Los límites `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3` y `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` los fija el ejecutor por misión.

## 3. Política de delegación (niveles)

| Nivel | Señales | Qué hace el lead | Revisión |
|---|---|---|---|
| **N0** | un archivo o pocos, sin contrato nuevo, prueba existente | directo | no (salvo riesgo) |
| **N1** | una especialidad, varios archivos, pruebas del área | carga el playbook y lo hace directo | `revisor` si riesgo ≥ medio |
| **N2** | dos partes separables (p.ej. API + UI) con contrato claro | 2 encargos en paralelo con archivos propios disjuntos; integra; suite completa | `revisor` si riesgo ≥ medio |
| **N3** | tres o más áreas, contrato nuevo, migración, otro repo | investiga (Explore), fija contratos en `notes.md` y encargos, implementa por unidades integrables, posible misión padre | `revisor` obligatorio |

Riesgo alto automático: datos, auth, migraciones, pagos, acciones sobre sistemas clínicos, cambios transversales. Riesgo alto ⇒ revisión y, en Fase 3, staging real antes de aprobar.

Delegar sí cuando: entrega clara, poca dependencia continua, contexto separable, ventaja real (paralelismo o contexto especializado grande). Delegar no cuando: cambio trivial, dependencia continua con lo que hace el lead, o la investigación no tiene pregunta concreta.

## 4. Encargo (handoff)

Lo redacta `/oficina:handoff <agente> "<objetivo>"` en `.oficina/handoffs/<agente>-<n>.md` (plantilla `office-kit/templates/HANDOFF.md`) y lo pasa íntegro como prompt. Contiene: objetivo · comportamiento esperado · repo y SHA base · contexto (archivos, Graphify, decisiones, pruebas) · alcance y archivos propios · restricciones (contratos intocables, `PORT`) · dependencias y contratos · evidencia requerida (comandos con `oficina-run`) · criterio de finalización · escalamiento · presupuesto. El alcance se escribe en `.oficina/scopes.json` y el hook lo hace cumplir.

## 5. Retorno

Secciones fijas: `Resumen · Cambios · Evidencia · Referencias · Bloqueos · Parcial · Aprendizajes propuestos` (calidad añade `Riesgos pendientes`; revisor usa `Veredicto · Hallazgos · Evidencia · Riesgos pendientes · Parcial`). El lead verifica que cada `ev_...` exista con `exit_code 0` si se declara pass. Si falta algo, `SendMessage` al mismo agente (conserva contexto) pidiendo exactamente lo que falta.

## 6. Comunicación

- Por defecto: lead ⇄ especialista, y artefactos compartidos (`.oficina/notes.md`, encargos, ADRs, memoria).
- Consulta directa entre especialistas: válida si resuelve una dependencia (el lead la autoriza en el encargo y los agentes se mencionan por nombre); la decisión resultante se anota en `notes.md` y, si es compartida, en ADR.
- No hay chat permanente de todos con todos. No hay agent teams en el flujo del ejecutor.

## 7. Ejemplo de misión transversal (del brief)

"Que el asistente recuerde una corrección enseñada por voz y la utilice después al manejar el computador."

1. Lead: `/oficina:mission`. Pregunta (una sola vez): ¿qué se recuerda exactamente (texto corregido, campo del formulario, ambos) y cuándo se aplica (siempre, solo en el mismo tipo de acción)? Registra decisiones.
2. Nivel N3, riesgo medio. Investiga con `Explore`: dónde se capturan correcciones por voz, dónde se persisten recuerdos, dónde se ejecutan acciones. Contrato en `notes.md`: `Correction {source: "voice", target: {action, field}, value, confidence}` y la función `applyCorrections(action)`.
3. Encargos: `memoria-contexto` lidera (persistencia, recuperación, aplicación: archivos propios `src/memory/**`). `computer-use` solo porque cambia la aplicación del recuerdo a la acción (`src/actions/**`). `voz-conversacion` **no** entra: la captura de la enseñanza no cambia. Backend/frontend no entran salvo que haya cambio de esquema o de UI.
4. Lead integra, corre la suite completa con `oficina-run`.
5. `calidad` comprueba el recorrido completo (enseñar por voz → acción usa la corrección → corregir de nuevo → la nueva corrección reemplaza a la anterior) y deja la evaluación repetible.
6. `/oficina:review` → `revisor` da veredicto. `/oficina:evidence` → informe. No se despertó todo el organigrama.

## 8. Dos intentos y escalamiento

Un "intento" es una hipótesis de solución distinta, implementada y probada. Dos fallidos → `blocked` con: qué se intentó, evidencia de cada intento, qué se necesita (decisión, acceso, dependencia, otro repo). Reintentos por red, timeouts del proveedor o cuota no cuentan y los maneja el ejecutor.
