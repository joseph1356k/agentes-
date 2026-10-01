export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true cuando las variables apuntan a un proyecto real (no al marcador de posición de la plantilla). */
export const SUPABASE_CONFIGURED = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_URL.includes('pending');
