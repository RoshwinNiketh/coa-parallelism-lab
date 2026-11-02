import { useId } from 'react';
import { Cpu, GitBranch, Activity } from 'lucide-react';
import { formatNumber as fmt, statesAt, type Simulation } from '../simulation/engine';

const colors = ['#60a5fa', '#50d6bd', '#98b8d5', '#c6a377', '#75bede', '#a8c998'];
export function taskColor(id: string) {
  return colors[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
}
export function Gantt({
  result,
  time,
  horizon = result.makespan,
  title = 'Execution timeline',
  started = true,
}: {
  result: Simulation;
  time: number;
  horizon?: number;
  title?: string;
  started?: boolean;
}) {
  const headingId = useId();
  time = Math.min(time, result.makespan);
  const width = 850,
    left = 86,
    right = 28,
    scale = (width - left - right) / horizon;
  const ticks = Array.from({ length: 6 }, (_, i) => (horizon * i) / 5);
  const height = result.configuration.cores * 68 + 60;
  return (
    <section className="panel timeline-panel" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <h2 id={headingId}>
            <Activity size={17} /> {title}
          </h2>
          <p>One lane per CPU core. Every block is real scheduled work.</p>
        </div>
        <span className="tag">Time units (tu)</span>
      </div>
      <div
        className="svg-scroll"
        role="region"
        aria-label="Scrollable execution timeline"
        tabIndex={0}
      >
        <svg
          className="gantt"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Execution timeline: ${result.schedule.map((t) => `${t.id} on core ${t.core} from ${fmt(t.start)} to ${fmt(t.end)}`).join('; ')}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left + t * scale}
                x2={left + t * scale}
                y1="24"
                y2={height - 25}
                className="grid-line"
              />
              <text x={left + t * scale} y={height - 5} textAnchor="middle" className="axis-text">
                {fmt(t)}
              </text>
            </g>
          ))}
          {Array.from({ length: result.configuration.cores }, (_, i) => {
            const core = i + 1,
              y = 30 + i * 68;
            const assignments = result.schedule.filter((t) => t.core === core);
            let end = 0;
            const gaps: { start: number; end: number }[] = [];
            assignments.forEach((t) => {
              if (t.start > end) gaps.push({ start: end, end: t.start });
              end = t.end;
            });
            if (end < result.makespan) gaps.push({ start: end, end: result.makespan });
            return (
              <g key={core}>
                <text x="0" y={y + 26} className="core-label">
                  Core {core}
                </text>
                <rect
                  x={left}
                  y={y}
                  width={width - left - right}
                  height="44"
                  rx="5"
                  className="lane-bg"
                />
                {gaps.map((g) => (
                  <g key={g.start}>
                    <rect
                      x={left + g.start * scale + 1}
                      y={y + 1}
                      width={Math.max(0, (g.end - g.start) * scale - 2)}
                      height="42"
                      rx="4"
                      className="idle-block"
                    />
                    <text
                      x={left + ((g.start + g.end) / 2) * scale}
                      y={y + 26}
                      textAnchor="middle"
                      className="idle-label"
                    >
                      {(g.end - g.start) / result.makespan > 0.045 ? 'Idle' : ''}
                    </text>
                  </g>
                ))}
                {assignments.map((t) => (
                  <g key={t.id}>
                    <title>
                      {t.id}: {fmt(t.start)}–{fmt(t.end)} tu · Core {core} · Worker {t.worker}
                    </title>
                    <rect
                      x={left + t.start * scale + 1}
                      y={y + 1}
                      width={Math.max(0.5, t.duration * scale - 2)}
                      height="42"
                      rx="5"
                      fill={taskColor(t.id)}
                      opacity={!started ? 0.28 : time >= t.end ? 0.85 : time >= t.start ? 1 : 0.28}
                    />
                    {t.duration / result.makespan > 0.045 && (
                      <>
                        <text
                          x={left + (t.start + t.duration / 2) * scale}
                          y={y + 18}
                          textAnchor="middle"
                          className={`task-label ${!started || time < t.start ? 'future' : ''}`}
                        >
                          {t.id}
                        </text>
                        <text
                          x={left + (t.start + t.duration / 2) * scale}
                          y={y + 34}
                          textAnchor="middle"
                          className={`task-time ${!started || time < t.start ? 'future' : ''}`}
                        >
                          {fmt(t.start)}–{fmt(t.end)}
                        </text>
                      </>
                    )}
                  </g>
                ))}
              </g>
            );
          })}
          <line
            x1={left + time * scale}
            x2={left + time * scale}
            y1="17"
            y2={height - 24}
            className="playhead"
          />
          <circle cx={left + time * scale} cy="15" r="4" className="playhead-dot" />
        </svg>
      </div>
      <div className="timeline-footer">
        <span>
          <i className="legend-dot teal" /> Playback position: <strong>{fmt(time)} tu</strong>
        </span>
        <span>Faded blocks = scheduled next · dashed areas = idle</span>
      </div>
    </section>
  );
}

export function DependencyGraph({ result, time }: { result: Simulation; time: number }) {
  const levels = new Map<string, number>();
  while (levels.size < result.tasks.length)
    for (const t of result.tasks) {
      if (!levels.has(t.id) && t.dependencies.every((d) => levels.has(d)))
        levels.set(
          t.id,
          t.dependencies.length ? Math.max(...t.dependencies.map((d) => levels.get(d)!)) + 1 : 0,
        );
    }
  const maxLevel = Math.max(...levels.values());
  const groups = Array.from({ length: maxLevel + 1 }, (_, level) =>
    result.tasks.filter((t) => levels.get(t.id) === level),
  );
  const height = Math.max(235, Math.max(...groups.map((g) => g.length)) * 84 + 30);
  const width = Math.max(510, (maxLevel + 1) * 150);
  const positions = new Map(
    groups.flatMap((group, level) =>
      group.map(
        (t, i) =>
          [
            t.id,
            {
              x: 65 + (level * (width - 130)) / Math.max(1, maxLevel),
              y: height / 2 + (i - (group.length - 1) / 2) * 84,
            },
          ] as const,
      ),
    ),
  );
  const states = statesAt(result, time);
  return (
    <section className="panel graph-panel" aria-labelledby="graph-title">
      <div className="panel-heading">
        <div>
          <h2 id="graph-title">
            <GitBranch size={17} /> Dependency graph
          </h2>
          <p>Prerequisites flow from left to right.</p>
        </div>
      </div>
      <div
        className="svg-scroll dag-scroll"
        role="region"
        aria-label="Scrollable dependency graph"
        tabIndex={0}
      >
        <svg
          className="dag"
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width, height }}
          role="img"
          aria-label={`Dependency graph. Critical path: ${result.criticalPath.join(' to ')}. ${result.tasks.map((t) => `${t.id} requires ${t.dependencies.join(', ') || 'nothing'}`).join('; ')}`}
        >
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0 0 L7 3.5 L0 7 Z" fill="var(--muted)" />
            </marker>
            <marker
              id="critical-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0 L7 3.5 L0 7 Z" fill="var(--accent)" />
            </marker>
          </defs>
          {result.tasks.flatMap((t) =>
            t.dependencies.map((dep) => {
              const from = positions.get(dep)!,
                to = positions.get(t.id)!;
              const critical = result.criticalPath.some(
                (id, i) => id === dep && result.criticalPath[i + 1] === t.id,
              );
              const x1 = from.x + 38,
                x2 = to.x - 42;
              return (
                <path
                  key={`${dep}-${t.id}`}
                  d={`M${x1},${from.y} C${(x1 + x2) / 2},${from.y} ${(x1 + x2) / 2},${to.y} ${x2},${to.y}`}
                  fill="none"
                  stroke={critical ? 'var(--accent)' : 'var(--muted)'}
                  strokeWidth={critical ? 2.5 : 1.3}
                  opacity={critical ? 1 : 0.55}
                  markerEnd={critical ? 'url(#critical-arrow)' : 'url(#arrow)'}
                />
              );
            }),
          )}
          {result.tasks.map((t) => {
            const p = positions.get(t.id)!;
            const cp = result.criticalPath.includes(t.id);
            return (
              <g key={t.id}>
                <title>
                  {t.id} · {t.duration} tu · {states[t.id]}
                  {cp ? ' · critical path' : ''}
                </title>
                <rect
                  x={p.x - 37}
                  y={p.y - 27}
                  width="74"
                  height="54"
                  rx="8"
                  fill={states[t.id] === 'running' ? 'var(--accent-soft)' : 'var(--surface-raised)'}
                  stroke={cp ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={cp ? 2 : 1}
                />
                <text x={p.x} y={p.y - 2} textAnchor="middle" className="dag-id">
                  {t.id}
                </text>
                <text x={p.x} y={p.y + 16} textAnchor="middle" className="axis-text">
                  {fmt(t.duration)} tu
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="graph-footer">
        <span>
          <i className="legend-dot teal" /> Critical path
        </span>
        <strong>
          {result.criticalPath.join(' → ')}{' '}
          <span className="muted">· {fmt(result.criticalPathLength)} tu</span>
        </strong>
      </div>
    </section>
  );
}

export function CoreStates({
  result,
  time,
  started = true,
}: {
  result: Simulation;
  time: number;
  started?: boolean;
}) {
  time = Math.min(time, result.makespan);
  const states = statesAt(result, started ? time : -1);
  const idsFor = (state: string) =>
    result.tasks.filter((t) => states[t.id] === state).map((t) => t.id);
  return (
    <section className="panel" aria-labelledby="core-title">
      <div className="panel-heading">
        <div>
          <h2 id="core-title">
            <Cpu size={17} /> CPU activity
          </h2>
          <p>
            {started
              ? 'Live state at the playback position.'
              : 'Schedule preview - playback has not started.'}
          </p>
        </div>
        <span className="tag">
          {result.configuration.cores}C / {result.configuration.workers}W
        </span>
      </div>
      <div className="cores-grid">
        {Array.from({ length: result.configuration.cores }, (_, i) => {
          const task = result.schedule.find((t) => t.core === i + 1 && states[t.id] === 'running');
          return (
            <div className={`core-card ${task ? 'busy' : ''}`} key={i}>
              <div>
                <Cpu size={16} />
                <span>Core {i + 1}</span>
                <span className="core-status">
                  {!started ? 'Preview' : task ? 'Running' : 'Idle'}
                </span>
              </div>
              <strong>{task ? `Task ${task.id}` : 'No active task'}</strong>
              <p>
                {task
                  ? `Worker ${task.worker} · ${fmt(task.end - time)} tu remaining`
                  : started && time >= result.makespan
                    ? 'All work complete'
                    : 'Waiting for eligible work'}
              </p>
              <div className="progress-track">
                <span
                  style={{ width: task ? `${((time - task.start) / task.duration) * 100}%` : '0%' }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="worker-heading">
        <h3>Software workers</h3>
        <p>
          Each running task occupies one worker and one core simultaneously. Workers are simulated
          slots.
        </p>
      </div>
      <div className="cores-grid">
        {Array.from({ length: result.configuration.workers }, (_, i) => {
          const task = result.schedule.find(
            (t) => t.worker === i + 1 && states[t.id] === 'running',
          );
          return (
            <div className={`core-card worker-card ${task ? 'busy' : ''}`} key={i}>
              <div>
                <span>Worker {i + 1}</span>
                <span className="core-status">
                  {!started ? 'Preview' : task ? 'Occupied' : 'Available'}
                </span>
              </div>
              <strong>{task ? `Task ${task.id}` : 'No assigned task'}</strong>
              <p>
                {task
                  ? `Executing on Core ${task.core}`
                  : !started
                    ? 'Playback has not started'
                    : time >= result.makespan
                      ? 'All work complete'
                      : 'Awaiting a ready task and core'}
              </p>
            </div>
          );
        })}
      </div>
      <div className="state-lists">
        {(['complete', 'ready', 'blocked'] as const).map((state) => (
          <div key={state}>
            <span className={`state-heading ${state}`}>
              {state === 'complete'
                ? 'Completed'
                : state === 'ready'
                  ? started
                    ? 'Ready · resource wait'
                    : 'Ready · not started'
                  : 'Blocked · dependencies'}{' '}
              <b>{idsFor(state).length}</b>
            </span>
            <div className="task-chips">
              {idsFor(state).length ? (
                idsFor(state).map((id) => (
                  <span key={id} style={{ borderColor: taskColor(id) }}>
                    {id}
                  </span>
                ))
              ) : (
                <span className="empty-chip">None</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
