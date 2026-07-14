"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@openmarket/ui";

/**
 * Platform-aware shortcut label. "⌘K" means nothing to the majority of
 * visitors on Windows/Android/Linux — show "Ctrl K" there instead. Resolved
 * after mount (UA sniffing is a client concept); SSR renders no badge, which
 * also keeps hydration deterministic.
 */
function useShortcutLabel(requested?: string): string | undefined {
  const [label, setLabel] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!requested) return;
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform ?? "");
    setLabel(requested.replace("⌘", isMac ? "⌘" : "Ctrl "));
  }, [requested]);
  return label;
}

interface SearchFormProps {
  defaultValue?: string;
  size?: "sm" | "md" | "lg";
  placeholder?: string;
  shortcut?: string;
  className?: string;
}

export function SearchForm({
  defaultValue = "",
  size = "md",
  placeholder = "Search apps...",
  shortcut,
  className,
}: SearchFormProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const shortcutLabel = useShortcutLabel(shortcut);

  const handleSubmit = useCallback(() => {
    const q = value.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/search");
    }
  }, [value, router]);

  return (
    <SearchInput
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
      placeholder={placeholder}
      shortcut={shortcutLabel}
      size={size}
      className={className}
    />
  );
}
