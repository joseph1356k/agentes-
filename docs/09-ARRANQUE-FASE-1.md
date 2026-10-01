# Arranque de la Fase 1 — lo que falta y quién lo hace

Todo el código y la configuración están en la rama `claude/gifted-ride-17mywc`. Quedan tres acciones que requieren una cuenta humana o un computador del equipo. En total, unos 20 minutos.

## 1. Proyecto Supabase `oficina-ia` (5 min)

Bloqueo verificado: la organización `miracle web site clients` está en plan **free** y el usuario `joseph1356k` tiene 2 proyectos activos (`miracle-app`, `medicion-interna`), el máximo del plan. Mensaje textual de Supabase: "these users will need to either delete, pause or upgrade one or more of these projects".

Elige una:
- **Subir la organización a Pro** (≈ 25 USD/mes, incluye créditos de cómputo). Luego crear el proyecto `oficina-ia`, región `us-east-1`.
- **Pausar un proyecto activo** que no sea producción (por ejemplo `medicion-interna`, si no está en uso) y crear `oficina-ia` en el plan free.

Después, en el editor SQL del proyecto (o con `supabase db push`):
1. Pegar y ejecutar `supabase/migrations/0001_oficina.sql`.
2. Pegar y ejecutar `supabase/seed.sql` (añade tu correo como `owner`, los repos `u` y `miracle-ai`, y el bucket `evidence`). Edita el correo si no es `dev@itsmiracleai.com`.
3. En Authentication → Providers → Email: dejar activo el enlace mágico/OTP. En Authentication → URL configuration: añadir la URL del dashboard (`https://oficina-ia.vercel.app/auth/callback`) a las redirecciones permitidas.
4. Copiar `Project URL` y `anon key` (Settings → API).

Si prefieres, dime "proyecto creado" y aplico migración y seed desde aquí con el conector de Supabase.

## 2. Dashboard en Vercel (3 min)

El conector de Vercel de esta sesión puede leer el equipo pero no crear proyectos (403 "re-authenticate to this scope"). Importar desde la interfaz:
1. Vercel → Add New → Project → Import `joseph1356k/agentes-`.
2. Root Directory: `dashboard`. Framework: Next.js (detectado). Production Branch: `claude/gifted-ride-17mywc` (o `main` cuando se mezcle).
3. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (del paso 1), `SUPABASE_SERVICE_ROLE_KEY` (solo para la ingesta), `INGEST_TOKEN` (una cadena aleatoria larga; es la que enviarán los productos en `Authorization: Bearer`).
4. Deploy. La URL resultante va en `dashboard_url` de la config de cada ejecutor.

Alternativa: volver a autorizar el conector de Vercel con alcance del equipo y pedirme que cree el proyecto.

## 3. Ejecutor en tu computador (10 min)

Requisitos: Node 22, pnpm, git, `claude` con `/login` hecho con tu cuenta, `gh auth login` hecho, y el monorepo Ü clonado (con `git config core.hooksPath .githooks` como pide su README).

```bash
git clone https://github.com/joseph1356k/agentes- ~/oficina && cd ~/oficina && git switch claude/gifted-ride-17mywc
bash scripts/install-executor.sh ~/repos/U-Windows-App     # kit enlazado, ejecutor compilado, lanzador y config
# edita ~/.oficina/config.json: supabase_url, supabase_anon_key, dashboard_url, repos[].path
oficina-executor login        # enlace/código por correo
oficina-executor register     # registra este computador y sus repos
oficina-executor doctor       # claude, gh, git, graphify, repos, portero, acceso a la cola
oficina-executor start        # o: pm2 start "oficina-executor start" --name oficina && pm2 save
```

## 4. Primera misión real (la que valida el recorrido completo)

En el dashboard → Nueva misión:
- Repo `u`, proyecto `apps/web` (Miracle Notes), tipo `inventory`, título "Inventario de Miracle Notes", objetivo "Mapa real del proyecto apps/web: comandos verificados con oficina-run, pruebas existentes, recorridos críticos, integraciones y áreas", prioridad 80, encolar.

Qué debe pasar (criterio de aceptación de la Fase 1):
1. El ejecutor la reclama en segundos; en el detalle aparecen `init` (plugins incluye `oficina`, facturación `subscription`), `workspace` (rama `oficina/inventario-de-miracle-notes-<id>`), mensajes del tech lead y eventos de herramientas.
2. Si el tech lead pregunta, la pregunta aparece en el detalle; responde y la misión continúa (o se difiere y se reanuda si tardas más de 15 minutos).
3. Al terminar: estado `review`, informe con `tests[]` y evidencia subida (`ev_...` con exit 0), PR creado con el cuerpo del informe, `docs/oficina/REPO.md` y `docs/oficina/areas/*.md` en la rama.
4. Cerrar el navegador durante la misión no cambia nada; `oficina-executor status` muestra la misión.

Si algo falla, el motivo queda en `status_reason` y en los eventos. Las dos cosas que no pude verificar desde este entorno y que esta misión confirma: el comportamiento de `defer`/reanudación de `AskUserQuestion` y la salida estructurada del informe (`docs/04-EJECUTOR.md` §9).

## 5. Después

Repetir la misión de inventario para `services/graph` y para `miracle-ai`; luego una misión N0 real (un bug pequeño) y una N2 (dos especialistas). Con eso la Fase 1 queda aceptada y empieza la Fase 2.
