# @oficina/dashboard

Dashboard v0 de la oficina: tablero de misiones en vivo, intake, detalle de misión (chat con el tech lead, preguntas, evidencia, informe, acciones y aprobación por SHA), ejecutores, tickets y la ruta de ingesta de feedback. Next.js 15 (App Router) + Supabase (`@supabase/ssr`, Realtime). Sin credenciales de modelo ni de repos.

```bash
pnpm install
cp .env.example .env.local   # URL y anon key del proyecto oficina-ia
pnpm dev                     # http://localhost:3200
pnpm build
```

Despliegue: proyecto Vercel `oficina-ia` con `rootDirectory = dashboard` y solo dos variables públicas, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sin service role; el token de ingesta se genera en `/team` y la base guarda su hash). Las tareas periódicas (huérfanas cada minuto, triage cada 3 h) viven en `pg_cron` dentro de Supabase, no en Vercel.

Mientras Supabase no esté configurado, el dashboard muestra su estructura con un aviso en lugar de fallar.
