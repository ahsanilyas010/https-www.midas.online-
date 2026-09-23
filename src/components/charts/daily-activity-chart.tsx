"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "var(--color-brand-blue)",
  "var(--color-brand-green)",
  "var(--color-brand-orange)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-brand-blue-hover)",
  "var(--color-brand-green-tint-2)",
  "var(--color-brand-orange-tint-2)",
  "var(--color-brand-blue-tint-2)",
  "var(--color-muted)",
];

export function DailyActivityChart({
  label,
  data,
  valueLabel,
}: {
  label: string;
  data: { day: string; value: number }[];
  valueLabel: string;
}) {
  const chartData = data.map((d) => ({ ...d, day: d.day.slice(5) }));

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink">{label}</p>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie data={chartData} dataKey="value" nameKey="day" cx="35%" cy="50%" outerRadius={85}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--color-line)" }}
              formatter={(value) => [value, valueLabel]}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconSize={8}
              wrapperStyle={{ fontSize: 10, maxHeight: 220, overflowY: "auto" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
