import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/** Cliente de Supabase para componentes y acciones de servidor (sesión del usuario por cookies; RLS aplica). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión; ignorar.
        }
      },
    },
  });
}

/** Cliente con service role, solo para rutas de ingesta/cron (nunca en componentes). */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createServerClient(SUPABASE_URL, key, { cookies: { getAll() { return []; }, setAll() { /* sin cookies */ } } });
}
