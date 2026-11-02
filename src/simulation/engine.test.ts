import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASKS,
  SCENARIOS,
  simulate,
  validateTasks,
  statesAt,
  nextEventTime,
  type Task,
  nextTaskId,
} from './engine';

describe('required default example', () => {
  it.each(SCENARIOS.map((c, i) => ({ ...c, expected: [18, 18, 18, 10][i] })))(
    '$cores cores / $workers workers = $expected',
    ({ cores, workers, expected }) => {
      expect(simulate(DEFAULT_TASKS, { cores, workers }).makespan).toBe(expected);
    },
  );
  it('matches exact stable core and worker assignments and metrics', () => {
    const r = simulate(DEFAULT_TASKS, { cores: 2, workers: 2 });
    expect(r.schedule.map((t) => [t.id, t.start, t.end, t.core, t.worker])).toEqual([
      ['A', 0, 4, 1, 1],
      ['B', 0, 3, 2, 2],
      ['C', 3, 5, 2, 2],
      ['D', 4, 8, 1, 1],
      ['E', 5, 8, 2, 2],
      ['F', 8, 10, 1, 1],
    ]);
    expect(r).toMatchObject({
      baseline: 18,
      totalWork: 18,
      makespan: 10,
      speedup: 1.8,
      efficiency: 0.9,
      utilization: 0.9,
      criticalPathLength: 10,
      criticalPath: ['A', 'D', 'F'],
    });
  });
  it('is deterministic, alphabetical, and does not mutate inputs', () => {
    const input = structuredClone(DEFAULT_TASKS).reverse();
    const before = structuredClone(input);
    expect(simulate(input, { cores: 2, workers: 2 })).toEqual(
      simulate(DEFAULT_TASKS, { cores: 2, workers: 2 }),
    );
    expect(input).toEqual(before);
  });
});

describe('scheduling invariants', () => {
  it('never violates a dependency or overlaps resources across all 64 configurations', () => {
    for (let cores = 1; cores <= 8; cores++)
      for (let workers = 1; workers <= 8; workers++) {
        const r = simulate(DEFAULT_TASKS, { cores, workers });
        for (const t of r.schedule) {
          expect(t.core).toBeGreaterThanOrEqual(1);
          expect(t.core).toBeLessThanOrEqual(cores);
          expect(t.worker).toBeGreaterThanOrEqual(1);
          expect(t.worker).toBeLessThanOrEqual(workers);
          for (const d of t.dependencies)
            expect(r.schedule.find((s) => s.id === d)!.end).toBeLessThanOrEqual(t.start);
          for (const other of r.schedule.filter(
            (s) => s.id !== t.id && s.start < t.end && t.start < s.end,
          )) {
            expect(other.core).not.toBe(t.core);
            expect(other.worker).not.toBe(t.worker);
          }
        }
        for (const time of r.eventTimes)
          expect(
            r.schedule.filter((t) => t.start <= time && t.end > time).length,
          ).toBeLessThanOrEqual(Math.min(cores, workers));
        expect(r.makespan).toBeGreaterThanOrEqual(r.criticalPathLength);
      }
  });
  it('batches simultaneous completions before starting newly ready tasks', () => {
    const tasks: Task[] = [
      { id: 'A', duration: 2, dependencies: [] },
      { id: 'B', duration: 2, dependencies: [] },
      { id: 'C', duration: 1, dependencies: ['A', 'B'] },
    ];
    const r = simulate(tasks, { cores: 2, workers: 2 });
    expect(
      r.events
        .filter((e) => e.time === 2)
        .slice(0, 3)
        .map((e) => [e.type, e.task]),
    ).toEqual([
      ['complete', 'A'],
      ['complete', 'B'],
      ['start', 'C'],
    ]);
    expect(r.schedule[2]).toMatchObject({ start: 2, core: 1, worker: 1 });
  });
  it('tracks dependency idle gaps and worker-limited idle cores', () => {
    const chain: Task[] = [
      { id: 'A', duration: 2, dependencies: [] },
      { id: 'B', duration: 3, dependencies: ['A'] },
    ];
    const r = simulate(chain, { cores: 2, workers: 2 });
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'idle', core: 2, time: 0, until: 2 }),
    );
    expect(r.utilization).toBe(0.5);
    expect(
      simulate(DEFAULT_TASKS, { cores: 2, workers: 1 }).events.some(
        (e) => e.type === 'idle' && e.message.includes('workers occupied'),
      ),
    ).toBe(true);
  });
  it('derives all four states and exact event stepping', () => {
    const r = simulate(DEFAULT_TASKS, { cores: 2, workers: 2 });
    expect(statesAt(r, 0)).toEqual({
      A: 'running',
      B: 'running',
      C: 'ready',
      D: 'blocked',
      E: 'blocked',
      F: 'blocked',
    });
    expect(statesAt(r, 4)).toMatchObject({
      A: 'complete',
      B: 'complete',
      C: 'running',
      D: 'running',
      F: 'blocked',
    });
    expect(Object.values(statesAt(r, 10)).every((s) => s === 'complete')).toBe(true);
    expect(nextEventTime(r, 0)).toBe(3);
    expect(nextEventTime(r, 3)).toBe(4);
    expect(nextEventTime(r, 10)).toBe(10);
  });
  it('handles fractional durations and a single task', () => {
    const r = simulate([{ id: 'A', duration: 0.5, dependencies: [] }], { cores: 8, workers: 8 });
    expect(r.makespan).toBe(0.5);
    expect(r.utilization).toBe(0.125);
  });
  it('computes the weighted critical path even when input is not topological', () => {
    const tasks: Task[] = [
      { id: 'A', duration: 1, dependencies: ['Z'] },
      { id: 'Z', duration: 9, dependencies: [] },
      { id: 'B', duration: 3, dependencies: [] },
    ];
    expect(simulate(tasks, { cores: 3, workers: 3 })).toMatchObject({
      criticalPath: ['Z', 'A'],
      criticalPathLength: 10,
    });
  });
});

describe('input validation', () => {
  it('finds unused valid IDs after deletions and custom IDs', () => {
    const ids = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    ids.push('T1', 'T3', 'T28');
    expect(nextTaskId(ids)).toBe('T2');
    while (ids.length < 40) {
      const id = nextTaskId(ids);
      expect(ids).not.toContain(id);
      ids.push(id);
    }
    expect(new Set(ids).size).toBe(40);
    expect(validateTasks(ids.map((id) => ({ id, duration: 1, dependencies: [] })))).toEqual([]);
  });
  it('uses integer ticks for decimal sums and simultaneous completions', () => {
    const r = simulate(
      [
        { id: 'A', duration: 0.1, dependencies: [] },
        { id: 'B', duration: 0.3, dependencies: [] },
        { id: 'C', duration: 0.2, dependencies: ['A'] },
      ],
      { cores: 2, workers: 2 },
    );
    expect(r.eventTimes).toEqual([0, 0.1, 0.3]);
    expect(
      r.events.filter((e) => e.time === 0.3 && e.type === 'complete').map((e) => e.task),
    ).toEqual(['B', 'C']);
    expect(r.totalWork).toBe(0.6);
    expect(nextEventTime(r, 0.1)).toBe(0.3);
    for (const duration of [0.001, 1.001, 10000])
      expect(
        simulate([{ id: 'A', duration, dependencies: [] }], { cores: 1, workers: 1 }).makespan,
      ).toBe(duration);
    expect(validateTasks([{ id: 'A', duration: 0.1001, dependencies: [] }]).join()).toContain(
      'increments',
    );
  });
  it('preserves alphabetical scheduling without claiming optimality', () => {
    const r = simulate(
      [
        ['A', 2],
        ['B', 2],
        ['C', 10],
      ].map(([id, duration]) => ({ id: String(id), duration: Number(duration), dependencies: [] })),
      { cores: 2, workers: 2 },
    );
    expect(r.makespan).toBe(12);
    expect(Math.max(r.criticalPathLength, r.totalWork / 2)).toBe(10);
  });
  it.each([
    null,
    undefined,
    [],
    {},
    [null],
    [{}],
    [{ id: 'A', duration: '4', dependencies: [] }],
    [{ id: 'A', duration: 0, dependencies: [] }],
    [{ id: 'A', duration: -2, dependencies: [] }],
    [{ id: 'A', duration: NaN, dependencies: [] }],
    [{ id: 'A', duration: Infinity, dependencies: [] }],
    [{ id: 'A', duration: 1, dependencies: 'B' }],
    [{ id: 'A', duration: 1, dependencies: [null] }],
  ])('rejects malformed input %j', (input) => {
    expect(validateTasks(input).length).toBeGreaterThan(0);
    expect(() => simulate(input as Task[], { cores: 2, workers: 2 })).toThrow();
  });
  it('rejects duplicates, self references, unknown prerequisites and cycles', () => {
    expect(validateTasks([DEFAULT_TASKS[0], DEFAULT_TASKS[0]]).join()).toContain('Duplicate');
    expect(validateTasks([{ id: 'A', duration: 1, dependencies: ['A'] }]).join()).toContain(
      'itself',
    );
    expect(validateTasks([{ id: 'A', duration: 1, dependencies: ['Z'] }]).join()).toContain(
      'unknown',
    );
    expect(
      validateTasks([
        { id: 'A', duration: 1, dependencies: ['B'] },
        { id: 'B', duration: 1, dependencies: ['A'] },
      ]).join(),
    ).toContain('cycle');
  });
  it.each([
    { cores: 0, workers: 1 },
    { cores: 9, workers: 1 },
    { cores: 2, workers: 1.5 },
    { cores: 2, workers: NaN },
  ])('rejects invalid configuration %j', (c) => {
    expect(() => simulate(DEFAULT_TASKS, c)).toThrow('1 to 8');
  });
});
