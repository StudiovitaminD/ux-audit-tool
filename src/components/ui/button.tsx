import Link from "next/link";
import { ComponentProps, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function baseClasses({ variant, size }: { variant: Variant; size: Size }) {
  const sizes: Record<Size, string> = {
    sm: "px-4 py-2 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-4 py-2 text-sm",
  };

  const variants: Record<Variant, string> = {
    primary:
      "bg-[color:var(--ink)] text-[color:var(--cream)] hover:bg-[color:var(--accent)]",
    secondary:
      "bg-[color:var(--white)] text-[color:var(--ink)] border border-[color:var(--cream-dark)] hover:bg-[color:var(--cream)]",
    ghost:
      "bg-transparent text-[color:var(--ink-soft)] border-b border-[color:var(--ink-faint)] rounded-none px-0 hover:text-[color:var(--accent)] hover:border-[color:var(--accent)]",
    danger:
      "bg-red-600 text-white hover:bg-red-700",
  };

  return cx(
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors",
    variant === "ghost" ? "" : "rounded-full",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--cream)]",
    "disabled:pointer-events-none disabled:opacity-50",
    sizes[size],
    variants[variant],
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = "secondary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx(baseClasses({ variant, size }), className)}
      {...props}
    />
  );
});

export function ButtonLink({
  href,
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      href={href}
      className={cx(baseClasses({ variant, size }), className)}
      {...props}
    />
  );
}
