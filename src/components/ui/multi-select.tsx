"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedLabels = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)).map((option) => option.label),
    [options, selectedSet],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && rootRef.current.contains(event.target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border bg-[color:var(--white)] px-4 text-left text-[15px] outline-none text-[color:var(--ink)]",
          "border-[color:var(--cream-dark)] transition-all",
          "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/15",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={selectedLabels.length ? "" : "text-[color:var(--ink-faint)]"}>
          {selectedLabels.length
            ? selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
            : placeholder}
        </span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
          <div className="max-h-72 overflow-auto p-2">
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
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/30",
                    selected ? "bg-[color:var(--cream-mid)]" : "hover:bg-[color:var(--cream)]",
                  )}
                  role="option"
                  aria-selected={selected}
                >
                  <span
                    className={cx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      selected
                        ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--cream)]"
                        : "border-[color:var(--cream-dark)] bg-[color:var(--white)] text-transparent",
                    )}
                  >
                    {selected ? (
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        className="size-3.5"
                        fill="none"
                      >
                        <path
                          d="M3.5 8.5L6.5 11.5L12.5 4.5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="text-[color:var(--ink)]">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[color:var(--cream-dark)] px-3 py-2 text-xs text-[color:var(--ink-muted)]">
            <span>{values.length ? `${values.length} selected` : "Choose one or more options"}</span>
            {values.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-[color:var(--accent)] hover:brightness-110"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
