"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = [
  "var(--color-brand-blue)",
  "var(--color-gold)",
  "var(--color-magenta)",
  "var(--color-teal)",
  "var(--color-violet)",
  "var(--color-brand-green)",
  "var(--color-brand-orange)",
  "var(--color-muted)",
];

// Leads added per day, stacked by source / connector.
export function SourceTrendChart({
  data,
  sources,
}: {
  data: Record<string, string | number>[];
  sources: string[];
}) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--color-line)" }} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          {sources.map((s, i) => (
            <Bar key={s} dataKey={s} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === sources.length - 1 ? [3, 3, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
