"use client";

import { useMemo } from "react";

type Option = { label: string; value: string };

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select…",
}: {
  options: Option[];
  values: string[];
  onChange: (nextValues: string[]) => void;
  placeholder?: string;
}) {
  const selectedSet = useMemo(() => new Set(values), [values]);

  return (
    <div className="flex flex-wrap gap-2 rounded-[var(--radius)] border bg-[color:var(--cream)] p-2 border-[color:var(--cream-dark)]">
      {options.map((opt) => {
        const selected = selectedSet.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (selected) {
                onChange(values.filter((v) => v !== opt.value));
              } else {
                onChange([...values, opt.value]);
              }
            }}
            className={cx(
              "rounded-full px-4 py-2 text-[15px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--cream)]",
              selected
                ? "bg-[color:var(--ink)] text-[color:var(--cream)]"
                : "bg-[color:var(--white)] text-[color:var(--ink-soft)] hover:bg-[color:var(--cream-mid)] border border-[color:var(--cream-dark)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {values.length === 0 && placeholder ? (
        <span className="px-2 py-2 text-[15px] text-[color:var(--ink-faint)]">
          {placeholder}
        </span>
      ) : null}
    </div>
  );
}
