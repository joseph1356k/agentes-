import { Suspense } from 'react';
import LoginForm from '../components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="muted">Cargando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
