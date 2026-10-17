import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { describeError } from './lib/errors';
import { toast } from './lib/toast';
import './styles.css';

// Fallos fuera del pintado (promesas sin capturar, eventos): un aviso con la explicación en lugar de nada.
// Solo los de la propia app: los de extensiones del navegador u otras webs no son asunto nuestro.
const report = (error: unknown) => {
  const { title, advice } = describeError(error);
  console.error(error);
  toast(`${title} ${advice}`, 'error');
};
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof Error) report(e.reason);
});
window.addEventListener('error', (e) => {
  if (e.error instanceof Error && e.filename?.startsWith(window.location.origin)) report(e.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
