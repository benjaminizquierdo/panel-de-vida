import { lazy, Suspense, useEffect, useState } from 'react';
import { backend } from './backend';
import Assistant from './components/Assistant';
import Auth from './components/Auth';
import Toaster from './components/Toaster';
import { isTabId, TABS, type TabId } from './lib/tabs';
import type { User } from './lib/types';
import Home from './pages/Home';

// Las pestañas con gráficos arrastran recharts: se cargan al abrirlas.
const Projects = lazy(() => import('./pages/Projects'));
const Habits = lazy(() => import('./pages/Habits'));
const Goals = lazy(() => import('./pages/Goals'));
const Finance = lazy(() => import('./pages/Finance'));

// La última pestaña abierta se recuerda por usuario, para que otra cuenta en el mismo navegador empiece en Inicio.
const tabKey = (userId: string) => `pv:tab:${userId}`;

const readTab = (userId: string): TabId => {
  try {
    const v = localStorage.getItem(tabKey(userId));
    return isTabId(v) ? v : 'inicio';
  } catch {
    return 'inicio';
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>('inicio');

  useEffect(() => {
    const applyUser = (u: User | null) => {
      setUser(u);
      if (u) setTab(readTab(u.id));
    };
    void backend.getUser().then((u) => {
      applyUser(u);
      setReady(true);
    });
    return backend.onAuthChange(applyUser);
  }, []);

  const go = (t: TabId) => {
    setTab(t);
    try {
      if (user) localStorage.setItem(tabKey(user.id), t);
    } catch {
      // Sin almacenamiento disponible: la pestaña simplemente no se recuerda.
    }
    window.scrollTo({ top: 0 });
  };

  if (!ready) return <div className="splash">Cargando…</div>;

  if (!user) {
    return (
      <>
        <Auth />
        <Toaster />
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Panel de Vida</span>
          {backend.mode === 'local' && <span className="badge">demo</span>}
        </div>
        <div className="topbar-user">
          <span className="muted user-name">{user.name}</span>
          <button className="btn ghost" onClick={() => void backend.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      {/* key = user.id: al cambiar de cuenta se desmonta todo y no quedan datos del usuario anterior. */}
      <main className="content" key={`${user.id}:${tab}`}>
        <Suspense fallback={<p className="empty">Cargando…</p>}>
          {tab === 'inicio' && <Home user={user} go={go} />}
          {tab === 'proyectos' && <Projects />}
          {tab === 'habitos' && <Habits />}
          {tab === 'objetivos' && <Goals />}
          {tab === 'finanzas' && <Finance />}
        </Suspense>
      </main>

      <Assistant key={user.id} user={user} />
      <Toaster />
    </div>
  );
}
