// Aviso global de que los datos han cambiado fuera de la pestaña actual (p. ej. el
// asistente ha registrado algo), para que las tablas visibles se recarguen.

const EVENT = 'pv:data-changed';

export const notifyDataChanged = () => window.dispatchEvent(new Event(EVENT));

export const onDataChanged = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
