import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError } from '../lib/errors';
import { reloadTables } from '../lib/useTable';

/**
 * Si algo falla al pintar, muestra qué ha pasado y cómo seguir en lugar de dejar la página en blanco.
 * `scope` dice qué parte ha fallado: con una pestaña, el resto de la app (menú, asistente) sigue funcionando.
 */
export default class ErrorBoundary extends Component<{ scope?: string; children: ReactNode }, { error: unknown; copied: boolean }> {
  state = { error: null as unknown, copied: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, copied: false };
  }

  /** Muchos fallos vienen de los datos: se vuelven a pedir antes de pintar otra vez. */
  async retry() {
    await reloadTables();
    this.setState({ error: null });
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Error en la app:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { title, advice, technical } = describeError(this.state.error);
    const details = `${technical}\nDónde: ${this.props.scope ?? 'la app'}\nPágina: ${window.location.href}\nNavegador: ${navigator.userAgent}`;

    return (
      <section className={`error-screen ${this.props.scope ? 'is-inline' : ''}`} role="alert">
        <span className="error-icon" aria-hidden>
          ⚠️
        </span>
        <h2>{title}</h2>
        <p>{advice}</p>
        {this.props.scope && <p className="muted small">Solo ha fallado {this.props.scope}; el resto de la app sigue funcionando.</p>}
        <div className="row center wrap">
          {this.props.scope && (
            <button type="button" className="btn ghost" onClick={() => void this.retry()}>
              Volver a intentar
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Recargar la página
          </button>
        </div>
        <details className="small">
          <summary>Detalles técnicos</summary>
          <pre>{details}</pre>
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              void navigator.clipboard?.writeText(details).then(
                () => this.setState({ copied: true }),
                () => undefined,
              )
            }
          >
            {this.state.copied ? 'Copiado ✓' : 'Copiar detalles'}
          </button>
        </details>
      </section>
    );
  }
}
