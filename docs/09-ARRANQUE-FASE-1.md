# Puesta en marcha — de cero a la primera misión

Todo el código está en la rama `claude/gifted-ride-17mywc` (rama por defecto del repo). Estado al 2 de octubre de 2026:

| Pieza | Estado |
|---|---|
| Esquema, seguridad y datos iniciales | listos en `supabase/bootstrap.sql` (migraciones `0001` + `0002` + seed), probados en Postgres 16 con los roles `anon` y `authenticated` |
| Dashboard | compila; solo necesita dos variables públicas (sin service role) |
| Ejecutor | compila, 30 pruebas; login con la misma contraseña del dashboard |
| Organización Supabase | plan **Pro** (ya no hay límite de 2 proyectos) |
| Cuenta Vercel | `itsmiracleai` (Hobby), equipo `team_fpnsSZBsvxmIGtFacwEBpYkc` |
| Lo que el conector no pudo hacer | crear el proyecto Supabase (la llamada caduca a los 60 s esperando aprobación) y crear el proyecto Vercel (rechazado en la ventana de permisos) |

Hay dos caminos. El A es aprobar esas dos acciones y yo hago el resto; el B es hacerlo a mano en unos 10 minutos.

## Camino A: aprobar y que lo haga la sesión

Aprueba en la ventana de permisos, cuando aparezcan:
1. `Supabase · create_project` (`oficina-ia`, `us-east-1`, organización `miracle web site clients`).
2. `Vercel · create_git_project` (`joseph1356k/agentes-`, raíz `dashboard`, proyecto `oficina-ia`).

Con eso aplico `bootstrap.sql`, creo tu usuario owner con una contraseña inicial, pongo las dos variables en Vercel, despliego, compruebo el login y la ingesta, y relleno `config/oficina.public.json` para que el instalador del ejecutor no pida nada.

## Camino B: a mano

### 1. Supabase (4 min)
1. supabase.com → organización `miracle web site clients` → New project → nombre `oficina-ia`, región `us-east-1`.
2. SQL Editor → pega `supabase/bootstrap.sql` completo → Run.
3. En el mismo editor, tu cuenta de owner:
   ```sql
   select public._oficina_set_password('dev@itsmiracleai.com', '<contraseña de al menos 10 caracteres>');
   ```
4. Settings → API: copia `Project URL` y la clave publicable (`sb_publishable_...`) o la `anon`.

No hace falta tocar plantillas de correo ni URLs de redirección: se entra con contraseña.

### 2. Vercel (3 min)
1. vercel.com → Add New → Project → Import `joseph1356k/agentes-`.
2. Root Directory: `dashboard`. Framework: Next.js.
3. Environment Variables (las dos son públicas por diseño):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clave publicable
4. Deploy. Entra con tu correo y la contraseña del paso 1.3 y cámbiala en **Cuenta**.

### 3. Config pública del repo (1 min)
Rellena `config/oficina.public.json` con la URL, la clave publicable y la URL del dashboard, y haz commit. El instalador del ejecutor la usa para que nadie tenga que editar `~/.oficina/config.json`.

## Ejecutor en tu computador (5 min, los dos caminos)

Requisitos: Node 22, pnpm, git, `claude` con sesión iniciada, `gh auth login`, y el monorepo Ü clonado (con `git config core.hooksPath .githooks`).

```bash
git clone https://github.com/joseph1356k/agentes- ~/oficina && cd ~/oficina
bash scripts/install-executor.sh u=~/repos/U-Windows-App miracle-ai=~/repos/Miracle-AI
oficina-executor login        # correo y contraseña del dashboard
oficina-executor register     # registra este computador y enlaza los repos
oficina-executor doctor       # claude, gh, git, graphify, repos, portero, acceso a la cola
oficina-executor start        # o: pm2 start "oficina-executor start" --name oficina && pm2 save
```

## Equipo

En **Equipo** un owner da de alta a cada persona con una contraseña inicial; la persona la cambia en **Cuenta**. Solo los correos de esa lista pueden tener cuenta: el registro está cerrado en la base. En la misma página se genera el token de ingesta de producción (se muestra una vez; la base guarda su hash) con el `curl` de ejemplo.

## Primera misión real (valida el recorrido completo)

Dashboard → Nueva misión: repo `u`, proyecto `apps/web` (Miracle Notes), tipo `inventory`, título "Inventario de Miracle Notes", objetivo "Mapa real del proyecto apps/web: comandos verificados con oficina-run, pruebas existentes, recorridos críticos, integraciones y áreas", prioridad 80, encolar.

Qué debe pasar:
1. El ejecutor la reclama en segundos; en el detalle aparecen `init` (plugins incluye `oficina`, facturación `subscription`), `workspace` (rama `oficina/inventario-de-miracle-notes-<id>`), mensajes del tech lead y eventos de herramientas.
2. Si el tech lead pregunta, la pregunta aparece en el detalle; responde y la misión continúa (o se difiere y se reanuda si tardas más de 15 minutos).
3. Al terminar: verificación independiente en verde, estado `review`, informe con `tests[]` y evidencia subida, PR creado, `docs/oficina/REPO.md` y `docs/oficina/areas/*.md` en la rama.
4. Cerrar el navegador durante la misión no cambia nada; `oficina-executor status` muestra la misión.

Si algo falla, el motivo queda en `status_reason` y en los eventos. Después: inventario de `services/graph` y de `miracle-ai`, una misión N0 real (un bug pequeño), una N2 (dos especialistas) y una `epic` pequeña para probar spec y sub-misiones. Con `claude login` en la máquina, `node evals/run.mjs` mide los prompts y modelos por defecto.
