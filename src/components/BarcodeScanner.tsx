import { useEffect, useRef, useState } from 'react';
import { isValidBarcode } from '../lib/nutrition';
import Sheet from './Sheet';

/** Lector nativo de códigos (Chrome en Android, Safari en macOS…); no está en todos los navegadores. */
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => NativeDetector;
  }
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/**
 * Lee un código de barras con la cámara. Usa el lector del navegador si lo hay y, si no, ZXing
 * (que solo se descarga al abrir la cámara). También se puede escribir el código a mano.
 */
export default function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const found = (code: string) => {
      if (stopped || !isValidBarcode(code)) return false;
      stopped = true;
      navigator.vibrate?.(60);
      onCodeRef.current(code);
      return true;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext ? 'Este navegador no puede usar la cámara.' : 'La cámara solo funciona en una dirección segura (https).');
      }
      const el = video.current!;
      if (window.BarcodeDetector) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        el.srcObject = stream;
        await el.play();
        setStatus('scanning');
        const detector = new window.BarcodeDetector({ formats: FORMATS });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(el);
            if (codes.some((c) => found(c.rawValue))) return;
          } catch {
            // Fotograma sin imagen todavía: se reintenta.
          }
          timer = setTimeout(tick, 200);
        };
        void tick();
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, el, (result) => {
          if (result && found(result.getText())) controls.stop();
        });
        stopZxing = () => controls.stop();
        if (stopped) stopZxing();
        else setStatus('scanning');
      }
    })().catch((e: unknown) => {
      if (stopped) return;
      const name = e instanceof Error ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'No has dado permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código.'
          : name === 'NotFoundError'
            ? 'No se encuentra ninguna cámara. Escribe el código de barras.'
            : e instanceof Error && e.message
              ? e.message
              : 'No se ha podido abrir la cámara.',
      );
      setStatus('error');
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submitTyped = () => {
    const code = typed.replace(/\D/g, '');
    if (!/^\d{6,14}$/.test(code)) return setError('El código de barras son los 8 o 13 números de debajo de las barras.');
    onCode(code);
  };

  return (
    <Sheet title="Escanear código de barras" onClose={onClose}>
      <div className="stack">
        {status !== 'error' && (
          <div className="scanner">
            <video ref={video} muted playsInline aria-label="Vista de la cámara" />
            <span className="scanner-frame" aria-hidden />
            <p className="scanner-hint small">{status === 'starting' ? 'Abriendo la cámara…' : 'Apunta al código de barras del envase'}</p>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitTyped();
          }}
        >
          <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="O escríbelo: 8480000123456" aria-label="Código de barras" maxLength={20} />
          <button className="btn ghost sm" disabled={!typed.trim()}>
            Buscar
          </button>
        </form>
      </div>
    </Sheet>
  );
}
