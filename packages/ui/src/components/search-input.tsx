"use client";

import React from "react";
import { cn } from "../lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  shortcut?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SearchInput({
  value, onChange, onSubmit, placeholder = "Search apps...",
  shortcut, size = "md", className,
}: SearchInputProps) {
  const sizeClasses = {
    sm: "h-9 text-sm pl-9 pr-3",
    md: "h-11 text-base pl-11 pr-4",
    lg: "h-14 text-lg pl-12 pr-5",
  };
  const iconSizes = { sm: "w-4 h-4 left-2.5", md: "w-5 h-5 left-3", lg: "w-5 h-5 left-3.5" };

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
      className={cn("relative", className)}
    >
      <svg
        aria-hidden="true"
        className={cn("absolute top-1/2 -translate-y-1/2 text-om-ink-soft pointer-events-none", iconSizes[size])}
        fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "w-full rounded-xl border border-om-line bg-om-surface text-om-ink",
          "focus:outline-none focus:ring-2 focus:ring-om-primary focus:border-om-primary",
          "placeholder:text-om-ink-soft transition-all duration-200",
          sizeClasses[size]
        )}
      />
      {shortcut && !value && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 rounded-md border border-om-line bg-om-surface-tint px-1.5 py-0.5 text-xs text-om-ink-soft font-mono">
          {shortcut}
        </kbd>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-om-ink-soft hover:text-om-ink transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}
