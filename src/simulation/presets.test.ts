import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { DEFAULT_TASKS, SCENARIOS, simulate } from './engine';

describe('educational presets', () => {
  it('keeps identical durations across the three comparison workloads', () => {
    for (const id of ['mixed', 'independent', 'chain'] as const)
      expect(PRESETS[id].tasks.map((t) => t.duration)).toEqual(
        DEFAULT_TASKS.map((t) => t.duration),
      );
  });
  it('a chain cannot speed up with extra resources', () => {
    for (const c of [...SCENARIOS, { cores: 8, workers: 8 }])
      expect(simulate(PRESETS.chain.tasks, c)).toMatchObject({
        makespan: 18,
        criticalPathLength: 18,
        speedup: 1,
      });
  });
  it('independent tasks expose more available parallel work', () => {
    expect(simulate(PRESETS.independent.tasks, { cores: 8, workers: 8 }).makespan).toBe(4);
    expect(simulate(PRESETS.mixed.tasks, { cores: 2, workers: 2 }).makespan).toBe(10);
    expect(simulate(PRESETS.policy.tasks, { cores: 2, workers: 2 }).makespan).toBe(12);
  });
});
