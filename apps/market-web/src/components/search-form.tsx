"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@openmarket/ui";

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
      shortcut={shortcut}
      size={size}
      className={className}
    />
  );
}
