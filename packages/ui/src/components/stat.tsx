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
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  gray: "bg-gray-50 text-gray-600",
};

export function Stat({ label, value, icon, trend, color = "blue", className }: StatProps) {
  return (
    <div className={cn("rounded-xl border border-gray-100 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && (
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend && (
          <span className={cn(
            "text-xs font-medium mb-1",
            trend.value >= 0 ? "text-emerald-600" : "text-red-600"
          )}>
            {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
