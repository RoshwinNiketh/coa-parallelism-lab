import { Plus, RotateCcw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { nextTaskId, type Task } from '../simulation/engine';

export interface TaskRow {
  key: number;
  id: string;
  duration: string;
  dependencies: string;
}
export const toRows = (tasks: Task[]): TaskRow[] =>
  tasks.map((t, i) => ({
    key: i,
    id: t.id,
    duration: String(t.duration),
    dependencies: t.dependencies.join(', '),
  }));
export const toTasks = (rows: TaskRow[]): Task[] =>
  rows.map((t) => ({
    id: t.id.trim(),
    duration: t.duration.trim() ? Number(t.duration) : NaN,
    dependencies: t.dependencies.trim() ? t.dependencies.split(',').map((d) => d.trim()) : [],
  }));

export default function TaskEditor({
  rows,
  errors,
  onChange,
  onDefault,
}: {
  rows: TaskRow[];
  errors: string[];
  onChange: (rows: TaskRow[]) => void;
  onDefault: () => void;
}) {
  function edit(key: number, field: keyof Omit<TaskRow, 'key'>, value: string) {
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }
  function add() {
    if (rows.length >= 40) return;
    const id = nextTaskId(rows.map((r) => r.id));
    onChange([
      ...rows,
      { key: Math.max(-1, ...rows.map((r) => r.key)) + 1, id, duration: '1', dependencies: '' },
    ]);
  }
  return (
    <section className="panel task-panel" aria-labelledby="task-title">
      <div className="panel-heading">
        <div>
          <h2 id="task-title">Task workload</h2>
          <p>Define the work. Connect the dependencies.</p>
        </div>
        <span className="tag">{rows.length} tasks</span>
      </div>
      <div className="table-scroll">
        <table className="editor-table">
          <caption className="sr-only">
            Edit task IDs, durations in time units, and comma-separated prerequisite IDs.
          </caption>
          <thead>
            <tr>
              <th scope="col">Task ID</th>
              <th scope="col">Duration</th>
              <th scope="col">Prerequisites</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key}>
                <td>
                  <input
                    aria-label={`Task ${i + 1} ID`}
                    value={row.id}
                    maxLength={12}
                    onChange={(e) => edit(row.key, 'id', e.target.value.toUpperCase())}
                  />
                </td>
                <td>
                  <div className="duration-field">
                    <input
                      aria-label={`Task ${i + 1} duration`}
                      type="number"
                      min="0.001"
                      max="10000"
                      step="0.001"
                      value={row.duration}
                      onChange={(e) => edit(row.key, 'duration', e.target.value)}
                    />
                    <span>tu</span>
                  </div>
                </td>
                <td>
                  <input
                    aria-label={`Task ${i + 1} prerequisites`}
                    value={row.dependencies}
                    placeholder="None"
                    onChange={(e) => edit(row.key, 'dependencies', e.target.value.toUpperCase())}
                  />
                </td>
                <td>
                  <button
                    className="icon-button danger"
                    aria-label={`Remove task ${row.id || i + 1}`}
                    onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="editor-actions">
        <button className="text-button" disabled={rows.length >= 40} onClick={add}>
          <Plus size={16} /> Add task
        </button>
        <button className="text-button muted" onClick={onDefault}>
          <RotateCcw size={14} /> Load default
        </button>
      </div>
      <p className="field-hint">
        Prerequisites: comma-separated IDs, e.g. A, B. Up to 40 tasks; durations 0.001–10,000 tu.
      </p>
      {errors.length ? (
        <div className="validation error" role="alert">
          <AlertCircle size={16} />
          <div>
            <strong>Check your workload</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="validation success">
          <CheckCircle2 size={15} /> Valid dependency graph · ready to simulate
        </div>
      )}
    </section>
  );
}
