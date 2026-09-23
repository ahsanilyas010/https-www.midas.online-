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

export function FunnelChart({
  label,
  data,
}: {
  label: string;
  data: { stage: string; value: number }[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink">{label}</p>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie data={data} dataKey="value" nameKey="stage" cx="35%" cy="50%" outerRadius={88} innerRadius={52} paddingAngle={2} cornerRadius={4} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--color-line)" }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
