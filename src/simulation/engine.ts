/** Pure deterministic discrete-event scheduler. No timers, browser APIs, or React. */
export interface Task {
  id: string;
  duration: number;
  dependencies: string[];
}
export interface Configuration {
  cores: number;
  workers: number;
}
export interface Assignment extends Task {
  start: number;
  end: number;
  core: number;
  worker: number;
}
export type TaskState = 'blocked' | 'ready' | 'running' | 'complete';
export interface LogEvent {
  time: number;
  type: 'start' | 'complete' | 'blocked' | 'ready' | 'idle';
  message: string;
  task?: string;
  core?: number;
  until?: number;
}
export interface Simulation {
  configuration: Configuration;
  tasks: Task[];
  schedule: Assignment[];
  events: LogEvent[];
  eventTimes: number[];
  totalWork: number;
  baseline: number;
  makespan: number;
  criticalPath: string[];
  criticalPathLength: number;
  speedup: number;
  efficiency: number;
  utilization: number;
}
export const DEFAULT_TASKS: Task[] = [
  { id: 'A', duration: 4, dependencies: [] },
  { id: 'B', duration: 3, dependencies: [] },
  { id: 'C', duration: 2, dependencies: [] },
  { id: 'D', duration: 4, dependencies: ['A', 'B'] },
  { id: 'E', duration: 3, dependencies: ['C'] },
  { id: 'F', duration: 2, dependencies: ['D', 'E'] },
];
export const SCENARIOS: Configuration[] = [
  { cores: 1, workers: 1 },
  { cores: 2, workers: 1 },
  { cores: 1, workers: 2 },
  { cores: 2, workers: 2 },
];
export const alphabetical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function validateTasks(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length)
    return ['Add at least one task before running the simulation.'];
  if (input.length > 40) return ['Use at most 40 tasks to keep the lab readable.'];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const task of input) {
    if (!task || typeof task !== 'object') {
      errors.push('Every task must be an object with an ID, duration, and prerequisites.');
      continue;
    }
    if (typeof task.id !== 'string' || !/^[A-Z][A-Z0-9_]{0,11}$/.test(task.id))
      errors.push(
        'Task IDs must start with A–Z and contain 1–12 uppercase letters, digits, or underscores.',
      );
    else if (ids.has(task.id)) errors.push(`Duplicate task ID: ${task.id}. Use a unique ID.`);
    else ids.add(task.id);
    if (
      typeof task.duration !== 'number' ||
      !Number.isFinite(task.duration) ||
      task.duration <= 0 ||
      task.duration > 10000 ||
      task.duration < 0.001
    )
      errors.push(
        `Task ${task.id ?? '?'}: duration must be a finite positive number from 0.001 to 10,000 time units.`,
      );
    if (
      !Array.isArray(task.dependencies) ||
      task.dependencies.some((d: unknown) => typeof d !== 'string')
    )
      errors.push(`Task ${task.id ?? '?'}: prerequisites must be a list of task IDs.`);
  }
  if (errors.length) return errors;
  const tasks = input as Task[];
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (dep === task.id) errors.push(`Task ${task.id} cannot depend on itself.`);
      else if (!ids.has(dep))
        errors.push(
          `Task ${task.id}: unknown prerequisite ${dep}. Add it or remove the reference.`,
        );
    }
    if (new Set(task.dependencies).size !== task.dependencies.length)
      errors.push(`Task ${task.id} has duplicate prerequisites.`);
  }
  if (errors.length) return errors;
  const done = new Set<string>();
  while (done.size < tasks.length) {
    const next = tasks.filter((t) => !done.has(t.id) && t.dependencies.every((d) => done.has(d)));
    if (!next.length)
      return [
        `Dependency cycle detected involving ${tasks
          .filter((t) => !done.has(t.id))
          .map((t) => t.id)
          .join(', ')}. Remove a prerequisite to break the cycle.`,
      ];
    next.forEach((t) => done.add(t.id));
  }
  return [];
}

export function criticalPath(tasks: Task[]): { path: string[]; length: number } {
  const errors = validateTasks(tasks);
  if (errors.length) throw new Error(errors.join(' '));
  const paths = new Map<string, { path: string[]; length: number }>();
  while (paths.size < tasks.length) {
    for (const task of [...tasks].sort((a, b) => alphabetical(a.id, b.id))) {
      if (paths.has(task.id) || !task.dependencies.every((d) => paths.has(d))) continue;
      const previous = task.dependencies
        .map((d) => paths.get(d)!)
        .sort((a, b) => b.length - a.length || alphabetical(a.path.join(','), b.path.join(',')))[0];
      paths.set(task.id, {
        path: [...(previous?.path ?? []), task.id],
        length: (previous?.length ?? 0) + task.duration,
      });
    }
  }
  return [...paths.values()].sort(
    (a, b) => b.length - a.length || alphabetical(a.path.join(','), b.path.join(',')),
  )[0];
}

export function simulate(input: Task[], configuration: Configuration): Simulation {
  const errors = validateTasks(input);
  if (errors.length) throw new Error(errors.join(' '));
  if (
    !configuration ||
    ![configuration.cores, configuration.workers].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 8,
    )
  )
    throw new Error('Core and worker counts must be integers from 1 to 8.');
  const tasks = input
    .map((t) => ({ ...t, dependencies: [...t.dependencies].sort(alphabetical) }))
    .sort((a, b) => alphabetical(a.id, b.id));
  const schedule: Assignment[] = [],
    events: LogEvent[] = [],
    eventTimes: number[] = [];
  const completed = new Set<string>(),
    started = new Set<string>();
  const lastBlocked = new Map<string, string>();
  let running: Assignment[] = [],
    time = 0;
  while (completed.size < tasks.length) {
    eventTimes.push(time);
    // Batch every completion before recomputing readiness or allocating resources.
    for (const task of running
      .filter((t) => t.end === time)
      .sort((a, b) => alphabetical(a.id, b.id))) {
      completed.add(task.id);
      events.push({
        time,
        type: 'complete',
        task: task.id,
        core: task.core,
        message: `${task.id} complete · Core ${task.core} / Worker ${task.worker} released`,
      });
    }
    running = running.filter((t) => t.end > time);
    const pending = tasks.filter((t) => !started.has(t.id));
    const ready = pending.filter((t) => t.dependencies.every((d) => completed.has(d)));
    for (const task of pending.filter((t) => !ready.includes(t))) {
      const missing = task.dependencies.filter((d) => !completed.has(d)).join(', ');
      if (lastBlocked.get(task.id) !== missing)
        events.push({
          time,
          type: 'blocked',
          task: task.id,
          message: `${task.id} waiting on dependencies: ${missing}`,
        });
      lastBlocked.set(task.id, missing);
    }
    for (const task of ready) {
      const core = Array.from({ length: configuration.cores }, (_, i) => i + 1).find(
        (n) => !running.some((t) => t.core === n),
      );
      const worker = Array.from({ length: configuration.workers }, (_, i) => i + 1).find(
        (n) => !running.some((t) => t.worker === n),
      );
      if (core === undefined || worker === undefined) {
        events.push({
          time,
          type: 'ready',
          task: task.id,
          message: `${task.id} ready · waiting for ${core === undefined ? 'a CPU core' : 'a software worker'}`,
        });
        continue;
      }
      const assignment = {
        ...task,
        dependencies: [...task.dependencies],
        start: time,
        end: time + task.duration,
        core,
        worker,
      };
      schedule.push(assignment);
      running.push(assignment);
      started.add(task.id);
      events.push({
        time,
        type: 'start',
        task: task.id,
        core,
        message: `${task.id} started · Core ${core} / Worker ${worker} · finishes at ${formatNumber(assignment.end)}`,
      });
    }
    if (!running.length) break;
    const next = Math.min(...running.map((t) => t.end));
    for (let core = 1; core <= configuration.cores; core++) {
      if (!running.some((t) => t.core === core)) {
        const waiting = ready.some((t) => !started.has(t.id));
        events.push({
          time,
          until: next,
          type: 'idle',
          core,
          message: `Core ${core} idle [${formatNumber(time)}, ${formatNumber(next)}] · ${waiting ? 'all workers occupied' : pending.some((t) => !started.has(t.id)) ? 'waiting on dependencies' : 'no remaining ready tasks'}`,
        });
      }
    }
    time = next;
  }
  const totalWork = tasks.reduce((sum, t) => sum + t.duration, 0);
  // With one core and one worker a valid DAG always has ready work until done;
  // the same graph's sequential makespan is therefore exactly its total work.
  const baseline = totalWork;
  const cp = criticalPath(tasks);
  return {
    configuration: { ...configuration },
    tasks,
    schedule,
    events,
    eventTimes,
    totalWork,
    baseline,
    makespan: time,
    criticalPath: cp.path,
    criticalPathLength: cp.length,
    speedup: baseline / time,
    efficiency: baseline / time / configuration.cores,
    utilization: totalWork / (configuration.cores * time),
  };
}

/** State at a timestamp includes all completions and starts at that timestamp. */
export function statesAt(result: Simulation, time: number): Record<string, TaskState> {
  return Object.fromEntries(
    result.schedule.map((task) => [
      task.id,
      time >= task.end
        ? 'complete'
        : time >= task.start
          ? 'running'
          : task.dependencies.every((d) => result.schedule.find((t) => t.id === d)!.end <= time)
            ? 'ready'
            : 'blocked',
    ]),
  );
}
export function nextEventTime(result: Simulation, time: number): number {
  return result.eventTimes.find((t) => t > time) ?? result.makespan;
}
export function formatNumber(n: number): string {
  return Number(n.toFixed(3)).toString();
}
