# ADR-003 · Supabase (proyecto separado) + Next.js en Vercel

Estado: accepted · 2026-10-01

## Contexto
Hace falta cola persistente, estado recuperable, visibilidad en vivo, archivos de evidencia, acceso del equipo y tareas programadas, con la menor infraestructura posible. El equipo ya usa Supabase y Vercel.

## Decisión
Un proyecto Supabase nuevo `oficina-ia` (Postgres + Realtime + Storage + Auth + pg_cron) y un proyecto Vercel `oficina-ia` con Next.js. Nunca el proyecto `miracle-app`.

## Justificación
Una sola pieza cubre todo; RLS da el control de acceso; Realtime da el dashboard en vivo; pg_cron maneja huérfanas; Storage guarda evidencia. Separación por datos clínicos y por riesgo operativo.

## Consecuencias
Crear el proyecto es un acto facturable: lo aprueba un humano (Fase 1). Sin ejecutor encendido, las misiones esperan en la cola (explícito en el brief).
