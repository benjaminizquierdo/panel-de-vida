import { useEffect, useState } from 'react';
import { backend } from './backend';
import Auth from './components/Auth';
import ErrorBoundary from './components/ErrorBoundary';
import Toaster from './components/Toaster';
import Workspace from './components/Workspace';
import { notifyDataChanged } from './lib/events';
import { toast } from './lib/toast';
import type { User } from './lib/types';
import { today } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void backend.getUser().then((u) => {
      setUser(u);
      setReady(true);
    });
    return backend.onAuthChange(setUser);
  }, []);

  // Respaldo de la tarea diaria del servidor: al entrar, crea los periódicos que ya tocan.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    backend
      .generateRecurring(today())
      .then((n) => {
        if (n > 0) {
          toast(`${n} ${n === 1 ? 'movimiento periódico añadido' : 'movimientos periódicos añadidos'}`);
          notifyDataChanged();
        }
      })
      .catch((e) => console.warn('No se han podido generar los periódicos:', e));
  }, [userId]);

  if (!ready) return <div className="splash">Cargando…</div>;

  return (
    <>
      {user ? (
        // key = user.id: al cambiar de cuenta se desmonta todo y no quedan datos del usuario anterior.
        <ErrorBoundary key={user.id} scope="la carga de tus categorías">
          <Workspace user={user} />
        </ErrorBoundary>
      ) : (
        <Auth />
      )}
      <Toaster />
    </>
  );
}
