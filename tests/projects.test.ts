// Pruebas de los tipos de proyecto y sus cálculos (src/lib/projectKinds.ts, src/lib/projects.ts).
// Uso: npm run test:lib

import { PROJECT_KIND_IDS } from '../supabase/functions/assistant/projectKinds.ts';
import { blockKind } from '../src/lib/blockKinds.ts';
import { COLS } from '../src/lib/layout.ts';
import { cleanFields, keyDateOf, projectKind, projectPageSeed, PROJECT_KINDS, visibleFields } from '../src/lib/projectKinds.ts';
import {
  budgetOf,
  burnup,
  focusTasks,
  healthOf,
  nextStep,
  progressOf,
  streakStats,
  tasksDonePerWeek,
  totalHours,
  valueProgress,
  weeklySum,
  type ProjectData,
} from '../src/lib/projects.ts';
import type { Project, ProjectItem, ProjectLog, Task, Transaction } from '../src/lib/types.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const TODAY = '2026-10-18'; // domingo
/** Marca de tiempo de un día a mediodía (hora local). */
const at = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};
const NOW = new Date(2026, 9, 18, 18).getTime();

const project = (extra: Partial<Project> = {}): Project => ({
  id: 'p',
  name: 'Proyecto',
  description: '',
  status: 'activo',
  color: '#000',
  kind: 'general',
  fields: {},
  created_at: at('2026-09-01'),
  last_activity_at: at('2026-10-17'),
  ...extra,
});
let n = 0;
const task = (extra: Partial<Task> = {}): Task => ({
  id: `t${n++}`,
  project_id: 'p',
  title: `Tarea ${n}`,
  status: 'pendiente',
  priority: 'media',
  due_date: null,
  created_at: at('2026-10-01'),
  ...extra,
});
const item = (extra: Partial<ProjectItem> = {}): ProjectItem => ({
  id: `i${n++}`,
  project_id: 'p',
  parent_id: null,
  kind: 'recurso',
  title: `Elemento ${n}`,
  body: '',
  url: null,
  image_url: null,
  status: 'pendiente',
  file_path: null,
  file_size: null,
  file_type: '',
  sort_order: n,
  created_at: at('2026-10-01'),
  ...extra,
});
const log = (kind: string, date: string, value = 0): ProjectLog => ({ id: `l${n++}`, project_id: 'p', kind, date, value, note: '', created_at: at(date) });
const data = (extra: Partial<ProjectData> = {}): ProjectData => ({ tasks: [], items: [], logs: [], ...extra });

// ---------------------------------------------------------------- Configuración de los tipos

ok(new Set(PROJECT_KINDS.map((k) => k.id)).size === PROJECT_KINDS.length, 'cada tipo tiene un id distinto');
ok(PROJECT_KINDS.every((k) => /^[a-z][a-z0-9_]{0,39}$/.test(k.id)), 'los ids de tipo tienen la forma que exige la base de datos');
const badBlocks = PROJECT_KINDS.flatMap((k) => k.blocks.filter((b) => !blockKind(b.type) || b.x + b.w > COLS).map((b) => `${k.id}:${b.type}`));
ok(badBlocks.length === 0, `la plantilla de cada tipo usa bloques que existen y caben en la rejilla ${badBlocks.join(', ')}`);
ok(PROJECT_KINDS.every((k) => k.blocks.some((b) => b.type === 'proyecto_resumen')), 'todas las plantillas empiezan con el resumen del proyecto');
ok(PROJECT_KINDS.every((k) => !k.keyDate || k.fields.some((f) => f.key === k.keyDate!.field && f.type === 'date')), 'la fecha clave de cada tipo es uno de sus campos de fecha');
ok(JSON.stringify([...PROJECT_KIND_IDS].sort()) === JSON.stringify(PROJECT_KINDS.map((k) => k.id).sort()), 'el asistente conoce los mismos tipos que la app');
ok(projectKind('no_existe').id === 'general' && projectKind(undefined).id === 'general', 'un tipo desconocido se trata como «General»');

const reto = projectKind('reto');
ok(visibleFields(reto, {}).every((f) => f.key !== 'veces'), '«veces por semana» no se pide si la frecuencia es diaria (por defecto)');
ok(visibleFields(reto, { frecuencia: 'semanal' }).some((f) => f.key === 'veces'), 'y sí si es semanal');
ok(JSON.stringify(cleanFields(reto, { frecuencia: 'semanal', veces: '3', fin: '' })) === '{"frecuencia":"semanal","veces":3}', 'los números se guardan como número y los vacíos no se guardan');
ok(JSON.stringify(cleanFields(reto, { frecuencia: 'diaria', veces: '3' })) === '{"frecuencia":"diaria"}', 'un campo que no toca no se guarda');
const pro = cleanFields(projectKind('profesional'), { cliente: '  Acme  ', entrega: '18/10/2026', horas_estimadas: '12,5' });
ok(pro.cliente === 'Acme' && pro.entrega === undefined && pro.horas_estimadas === 12.5 && pro.fase === 'propuesta', `campos de un profesional: ${JSON.stringify(pro)}`);
ok(cleanFields(projectKind('creativo'), { fase: 'boceto' }).fase === 'boceto', 'la fase elegida se guarda');
ok(cleanFields(projectKind('creativo'), { fase: 'inventada' }).fase === 'idea', 'una fase que no existe vuelve a la primera');

const seed = projectPageSeed({ id: 'abc', name: 'Un nombre larguísimo que no cabe en el menú de páginas, de verdad', kind: 'estudios' });
ok(seed.project_id === 'abc' && seed.icon === '🎓' && seed.name.length <= 40, 'la página de un proyecto lleva su id, el icono de su tipo y un nombre que cabe');
ok(seed.blocks.length > 0 && seed.blocks.every((b) => b.content.project === 'abc'), 'todos sus bloques quedan fijados al proyecto');
ok(seed.blocks.some((b) => b.type === 'proyecto_temario'), 'y son los de su tipo (estudios → temario)');
ok(projectKind('estudios').blocks[0].content.project === undefined, 'sin tocar la plantilla del tipo');

ok(keyDateOf(project({ kind: 'viaje', fields: { inicio: '2026-12-01' } }))?.label === 'Salida', 'la fecha clave de un viaje es la salida');
ok(keyDateOf(project({ kind: 'viaje', fields: {} })) === null && keyDateOf(project({ kind: 'hogar' })) === null, 'sin fecha rellena (o sin fecha en su tipo), no hay cuenta atrás');

// ---------------------------------------------------------------- Foco de hoy

const paused = project({ id: 'q', status: 'pausado' });
const a = task({ title: 'vencida baja', priority: 'baja', due_date: '2026-10-10' });
const b = task({ title: 'hoy', due_date: TODAY });
const c = task({ title: 'alta sin fecha', priority: 'alta' });
const d = task({ title: 'mañana', due_date: '2026-10-19' });
const e = task({ title: 'mañana en curso', due_date: '2026-10-19', status: 'en_curso' });
const f = task({ title: 'de un pausado', project_id: 'q', priority: 'alta', due_date: '2026-10-01' });
const g = task({ title: 'hecha', status: 'hecha', priority: 'alta' });
const h = task({ title: 'suelta', project_id: null, priority: 'baja' });
const focus = focusTasks([d, h, g, f, e, c, b, a], [project(), paused], TODAY).map((t) => t.title);
ok(
  focus.join(' | ') === 'vencida baja | hoy | alta sin fecha | mañana en curso | mañana | suelta',
  `foco: vencidas, hoy, prioridad, fecha y en curso primero; sin proyectos pausados ni hechas (${focus.join(' | ')})`,
);

// ---------------------------------------------------------------- Progreso

ok(progressOf(project(), data({ tasks: [task(), task({ status: 'hecha' })] }), TODAY).label === '1/2 tareas', 'progreso por tareas');
ok(progressOf(project(), data(), TODAY).value === 0, 'sin tareas, 0 %');

const m1 = item({ kind: 'modulo', title: 'Módulo 1' });
const m2 = item({ kind: 'modulo', title: 'Módulo 2', status: 'hecho' });
const temario = [m1, m2, item({ kind: 'tema', parent_id: m1.id, status: 'hecho' }), item({ kind: 'tema', parent_id: m1.id, title: 'IAM' })];
const study = project({ kind: 'estudios' });
const pStudy = progressOf(study, data({ items: temario }), TODAY);
ok(pStudy.value === 75 && pStudy.label === '1/2 temas', `temario: la media de sus módulos (${JSON.stringify(pStudy)})`);
ok(nextStep(study, data({ items: temario }), TODAY) === 'Siguiente tema: IAM', 'el siguiente paso es el primer tema pendiente');

const res = [item({ status: 'hecho' }), item({ status: 'en_curso', title: 'Duolingo' }), item()];
const learning = project({ kind: 'aprendizaje' });
ok(progressOf(learning, data({ items: res }), TODAY).value === 33, 'aprendizaje: recursos terminados');
ok(nextStep(learning, data({ items: res }), TODAY) === 'Ahora: Duolingo', 'y el siguiente paso es el que está en curso');

ok(progressOf(project({ kind: 'creativo', fields: { fase: 'produccion' } }), data(), TODAY).value === 67, 'creativo: la fase alcanzada (producción = 2 de 3 pasos)');
ok(nextStep(project({ kind: 'creativo', fields: { fase: 'produccion' } }), data(), TODAY) === 'Siguiente fase: Publicado', 'y la siguiente fase');

const weight = project({ kind: 'salud', fields: { unidad: 'kg', inicial: 90, objetivo: 80 } });
const weights = [log('valor', '2026-10-01', 88), log('valor', '2026-10-15', 85)];
const vp = valueProgress(weight, weights);
ok(vp.current === 85 && vp.left === 5 && vp.ratio === 0.5, `objetivo que baja: de 90 a 80, en 85 → 50 %, faltan 5 (${JSON.stringify(vp)})`);
ok(nextStep(weight, data({ logs: weights }), TODAY) === 'Faltan 5 kg', 'siguiente paso: lo que falta');
const run = valueProgress(project({ kind: 'salud', fields: { inicial: 0, objetivo: 10 } }), [log('valor', '2026-10-10', 12)]);
ok(run.ratio === 1 && run.left === 0, 'objetivo que sube y se supera: 100 %, no falta nada');
ok(valueProgress(project({ kind: 'salud', fields: { objetivo: 70 } }), [log('valor', '2026-10-02', 75), log('valor', '2026-10-09', 72)]).ratio === 0.6, 'sin valor inicial, se parte del primer registro');

// ---------------------------------------------------------------- Retos

const daily = new Set(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-16', '2026-10-17', '2026-10-18']);
const sd = streakStats(project({ kind: 'reto' }), daily, TODAY);
ok(sd.current === 3 && sd.best === 3 && sd.doneToday && sd.unit === 'día', `reto diario: racha 3, mejor 3 (${JSON.stringify(sd)})`);
const fresh = streakStats(project({ kind: 'reto', created_at: at('2026-10-16') }), daily, TODAY);
ok(fresh.adherence > 0.6 && fresh.adherence <= 1, `la constancia cuenta desde el primer día marcado aunque el reto se creara después (${fresh.adherence.toFixed(2)})`);
const notToday = streakStats(project({ kind: 'reto', created_at: at('2026-10-15') }), new Set(['2026-10-15', '2026-10-16', '2026-10-17']), TODAY);
ok(notToday.current === 3 && notToday.adherence === 1, 'hoy sin marcar aún no rompe la racha ni baja la constancia');

const weekly = new Set(['2026-09-22', '2026-09-23', '2026-09-29', '2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
const sw = streakStats(project({ kind: 'reto', fields: { frecuencia: 'semanal', veces: 2 } }), weekly, TODAY);
ok(sw.unit === 'semana' && sw.current === 2 && sw.best === 2 && sw.done === 2 && sw.target === 2, `reto de 2 veces por semana: 2 semanas seguidas (${JSON.stringify(sw)})`);
ok(Math.abs(sw.adherence - 0.7) < 1e-9, `constancia: 4 semanas anteriores + esta (${sw.adherence})`);
ok(progressOf(project({ kind: 'reto', fields: { frecuencia: 'semanal', veces: 2 } }), data({ logs: [...weekly].map((dd) => log('check', dd)) }), TODAY).label === '🔥 2 semanas', 'la tarjeta muestra la racha');

// ---------------------------------------------------------------- Semáforo

ok(healthOf(project({ status: 'pausado' }), data(), TODAY, NOW).level === 'gris', 'pausado: gris');
ok(healthOf(project({ status: 'completado' }), data(), TODAY, NOW).reason === 'Terminado', 'terminado: gris');
const red = healthOf(project(), data({ tasks: [task({ due_date: '2026-10-17' }), task({ due_date: '2026-10-01' })] }), TODAY, NOW);
ok(red.level === 'rojo' && red.reason === '2 tareas vencidas', 'tareas vencidas: rojo');
ok(healthOf(project(), data({ tasks: [task({ status: 'hecha' })] }), TODAY, NOW).reason === 'Sin tareas pendientes', 'sin tareas pendientes: amarillo');
const stale = project({ last_activity_at: at('2026-10-08'), created_at: at('2026-09-01') });
const idle = healthOf(stale, data({ tasks: [task({ created_at: at('2026-10-01') })] }), TODAY, NOW);
ok(idle.level === 'amarillo' && idle.reason === 'Sin actividad en 10 días', `sin actividad en 7 días o más: amarillo (${idle.reason})`);
ok(healthOf(stale, data({ tasks: [task({ created_at: at('2026-10-17') })] }), TODAY, NOW).level === 'verde', 'una tarea reciente cuenta como actividad aunque el proyecto no se haya recargado');
ok(healthOf(project({ kind: 'reto' }), data(), TODAY, NOW).level === 'verde', 'un reto sin tareas no se pone amarillo por no tener tareas');
ok(healthOf(project(), data({ tasks: [task()] }), TODAY, NOW).level === 'verde', 'con tareas pendientes y actividad reciente: verde');

// ---------------------------------------------------------------- Siguiente paso

ok(nextStep(project(), data({ tasks: [task({ title: 'Después' }), task({ title: 'Urgente', due_date: '2026-10-15' })] }), TODAY)?.startsWith('Urgente · venció el'), 'el siguiente paso es la tarea más prioritaria');
ok(nextStep(project({ kind: 'reto' }), data({ logs: [log('check', TODAY)] }), TODAY) === 'Hoy ya está ✓', 'reto marcado hoy');
ok(nextStep(project(), data(), TODAY) === 'Añade la primera tarea', 'proyecto vacío');

// ---------------------------------------------------------------- Gráficos

const hours = weeklySum([{ date: '2026-10-12', value: 2 }, { date: '2026-10-18', value: 1.5 }, { date: '2026-10-05', value: 3 }, { date: '2026-08-01', value: 9 }], 3, TODAY);
ok(JSON.stringify(hours) === JSON.stringify([{ week: '2026-09-28', value: 0 }, { week: '2026-10-05', value: 3 }, { week: '2026-10-12', value: 3.5 }]), `suma por semanas: ${JSON.stringify(hours)}`);
ok(totalHours([log('horas', '2026-10-01', 1.25), log('horas', '2026-10-02', 2), log('valor', '2026-10-02', 80)]) === 3.25, 'total de horas (sin otros registros)');

const done1 = task({ status: 'hecha', created_at: at('2026-10-01'), completed_at: at('2026-10-06') });
const done2 = task({ status: 'hecha', created_at: at('2026-10-07'), completed_at: at('2026-10-14') });
const open1 = task({ created_at: at('2026-10-13') });
const perWeek = tasksDonePerWeek([done1, done2, open1], 2, TODAY);
ok(perWeek[0].value === 1 && perWeek[1].value === 1, 'tareas hechas por semana');
const bu = burnup([done1, done2, open1], 3, TODAY);
ok(
  JSON.stringify(bu) === JSON.stringify([{ week: '2026-09-28', creadas: 1, hechas: 0 }, { week: '2026-10-05', creadas: 2, hechas: 1 }, { week: '2026-10-12', creadas: 3, hechas: 2 }]),
  `avance acumulado: ${JSON.stringify(bu)}`,
);

const tx = (amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id: `x${n++}`, date: TODAY, type: 'gasto', amount, category_id: 'c', note: '', project_id: 'p', ...extra });
const bud = budgetOf(project({ fields: { presupuesto: 1000 } }), [tx(300), tx(250.5), tx(99, { project_id: 'otro' }), tx(1000, { type: 'ingreso' })]);
ok(bud.spent === 550.5 && bud.left === 449.5 && bud.own.length === 2, 'presupuesto: solo los gastos de ese proyecto');
ok(budgetOf(project(), []).left === null, 'sin presupuesto no hay «lo que queda»');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
