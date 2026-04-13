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
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
      className={cn("relative", className)}
    >
      <svg
        className={cn("absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none", iconSizes[size])}
        fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-xl border border-gray-200 bg-white",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
          "placeholder:text-gray-400 transition-all duration-200",
          sizeClasses[size]
        )}
      />
      {shortcut && !value && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400 font-mono">
          {shortcut}
        </kbd>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}
