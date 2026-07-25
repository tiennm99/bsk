"use client";

/** 7-day paid-revenue bar chart (recharts). Theme-aware via currentColor. */

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVnd, formatVndCompact } from "@/lib/billing/totals";

const vnd = formatVnd;
const compact = formatVndCompact;

export function RevenueChart({ data }: { data: { day: string; amount: number }[] }) {
  return (
    <div className="h-56 w-full text-current">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} />
          <YAxis
            width={48}
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => vnd(Number(value ?? 0))}
            cursor={{ fill: "currentColor", opacity: 0.08 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="amount" fill="currentColor" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
