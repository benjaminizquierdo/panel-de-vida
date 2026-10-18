import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_LABEL } from '../../components/ProjectSheet';
import { Empty } from '../../components/ui';
import { filterValue } from '../../lib/blockKinds';
import { fieldNumber, fieldText, kindOf, PROJECT_KINDS } from '../../lib/projectKinds';
import { burnup, tasksDonePerWeek, totalHours, valueLogs, weeklySum } from '../../lib/projects';
import type { ProjectStatus } from '../../lib/types';
import { tooltipStyle, useChartColors } from '../../lib/useChartColors';
import { pickProject, useProjectData } from '../../lib/useProjects';
import { useTable } from '../../lib/useTable';
import { fmtDate, num, today } from '../../lib/utils';
import type { BlockProps } from '..';
import { NoProject, ProjectLabel } from './projects';

const WEEKS = 8;
const MARGIN = { top: 8, right: 8, left: -16, bottom: 0 };

/** Proyecto elegido en el filtro del bloque ('' = todos), si existe. */
function useProjectFilter(block: BlockProps['block']) {
  const projects = useTable('projects');
  const id = filterValue(block.content, 'project');
  return projects.rows.find((p) => p.id === id);
}

/** Tareas creadas frente a hechas, acumuladas semana a semana. */
export function ProgressChart({ block }: BlockProps) {
  const c = useChartColors();
  const tasks = useTable('tasks');
  const project = useProjectFilter(block);
  const own = project ? tasks.rows.filter((t) => t.project_id === project.id) : tasks.rows;
  const data = burnup(own, WEEKS, today()).map((d) => ({ semana: fmtDate(d.week), Creadas: d.creadas, Hechas: d.hechas }));

  if (own.length === 0) return <Empty>{tasks.loading ? 'Cargando…' : 'El gráfico aparecerá cuando haya tareas.'}</Empty>;
  return (
    <div className="chart-block">
      {project && <ProjectLabel project={project} chosen />}
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="semana" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fill: c.text, fontSize: 11 }} />
            <Tooltip {...tooltipStyle(c)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Creadas" stroke={c.c3} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Hechas" stroke={c.c2} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tareas completadas cada semana. */
export function TasksPerWeekChart({ block }: BlockProps) {
  const c = useChartColors();
  const tasks = useTable('tasks');
  const project = useProjectFilter(block);
  const own = project ? tasks.rows.filter((t) => t.project_id === project.id) : tasks.rows;
  const series = tasksDonePerWeek(own, WEEKS, today());
  const data = series.map((d) => ({ semana: fmtDate(d.week), Hechas: d.value }));
  const total = series.reduce((a, d) => a + d.value, 0);

  if (total === 0) return <Empty>{tasks.loading ? 'Cargando…' : 'Cuando completes tareas, aquí verás cuántas terminas cada semana.'}</Empty>;
  return (
    <div className="chart-block">
      {project && <ProjectLabel project={project} chosen />}
      <p className="muted small chart-caption">
        {total} en {WEEKS} semanas · {num(Math.round((total / WEEKS) * 10) / 10)} por semana
      </p>
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="semana" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fill: c.text, fontSize: 11 }} />
            <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.4 }} />
            <Bar dataKey="Hechas" fill={c.c1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horas dedicadas cada semana (de un proyecto o de todos), con el total frente a las previstas. */
export function HoursChart({ block }: BlockProps) {
  const c = useChartColors();
  const logs = useTable('project_logs');
  const project = useProjectFilter(block);
  const own = logs.rows.filter((l) => l.kind === 'horas' && (!project || l.project_id === project.id));
  const data = weeklySum(own.map((l) => ({ date: l.date, value: Number(l.value) })), WEEKS, today()).map((d) => ({ semana: fmtDate(d.week), Horas: d.value }));
  const total = totalHours(own);
  const estimated = project ? (fieldNumber(project, 'horas_estimadas') ?? fieldNumber(project, 'horas_objetivo')) : null;

  if (own.length === 0) return <Empty>{logs.loading ? 'Cargando…' : 'Apunta horas en el bloque «Registro de horas» y aquí verás su evolución.'}</Empty>;
  return (
    <div className="chart-block">
      {project && <ProjectLabel project={project} chosen />}
      <p className="muted small chart-caption">
        Total: <strong>{num(total)} h</strong>
        {estimated ? ` de ${num(estimated)} h previstas` : ''}
      </p>
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="semana" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: c.text, fontSize: 11 }} />
            <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.4 }} />
            <Bar dataKey="Horas" unit=" h" fill={c.c2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Evolución de un valor medido con la línea del objetivo. */
export function EvolutionChart({ block }: BlockProps) {
  const c = useChartColors();
  const { projects, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  if (!project) return <NoProject block={block} kinds={['salud']} />;
  const unit = fieldText(project, 'unidad');
  const target = fieldNumber(project, 'objetivo');
  const values = valueLogs(dataOf(project.id).logs);
  // Un punto por día (el último registro de ese día).
  const byDay = new Map(values.map((l) => [l.date, Number(l.value)]));
  const data = [...byDay].map(([date, v]) => ({ dia: fmtDate(date), Valor: v }));

  if (data.length === 0) return <Empty>Apunta tu primer valor en «Registro de valores» y aquí verás cómo evoluciona.</Empty>;
  const all = [...data.map((d) => d.Valor), ...(target === null ? [] : [target])];
  const pad = Math.max(1, (Math.max(...all) - Math.min(...all)) * 0.15);
  return (
    <div className="chart-block">
      <ProjectLabel project={project} chosen={chosen} />
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={[Math.floor(Math.min(...all) - pad), Math.ceil(Math.max(...all) + pad)]} tick={{ fill: c.text, fontSize: 11 }} />
            <Tooltip {...tooltipStyle(c)} />
            {target !== null && (
              <ReferenceLine y={target} stroke={c.c3} strokeDasharray="5 4" label={{ value: `Objetivo ${num(target)} ${unit}`.trim(), fill: c.text, fontSize: 11, position: 'insideTopRight' }} />
            )}
            <Line type="monotone" dataKey="Valor" unit={unit ? ` ${unit}` : ''} stroke={c.c1} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Proyectos por tipo (gráfico circular) y por estado. */
export function ProjectsDonut() {
  const c = useChartColors();
  const projects = useTable('projects');
  if (projects.rows.length === 0) return <Empty>{projects.loading ? 'Cargando…' : 'Aún no tienes proyectos.'}</Empty>;
  const data = PROJECT_KINDS.map((k) => ({ id: k.id, name: `${k.icon} ${k.name}`, color: k.color, value: projects.rows.filter((p) => kindOf(p).id === k.id).length })).filter((d) => d.value > 0);
  const byStatus = (Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({ s, n: projects.rows.filter((p) => p.status === s).length }));

  return (
    <div className="donut">
      <div className="chart chart-fill donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="none" animationDuration={500}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle(c)} />
          </PieChart>
        </ResponsiveContainer>
        <span className="donut-total">
          <strong>{projects.rows.length}</strong>
          <span className="muted small">proyectos</span>
        </span>
      </div>
      <ul className="donut-legend is-inline small">
        {data.map((d) => (
          <li key={d.id}>
            <span className="dot" style={{ background: d.color }} /> {d.name} <span className="muted">· {d.value}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">{byStatus.map(({ s, n }) => `${n} ${STATUS_LABEL[s].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}</p>
    </div>
  );
}
