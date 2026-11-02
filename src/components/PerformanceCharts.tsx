import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { Simulation } from '../simulation/engine';

export default function PerformanceCharts({
  results,
  selected,
}: {
  results: Simulation[];
  selected: string;
}) {
  const data = results.map((r) => ({
    name: `${r.configuration.cores}C/${r.configuration.workers}W`,
    makespan: r.makespan,
    speedup: r.speedup,
    utilization: r.utilization * 100,
  }));
  return (
    <div className="charts-grid">
      {(
        [
          { key: 'makespan', title: 'Execution time', unit: 'tu', note: 'Lower is better' },
          { key: 'speedup', title: 'Speedup', unit: '×', note: 'Relative to 1C / 1W' },
          {
            key: 'utilization',
            title: 'Core utilization',
            unit: '%',
            note: 'Useful work / core capacity',
          },
        ] as const
      ).map((metric) => (
        <div className="chart-box" key={metric.key}>
          <div className="chart-heading">
            <h3>
              {metric.title} <span>({metric.unit})</span>
            </h3>
            <p>{metric.note}</p>
          </div>
          <div
            className="chart-wrap"
            role="img"
            aria-label={`${metric.title}: ${data.map((d) => `${d.name}: ${Number(d[metric.key].toFixed(2))}${metric.unit}`).join(', ')}`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={data}
                margin={{ top: 25, right: 10, left: -25, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  dy={7}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={metric.key === 'utilization' ? [0, 100] : [0, 'auto']}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-raised)' }}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text)',
                  }}
                  formatter={(v) => [
                    `${Number(v).toFixed(metric.key === 'speedup' ? 2 : 1)} ${metric.unit}`,
                    metric.title,
                  ]}
                />
                <Bar
                  dataKey={metric.key}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.name}
                      fill={d.name === selected ? 'var(--accent)' : 'var(--chart-blue)'}
                    />
                  ))}
                  <LabelList
                    dataKey={metric.key}
                    position="top"
                    fill="var(--text)"
                    fontSize={11}
                    formatter={(v) => Number(Number(v).toFixed(2)).toString()}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
