import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-2xl border border-[var(--widget-border)] bg-[var(--widget-surface)] px-4 py-3 text-sm text-[var(--widget-text)] placeholder:text-[var(--widget-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--widget-focus)]/20",
          className
        )}
        {...props}
      />
    );
  }
);

export { Input };
