"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type AccordionContextValue = {
  value: string | null;
  setValue: (value: string | null) => void;
  collapsible: boolean;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  const context = React.useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be used within Accordion");
  }
  return context;
}

type AccordionItemContextValue = {
  itemValue: string;
};

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

function useAccordionItemContext() {
  const context = React.useContext(AccordionItemContext);
  if (!context) {
    throw new Error("Accordion item components must be used within AccordionItem");
  }
  return context;
}

function Accordion({
  children,
  defaultValue = null,
  type = "single",
  collapsible = true,
  className,
}: {
  children: React.ReactNode;
  defaultValue?: string | null;
  type?: "single";
  collapsible?: boolean;
  className?: string;
}) {
  const [value, setValue] = React.useState<string | null>(defaultValue);

  const contextValue = React.useMemo<AccordionContextValue>(
    () => ({ value, setValue, collapsible }),
    [value, collapsible]
  );

  return (
    <AccordionContext.Provider value={contextValue}>
      <div data-slot="accordion" data-type={type} className={cn("space-y-4", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({
  children,
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  value: string;
}) {
  return (
    <AccordionItemContext.Provider value={{ itemValue: value }}>
      <div data-slot="accordion-item" className={className} {...props}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

function AccordionTrigger({
  children,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { value, setValue, collapsible } = useAccordionContext();
  const { itemValue } = useAccordionItemContext();
  const isOpen = value === itemValue;

  return (
    <button
      type="button"
      data-slot="accordion-trigger"
      aria-expanded={isOpen}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setValue(isOpen && collapsible ? null : itemValue);
        }
      }}
      className={cn("flex w-full items-center justify-between gap-4 text-left transition-colors", className)}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base text-[var(--widget-text-muted)] transition-transform duration-200",
          isOpen && "rotate-180"
        )}
        style={{ borderColor: "var(--widget-border)" }}
      >
        ˅
      </span>
    </button>
  );
}

function AccordionContent({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { value } = useAccordionContext();
  const { itemValue } = useAccordionItemContext();
  const isOpen = value === itemValue;

  if (!isOpen) return null;

  return (
    <div data-slot="accordion-content" className={cn(className)}>
      {children}
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };