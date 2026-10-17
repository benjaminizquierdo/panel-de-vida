import { useState, type FormEvent } from 'react';
import { backend } from '../backend';

type Mode = 'entrar' | 'registro';

export default function Auth() {
  const [mode, setMode] = useState<Mode>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'registro') {
        const { needsConfirmation } = await backend.signUp(email, password, name);
        if (needsConfirmation) {
          setNotice('Te hemos enviado un email para confirmar la cuenta. Ábrelo y después inicia sesión.');
          setMode('entrar');
        }
      } else {
        await backend.signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="auth">
      <div className="auth-card card">
        <div className="brand brand-lg">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <span>Panel de Vida</span>
        </div>
        <p className="muted">Proyectos, hábitos, objetivos y finanzas en un solo lugar. Tus datos solo los ves tú.</p>

        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'entrar'} onClick={() => switchTo('entrar')}>
            Iniciar sesión
          </button>
          <button type="button" role="tab" aria-selected={mode === 'registro'} onClick={() => switchTo('registro')}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === 'registro' && (
            <label className="field">
              <span>Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Cómo quieres que te llamemos" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'registro' ? 'new-password' : 'current-password'}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'registro' ? 'Crear cuenta' : 'Entrar'}
          </button>
        </form>

        {backend.mode === 'local' && (
          <p className="demo-note">
            <strong>Modo demo:</strong> no hay servidor configurado, así que las cuentas y los datos se guardan solo en este navegador.
            Configura Supabase (ver README) para usarlo en serio.
          </p>
        )}
      </div>
    </div>
  );
}
