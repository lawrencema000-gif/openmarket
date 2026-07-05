import React from "react";
import { cn } from "../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4", className)}>
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-om-surface-tint flex items-center justify-center mb-4 text-om-ink-soft">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-om-ink mb-1">{title}</h3>
      <p className="text-sm text-om-ink-mute text-center max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
