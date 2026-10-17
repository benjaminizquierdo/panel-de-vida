import { useEffect, useState } from 'react';
import { onToast, type ToastDetail } from '../lib/toast';

export default function Toaster() {
  const [items, setItems] = useState<(ToastDetail & { id: number })[]>([]);

  useEffect(
    () =>
      onToast((t) => {
        const id = Date.now() + Math.random();
        setItems((prev) => [...prev, { ...t, id }]);
        setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4500);
      }),
    [],
  );

  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
