export type ToastKind = 'info' | 'error';

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

const EVENT = 'pv:toast';

export const toast = (message: string, kind: ToastKind = 'info') =>
  window.dispatchEvent(new CustomEvent<ToastDetail>(EVENT, { detail: { message, kind } }));

export const onToast = (cb: (t: ToastDetail) => void) => {
  const handler = (e: Event) => cb((e as CustomEvent<ToastDetail>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
