"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "var(--color-brand-blue)",
  "var(--color-gold)",
  "var(--color-magenta)",
  "var(--color-teal)",
  "var(--color-violet)",
  "var(--color-brand-green)",
  "var(--color-brand-orange)",
  "var(--color-danger)",
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
            <Pie data={chartData} dataKey="value" nameKey="day" cx="35%" cy="50%" outerRadius={88} innerRadius={52} paddingAngle={2} cornerRadius={4} stroke="none">
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
