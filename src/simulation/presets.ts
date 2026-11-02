import { DEFAULT_TASKS, type Task } from './engine';

export const PRESETS = {
  mixed: {
    label: 'Mixed Dependencies',
    description: 'Independent work and dependency chains compete for resources.',
    tasks: DEFAULT_TASKS,
  },
  independent: {
    label: 'Independent Tasks',
    description:
      'All tasks are ready immediately. Extra cores and workers can expose more parallel execution.',
    tasks: DEFAULT_TASKS.map((t) => ({ ...t, dependencies: [] })),
  },
  chain: {
    label: 'Fully Dependent Tasks',
    description: 'One dependency chain: additional cores cannot shorten the sequence.',
    tasks: DEFAULT_TASKS.map((t, i) => ({
      ...t,
      dependencies: i ? [DEFAULT_TASKS[i - 1].id] : [],
    })),
  },
  policy: {
    label: 'Experiment: scheduling order',
    description:
      'Alphabetical scheduling starts A and B first. Try tracing how starting long task C immediately could finish sooner. A gap above a lower bound alone is not proof of a poor schedule.',
    tasks: [
      { id: 'A', duration: 2, dependencies: [] },
      { id: 'B', duration: 2, dependencies: [] },
      { id: 'C', duration: 10, dependencies: [] },
    ],
  },
} satisfies Record<string, { label: string; description: string; tasks: Task[] }>;
export type PresetId = keyof typeof PRESETS;
