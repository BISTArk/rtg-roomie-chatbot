import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-[color:color-mix(in_srgb,var(--widget-accent)_16%,transparent)] text-[var(--widget-text)]",
  secondary: "border-transparent bg-[color:color-mix(in_srgb,var(--widget-border)_42%,transparent)] text-[var(--widget-text)]",
  outline: "border-[var(--widget-border)] bg-transparent text-[var(--widget-text)]",
  success: "border-transparent bg-[color:color-mix(in_srgb,#16a34a_16%,transparent)] text-[var(--widget-text)]",
};

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };