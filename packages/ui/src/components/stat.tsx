import React from "react";
import { cn } from "../lib/utils";

interface StatProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  color?: "blue" | "green" | "red" | "amber" | "violet" | "gray";
  className?: string;
}

const colorMap = {
  blue: "bg-om-info/10 text-om-info",
  green: "bg-om-cta/10 text-om-cta",
  red: "bg-om-danger/10 text-om-danger",
  amber: "bg-om-warning/10 text-om-warning",
  violet: "bg-om-primary/10 text-om-primary",
  gray: "bg-om-line-soft text-om-ink-mute",
};

export function Stat({ label, value, icon, trend, color = "violet", className }: StatProps) {
  return (
    <div className={cn("rounded-xl border border-om-line bg-om-surface p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-om-ink-soft">{label}</span>
        {icon && (
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-om-ink">{value}</span>
        {trend && (
          <span className={cn(
            "text-xs font-medium mb-1",
            trend.value >= 0 ? "text-om-cta" : "text-om-danger"
          )}>
            {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
