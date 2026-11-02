import { PRESETS, type PresetId } from './simulation/presets';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Cpu,
  FlaskConical,
  GitBranch,
  Github,
  Info,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Terminal,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import TaskEditor, { toRows, toTasks, type TaskRow } from './components/TaskEditor';
import { CoreStates, DependencyGraph, Gantt } from './components/Visualizations';
import {
  DEFAULT_TASKS,
  SCENARIOS,
  formatNumber as fmt,
  simulate,
  validateTasks,
  type Configuration,
  type Simulation,
} from './simulation/engine';

const PerformanceCharts = lazy(() => import('./components/PerformanceCharts'));
const label = (c: Configuration) => `${c.cores}C/${c.workers}W`;
const percent = (n: number) => `${Number((n * 100).toFixed(1))}%`;

function Metric({
  title,
  value,
  suffix,
  description,
  accent = false,
}: {
  title: string;
  value: string;
  suffix?: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <span>{title}</span>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
      <p>{description}</p>
    </div>
  );
}

function EventLog({
  result,
  time,
  started,
}: {
  result: Simulation;
  time: number;
  started: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const visible = result.events.filter(
    (e) => started && e.time <= time && (filter === 'all' || e.type === filter),
  );
  return (
    <section className="panel event-panel" aria-labelledby="log-title">
      <div className="panel-heading">
        <div>
          <h2 id="log-title">
            <Terminal size={17} /> Event log
          </h2>
          <p>Chronological scheduler decisions up to the playhead.</p>
        </div>
        <label className="log-filter">
          <span className="sr-only">Filter events</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All events</option>
            <option value="start">Task starts</option>
            <option value="complete">Completions</option>
            <option value="blocked">Dependency waits</option>
            <option value="ready">Resource waits</option>
            <option value="idle">Core idle</option>
          </select>
        </label>
      </div>
      <div className="event-list" tabIndex={0} aria-label="Scrollable chronological event log">
        {visible.length ? (
          visible.map((e, i) => (
            <div className="event-row" key={`${i}-${e.time}-${e.message}`}>
              <time>
                {fmt(e.time)}
                <span> tu</span>
              </time>
              <span className={`event-kind ${e.type}`}>
                {e.type === 'blocked' ? 'Waiting' : e.type === 'ready' ? 'Ready' : e.type}
              </span>
              <p>{e.message}</p>
            </div>
          ))
        ) : (
          <p className="empty-state">
            {started
              ? 'No matching events at this playback position. Step forward to reveal more.'
              : 'Schedule preview: no execution events yet. Run or step to begin playback.'}
          </p>
        )}
      </div>
      <div className="log-footer">
        {visible.length} events shown{' '}
        <span>Completion batches are processed before new task starts.</span>
      </div>
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f7fa' : '#0b1017');
    try {
      localStorage.setItem('parallelism-theme', theme);
    } catch {
      /* Storage may be unavailable in private browser contexts. */
    }
  }, [theme]);
  const [rows, setRows] = useState<TaskRow[]>(() => toRows(DEFAULT_TASKS));
  const [configuration, setConfiguration] = useState<Configuration>({ cores: 2, workers: 2 });
  const [custom, setCustom] = useState<Configuration>({ cores: 4, workers: 4 });
  const [customSelected, setCustomSelected] = useState(false);
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [started, setStarted] = useState(false);
  const [activeNav, setActiveNav] = useState('simulation');
  const tasks = useMemo(() => toTasks(rows), [rows]);
  const errors = useMemo(() => validateTasks(tasks), [tasks]);
  const result = useMemo(
    () => (errors.length ? null : simulate(tasks, configuration)),
    [tasks, configuration, errors],
  );
  const comparisons = useMemo(
    () =>
      errors.length
        ? []
        : [
            ...SCENARIOS,
            ...(SCENARIOS.some((c) => label(c) === label(custom)) ? [] : [custom]),
          ].map((c) => simulate(tasks, c)),
    [tasks, errors, custom],
  );
  const baseline = comparisons[0] ?? null;
  const horizon = Math.max(result?.makespan ?? 0, baseline?.makespan ?? 0);
  const eventTimes = [
    ...new Set([...(result?.eventTimes ?? []), ...(baseline?.eventTimes ?? [])]),
  ].sort((a, b) => a - b);
  const [preset, setPreset] = useState<PresetId | 'custom'>('mixed');
  function loadPreset(id: PresetId) {
    resetPlayback();
    setRows(toRows(PRESETS[id].tasks));
    setPreset(id);
  }
  const selectedLabel = label(configuration);

  function resetPlayback() {
    setRunning(false);
    setTime(0);
    setStarted(false);
  }
  function updateRows(next: TaskRow[]) {
    resetPlayback();
    setRows(next);
    setPreset('custom');
  }
  function selectConfiguration(next: Configuration, isCustom = false) {
    resetPlayback();
    setConfiguration(next);
    setCustomSelected(isCustom);
  }
  function updateCustom(field: keyof Configuration, value: number) {
    const next = { ...custom, [field]: value };
    setCustom(next);
    selectConfiguration(next, true);
  }
  function play() {
    if (!result) return;
    if (time >= horizon) setTime(0);
    setStarted(true);
    setRunning(true);
  }
  function step() {
    if (!result) return;
    setRunning(false);
    setStarted(true);
    setTime(eventTimes.find((t) => t > time) ?? horizon);
  }
  useEffect(() => {
    if (!running || !result) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => Math.min(horizon, t + elapsed));
    }, 40);
    return () => window.clearInterval(timer);
  }, [running, result, speed, horizon]);
  useEffect(() => {
    if (result && time >= horizon && running) setRunning(false);
  }, [time, result, running, horizon]);
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setRunning(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  const finished = !!result && time >= horizon;
  const status = errors.length
    ? 'Invalid workload'
    : finished
      ? 'Complete'
      : running
        ? 'Running'
        : started
          ? 'Paused'
          : 'Ready';
  function exportResults() {
    const header = 'Cores,Workers,Execution time,Speedup,Efficiency,Core utilization\n';
    const csv =
      header +
      comparisons
        .map((r) =>
          [
            r.configuration.cores,
            r.configuration.workers,
            r.makespan,
            r.speedup,
            r.efficiency,
            r.utilization,
          ].join(','),
        )
        .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parallelism-lab-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <FlaskConical size={23} />
          </span>
          <span>
            Parallelism<span className="brand-lab"> Lab</span>
            <small>Explore how work runs.</small>
          </span>
        </a>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="sidebar-label">Workspace</div>
        <nav aria-label="Main navigation">
          {[
            { id: 'overview', text: 'Overview', icon: BookOpen },
            { id: 'simulation', text: 'Simulator', icon: Activity },
            { id: 'analysis', text: 'Performance', icon: ChartNoAxesCombined },
            { id: 'learn', text: 'Learning notes', icon: Layers3 },
          ].map(({ id, text, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeNav === id ? 'active' : ''}
              onClick={() => setActiveNav(id)}
              aria-current={activeNav === id ? 'location' : undefined}
            >
              <Icon size={18} />
              {text}
              {activeNav === id && <ChevronRight size={14} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-experiment">
          <div className="mini-chip">
            <Cpu size={19} />
          </div>
          <strong>A little more parallel.</strong>
          <p>
            Change the resources.
            <br />
            Watch the difference.
          </p>
          <a href="#learn" onClick={() => setActiveNav('learn')}>
            Understand the model <ArrowRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" /> COA mini-project{' '}
          <small>Deterministic simulation · v1.0</small>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>Parallelism Lab</span>
          </div>
          <div className="topbar-right">
            <span className="simulation-label">
              <span className="status-dot" /> Simulation environment
            </span>
            <a
              href="https://github.com/RoshwinNiketh/coa-parallelism-lab"
              target="_blank"
              rel="noreferrer"
              aria-label="View project on GitHub"
            >
              <Github size={19} />
            </a>
          </div>
        </header>
        <main id="main">
          <section id="overview" className="overview">
            <div className="intro-heading">
              <div>
                <p className="eyebrow">
                  <span /> COMPUTER ORGANIZATION & ARCHITECTURE
                </p>
                <h1>See parallelism at work.</h1>
                <p className="intro-copy">
                  More cores? More workers? Find out what actually makes work faster.
                  <br className="desktop-break" /> Explore the relationship between hardware,
                  software, and the tasks in between.
                </p>
              </div>
              <a
                className="button secondary guide-button"
                href="#learn"
                onClick={() => setActiveNav('learn')}
              >
                <BookOpen size={16} /> How it works <ArrowRight size={14} />
              </a>
            </div>
            <div className="concept-strip">
              <div>
                <span className="concept-icon">
                  <Cpu size={21} />
                </span>
                <div>
                  <h2>What is Hardware Parallelism?</h2>
                  <p>Multiple physical CPU cores execute different tasks at the same time.</p>
                </div>
              </div>
              <span className="concept-plus">+</span>
              <div>
                <span className="concept-icon blue">
                  <Layers3 size={21} />
                </span>
                <div>
                  <h2>What is Software Parallelism?</h2>
                  <p>Multiple software workers make independent tasks available to run.</p>
                </div>
              </div>
              <p className="complementary">
                Better
                <br />
                <strong>together.</strong>
                <GitBranch size={20} />
              </p>
            </div>
          </section>

          <section id="simulation" className="simulation-section">
            <div className="section-heading">
              <div>
                <h2>
                  <span className="section-dot" /> Simulation workspace
                </h2>
                <p>
                  Build a workload, choose your resources, and follow every scheduling decision.
                </p>
              </div>
              <span
                className={`status-badge ${running ? 'is-running' : ''}`}
                role="status"
                aria-label="Simulation status"
              >
                <span />
                {status}
              </span>
            </div>
            <div className="assumptions">
              <Info size={16} />
              <p>
                <strong>A simplified CPU-bound model.</strong> Identical cores · one core + one
                worker per task · no preemption · zero synchronization overhead or context-switch
                cost. Outputs are simulated, not real CPU benchmarks.
              </p>
            </div>
            <div className="preset-controls">
              <label>
                Workload preset{' '}
                <select
                  aria-label="Workload preset"
                  value={preset}
                  onChange={(e) => loadPreset(e.target.value as PresetId)}
                >
                  <option value="custom" disabled>
                    Custom workload
                  </option>
                  {Object.entries(PRESETS).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {preset === 'custom'
                  ? 'Custom edits - all models use this workload.'
                  : PRESETS[preset].description}
              </p>
            </div>
            <div className="workspace-grid">
              <TaskEditor
                rows={rows}
                errors={errors}
                onChange={updateRows}
                onDefault={() => loadPreset('mixed')}
              />
              <section className="panel configuration-panel" aria-labelledby="config-title">
                <div className="panel-heading">
                  <div>
                    <h2 id="config-title">
                      <Settings2 size={17} /> Resource configuration
                    </h2>
                    <p>Hardware and software work together.</p>
                  </div>
                </div>
                <div className="scenario-grid">
                  {SCENARIOS.map((c, i) => (
                    <button
                      key={label(c)}
                      className={`scenario ${!customSelected && label(c) === selectedLabel ? 'selected' : ''}`}
                      aria-pressed={!customSelected && label(c) === selectedLabel}
                      onClick={() => selectConfiguration(c)}
                    >
                      <span className="scenario-top">
                        <span>
                          {['Sequential', 'More hardware', 'More software', 'Together'][i]}
                        </span>
                        {!customSelected && label(c) === selectedLabel && <Check size={14} />}
                      </span>
                      <strong>
                        {c.cores} <span>{c.cores === 1 ? 'core' : 'cores'}</span>
                        <span className="scenario-divider">/</span>
                        {c.workers} <span>{c.workers === 1 ? 'worker' : 'workers'}</span>
                      </strong>
                    </button>
                  ))}
                </div>
                <div className="custom-heading">
                  <h3>Try your own configuration</h3>
                  <button
                    className={`text-button ${customSelected ? '' : 'muted'}`}
                    onClick={() => selectConfiguration(custom, true)}
                    aria-pressed={customSelected}
                  >
                    {customSelected ? (
                      <>
                        <Check size={13} /> Selected
                      </>
                    ) : (
                      'Select custom'
                    )}
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div className="resource-sliders">
                  {(['cores', 'workers'] as const).map((field) => (
                    <label key={field}>
                      <span>
                        {field === 'cores' ? (
                          <>
                            <Cpu size={15} /> CPU cores
                          </>
                        ) : (
                          <>
                            <Layers3 size={15} /> Software workers
                          </>
                        )}
                        <output>{custom[field]}</output>
                      </span>
                      <input
                        type="range"
                        aria-label={
                          field === 'cores' ? 'Custom CPU cores' : 'Custom software workers'
                        }
                        min="1"
                        max="8"
                        step="1"
                        value={custom[field]}
                        onChange={(e) => updateCustom(field, Number(e.target.value))}
                      />
                      <span className="range-extents">
                        <span>1</span>
                        <span>8</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="resource-note">
                  <Zap size={16} />
                  <p>
                    Concurrent task capacity = <strong>min(cores, workers)</strong>.<br />
                    For this selection: at most{' '}
                    <strong>
                      {Math.min(configuration.cores, configuration.workers)}{' '}
                      {Math.min(configuration.cores, configuration.workers) === 1
                        ? 'task'
                        : 'tasks'}
                    </strong>{' '}
                    at once.
                  </p>
                </div>
              </section>
            </div>
            <div className="playback-bar">
              <div className="playback-buttons">
                <button
                  className="button primary"
                  disabled={!result}
                  onClick={running ? () => setRunning(false) : play}
                >
                  {running ? (
                    <Pause size={16} fill="currentColor" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {running
                    ? 'Pause'
                    : finished
                      ? 'Run again'
                      : started
                        ? 'Resume'
                        : 'Run simulation'}
                </button>
                <button className="button secondary" disabled={!result || finished} onClick={step}>
                  <SkipForward size={16} /> Step<span className="wide-label"> to event</span>
                </button>
                <button
                  className="icon-button reset-button"
                  aria-label="Reset playback"
                  title="Reset playback"
                  onClick={resetPlayback}
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              <div className="playback-meta">
                <label>
                  Playback{' '}
                  <select
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[0.25, 0.5, 1, 2, 4].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
                <span className="playback-time">
                  {fmt(time)} <span>/ {result ? fmt(horizon) : '—'} tu</span>
                </span>
              </div>
            </div>
            <p className="playback-hint">
              Input changes reset playback. Speed changes only the animation, never the schedule.
              Future blocks preview the full run.
            </p>

            {result ? (
              <>
                <div className="metrics-row">
                  <Metric
                    title="Execution time"
                    value={fmt(result.makespan)}
                    suffix="tu"
                    description={`Sequential baseline: ${fmt(result.baseline)} tu`}
                  />
                  <Metric
                    title="Speedup"
                    value={Number(result.speedup.toFixed(2)).toString()}
                    suffix="×"
                    description="Compared with 1 core / 1 worker"
                    accent
                  />
                  <Metric
                    title="Core efficiency"
                    value={percent(result.efficiency)}
                    description="Speedup per available CPU core"
                  />
                  <Metric
                    title="Core utilization"
                    value={percent(result.utilization)}
                    description={`${fmt(result.totalWork)} tu of useful CPU work`}
                  />
                  <Metric
                    title="Critical path"
                    value={fmt(result.criticalPathLength)}
                    suffix="tu"
                    description="Dependency-imposed time limit"
                  />
                </div>
                <section className="comparison-models" aria-label="Execution Model Comparison">
                  <div className="section-heading">
                    <div>
                      <h2>Execution Model Comparison</h2>
                      <p>
                        One workload, shared time scale and playback clock. Completed models stay
                        complete.
                      </p>
                    </div>
                  </div>
                  <div className="model-grid">
                    {baseline && (
                      <div className="model">
                        <Gantt
                          result={baseline}
                          time={time}
                          horizon={horizon}
                          started={started}
                          title="Sequential execution"
                        />
                        <p className="model-summary">
                          1 core / 1 worker - {fmt(baseline.makespan)} tu - {fmt(baseline.speedup)}-
                          speedup - {percent(baseline.efficiency)} efficiency -{' '}
                          {percent(baseline.utilization)} core utilization
                        </p>
                      </div>
                    )}
                    <div className="model">
                      <Gantt
                        result={result}
                        time={time}
                        horizon={horizon}
                        started={started}
                        title="Selected execution"
                      />
                      <p className="model-summary">
                        {configuration.cores} cores / {configuration.workers} workers -{' '}
                        {fmt(result.makespan)} tu - {fmt(result.speedup)}- speedup -{' '}
                        {percent(result.efficiency)} efficiency - {percent(result.utilization)} core
                        utilization
                      </p>
                    </div>
                  </div>
                  <p className="comparison-note">
                    Time saved: <strong>{fmt(result.baseline - result.makespan)} tu</strong>.
                    Metrics use each model-s own execution interval, not the shared playback
                    horizon. Critical path: {fmt(result.criticalPathLength)} tu.
                  </p>
                </section>
                <div className="visual-grid">
                  <DependencyGraph result={result} time={started ? time : -1} />
                  <CoreStates result={result} time={time} started={started} />
                </div>
                <EventLog result={result} time={time} started={started} />
              </>
            ) : (
              <div className="invalid-placeholder">
                <Info size={24} />
                <h3>Your workload needs a quick fix.</h3>
                <p>
                  Resolve the validation messages above to enable scheduling, visualization, and
                  comparisons.
                </p>
              </div>
            )}
          </section>

          <section id="analysis" className="analysis-section">
            <div className="section-heading">
              <div>
                <h2>
                  <ChartNoAxesCombined size={21} /> Performance Analysis
                </h2>
                <p>Same workload. Different resources. A clear comparison.</p>
              </div>
              <button className="button secondary" disabled={!result} onClick={exportResults}>
                <ArrowDown size={15} /> Export CSV
              </button>
            </div>
            {result ? (
              <>
                <div className="panel comparison-panel">
                  <div className="comparison-heading">
                    <h3>Configuration comparison</h3>
                    <span>
                      <i className="legend-dot teal" /> Selected: {configuration.cores} cores /{' '}
                      {configuration.workers} workers
                    </span>
                  </div>
                  <Suspense fallback={<p className="empty-state">Loading performance charts…</p>}>
                    <PerformanceCharts results={comparisons} selected={selectedLabel} />
                  </Suspense>
                  <div className="table-scroll">
                    <table className="results-table">
                      <caption className="sr-only">
                        All four standard scenarios and the custom configuration, compared against
                        the same sequential baseline.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Configuration</th>
                          <th scope="col">Cores</th>
                          <th scope="col">Workers</th>
                          <th scope="col">Execution time</th>
                          <th scope="col">Speedup</th>
                          <th scope="col">Efficiency</th>
                          <th scope="col">Core utilization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisons.map((r, i) => (
                          <tr
                            key={label(r.configuration)}
                            className={
                              label(r.configuration) === selectedLabel ? 'selected-row' : ''
                            }
                          >
                            <th scope="row">
                              <button
                                className="table-select"
                                onClick={() => selectConfiguration(r.configuration, i >= 4)}
                              >
                                {i === 0
                                  ? 'Sequential baseline'
                                  : i >= 4
                                    ? 'Custom configuration'
                                    : `${r.configuration.cores} core${r.configuration.cores > 1 ? 's' : ''} / ${r.configuration.workers} worker${r.configuration.workers > 1 ? 's' : ''}`}
                                {label(r.configuration) === selectedLabel && <Check size={13} />}
                              </button>
                            </th>
                            <td>{r.configuration.cores}</td>
                            <td>{r.configuration.workers}</td>
                            <td>{fmt(r.makespan)} tu</td>
                            <td>{Number(r.speedup.toFixed(2))}×</td>
                            <td>{percent(r.efficiency)}</td>
                            <td>{percent(r.utilization)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">
                    C = CPU cores · W = software workers. Click a configuration to inspect its
                    schedule. All metrics describe the complete run.
                  </p>
                </div>
                <div className="analysis-callout">
                  <span className="concept-icon">
                    <Zap size={22} />
                  </span>
                  <div>
                    <h3>
                      {result.makespan === result.criticalPathLength
                        ? 'You’ve reached the dependency limit.'
                        : 'Dependencies, resources, and scheduling order shape this result.'}
                    </h3>
                    <p>
                      Your selection takes <strong>{fmt(result.makespan)} tu</strong> for{' '}
                      <strong>{fmt(result.totalWork)} tu</strong> of work. The critical path
                      requires at least <strong>{fmt(result.criticalPathLength)} tu</strong>, so
                      even unlimited resources cannot exceed{' '}
                      <strong>
                        {Number((result.baseline / result.criticalPathLength).toFixed(2))}× speedup
                      </strong>{' '}
                      for this graph. The work/resource lower bound is{' '}
                      <strong>
                        {fmt(
                          result.totalWork / Math.min(configuration.cores, configuration.workers),
                        )}{' '}
                        tu
                      </strong>
                      ; both limits apply. This is a theoretical lower bound, not a guaranteed
                      achievable schedule. Dependencies, task indivisibility, resource capacity, and
                      alphabetical scheduling all affect makespan. A gap above the bound alone does
                      not prove suboptimal scheduling.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-state panel">A valid task graph is needed to compare results.</p>
            )}
          </section>

          <section id="learn" className="learn-section">
            <div className="section-heading">
              <div>
                <h2>
                  <BookOpen size={21} /> Inside the experiment
                </h2>
                <p>The model, the math, and what it tells us about real computers.</p>
              </div>
              <span className="tag">Learning notes</span>
            </div>
            <div className="learning-grid">
              <article className="panel learning-article">
                <span className="article-label">The scheduler</span>
                <h3>How Scheduling Works</h3>
                <p>
                  The simulator uses a deterministic, non-preemptive list scheduler. It begins at
                  time zero, finds tasks whose prerequisites have completed, and starts them in
                  alphabetical task-ID order.
                </p>
                <ol>
                  <li>Process all tasks finishing at the current time.</li>
                  <li>Assign ready tasks to the lowest-numbered free core and worker.</li>
                  <li>Advance directly to the next completion event and repeat.</li>
                </ol>
                <p>
                  A running task keeps both resources until it finishes. Playback simply reveals
                  this precomputed schedule.
                </p>
              </article>
              <article className="panel learning-article">
                <span className="article-label">The limits</span>
                <h3>Dependencies and Resource Constraints</h3>
                <p>
                  Tasks cannot run before their prerequisites finish. The{' '}
                  <strong>critical path</strong> is the longest dependency path, weighted by task
                  duration. Every task on it must execute in sequence.
                </p>
                <p>
                  Ready tasks also contend for cores and workers. More workers on one core provide
                  concurrency, but <strong>do not speed up idealized CPU-bound work</strong>. Extra
                  cores with only one worker also stay underused.
                </p>
                <p>
                  For time T, total work W, and critical path L:
                  <br />
                  <code>T ≥ max(L, W / min(cores, workers))</code>. Alphabetical list scheduling may
                  take longer than this lower bound; it does not promise an optimal schedule.
                </p>
              </article>
              <article className="panel learning-article formula-article">
                <span className="article-label">Reading the metrics</span>
                <h3>The performance formulas</h3>
                <dl>
                  <div>
                    <dt>Speedup</dt>
                    <dd>Sequential time / parallel time</dd>
                  </div>
                  <div>
                    <dt>Core efficiency</dt>
                    <dd>Speedup / number of cores</dd>
                  </div>
                  <div>
                    <dt>Core utilization</dt>
                    <dd>Total work / (cores × parallel time)</dd>
                  </div>
                </dl>
                <p>
                  The baseline uses the same graph on one core with one worker. With zero overhead
                  it equals total work. This makes efficiency and core utilization numerically equal
                  in this model; their definitions differ. Core utilization measures{' '}
                  <strong>CPU core capacity</strong>, not thread utilization.
                </p>
              </article>
              <article className="panel learning-article">
                <span className="article-label">From model to machine</span>
                <h3>Key Findings</h3>
                <p>
                  Hardware parallelism also includes pipelining, instruction-level parallelism, and
                  SIMD. This lab focuses on multicore task execution. Software parallelism exposes
                  independent tasks and coordinates their dependencies.
                </p>
                <p>
                  Flynn-s classification: SISD (single instruction/single data stream), SIMD (single
                  instruction/multiple data streams), MISD (multiple instruction/single data
                  stream), and MIMD (multiple instruction/multiple data streams). This simulator
                  illustrates tasks on a MIMD-style multicore system; it does not simulate
                  instruction/data streams or implement those four architectures.
                </p>
                <p>
                  <strong>Hardware and software parallelism are complementary.</strong> Software
                  exposes independent work; multicore hardware supplies simultaneous execution
                  capacity.
                </p>
                <p>
                  Concurrency means tasks can be in progress during the same period. Genuine
                  multicore parallelism means tasks execute at the same instant on different cores.
                  An operating system can time-slice workers on one core, but that does not create
                  extra CPU capacity.
                </p>
                <p>
                  Real CPU-bound applications also face cache and memory-bandwidth contention,
                  synchronization, scheduling, and context-switch costs. These are omitted here, so
                  real benchmarks can differ. I/O-bound workloads may benefit from concurrency even
                  on one core.
                </p>
              </article>
            </div>
            <div className="finding-strip">
              <Check size={19} />
              <p>
                Default example: <strong>18 → 10 time units</strong> with 2 cores and 2 workers.
                That’s <strong>1.8× speedup</strong> and <strong>90% core utilization</strong>—with
                the remaining capacity limited by the dependency graph.
              </p>
            </div>
          </section>
          <footer>
            <a className="footer-brand" href="#overview">
              <FlaskConical size={18} /> Parallelism Lab
            </a>
            <p>Built for understanding. Simulated with precision.</p>
            <span>Computer Organization & Architecture</span>
          </footer>
        </main>
      </div>
    </>
  );
}
