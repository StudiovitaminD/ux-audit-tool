import { ComponentProps, PropsWithChildren, ReactNode, useId } from "react";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Field({
  label,
  hint,
  error,
  children,
}: PropsWithChildren<{
  label: ReactNode;
  hint?: string;
  error?: string;
}>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium text-[color:var(--ink)]">
          {label} <span className="text-[color:var(--accent)]" aria-label="required">*</span>
        </label>
        {hint ? (
          <span className="text-xs text-[color:var(--ink-muted)]">{hint}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 font-medium transition-opacity">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function shouldSpellCheckInput(type: ComponentProps<"input">["type"]) {
  return !["email", "number", "password", "tel", "url"].includes(String(type ?? "text"));
}

export function TextInput({
  className,
  spellCheck,
  type,
  lang,
  autoCorrect,
  autoCapitalize,
  required,
  ...props
}: ComponentProps<"input">) {
  const enableSpellCheck = spellCheck ?? shouldSpellCheckInput(type);

  return (
    <input
      type={type}
      spellCheck={enableSpellCheck}
      lang={enableSpellCheck ? lang ?? "en-US" : lang}
      autoCorrect={enableSpellCheck ? autoCorrect ?? "on" : autoCorrect}
      autoCapitalize={enableSpellCheck ? autoCapitalize ?? "sentences" : autoCapitalize}
      className={cx(
        "h-11 w-full rounded-[var(--radius-sm)] border bg-[color:var(--white)] px-4 text-[15px] outline-none text-[color:var(--ink)]",
        "border-[color:var(--cream-dark)] transition-all",
        "placeholder:text-[color:var(--ink-faint)]",
        "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/15",
        className,
      )}
      required={required ?? true}
      {...props}
    />
  );
}

export function Select({
  className,
  required,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "h-11 w-full appearance-none rounded-[var(--radius-sm)] border bg-[color:var(--white)] px-4 pr-12 text-[15px] outline-none text-[color:var(--ink)]",
        "border-[color:var(--cream-dark)] transition-all",
        "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/15",
        className,
      )}
      required={required ?? true}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23222222' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.9rem center",
        backgroundSize: "1rem 1rem",
      }}
      {...props}
    />
  );
}

export function Textarea({
  className,
  spellCheck,
  lang,
  autoCorrect,
  autoCapitalize,
  required,
  ...props
}: ComponentProps<"textarea">) {
  const enableSpellCheck = spellCheck ?? true;

  return (
    <textarea
      spellCheck={enableSpellCheck}
      lang={enableSpellCheck ? lang ?? "en-US" : lang}
      autoCorrect={enableSpellCheck ? autoCorrect ?? "on" : autoCorrect}
      autoCapitalize={enableSpellCheck ? autoCapitalize ?? "sentences" : autoCapitalize}
      required={required ?? true}
      className={cx(
        "min-h-28 w-full resize-y rounded-[var(--radius-sm)] border bg-[color:var(--white)] px-4 py-3 text-[15px] outline-none text-[color:var(--ink)]",
        "border-[color:var(--cream-dark)] transition-all",
        "placeholder:text-[color:var(--ink-faint)]",
        "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/15",
        className,
      )}
      {...props}
    />
  );
}

export function useFieldId() {
  return useId();
}
