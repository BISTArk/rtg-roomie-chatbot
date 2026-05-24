import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  default: "border-transparent bg-[var(--widget-accent)] text-[var(--widget-accent-text)] hover:opacity-95",
  outline: "border-[var(--widget-border)] bg-[var(--widget-surface)] text-[var(--widget-text)] hover:bg-[var(--widget-surface-alt)]",
  ghost: "border-transparent bg-transparent text-[var(--widget-text)] hover:bg-[var(--widget-surface-alt)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4 py-2 text-sm",
  sm: "h-9 px-3 py-2 text-sm",
  lg: "h-12 px-5 py-3 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
});

export { Button };
