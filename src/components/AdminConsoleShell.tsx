import Link from "next/link";
import { Button } from "@/components/ui/button";

function tabClass(active: boolean): string {
  return active
    ? "rounded-full border px-4 py-2 text-sm font-medium text-[var(--widget-text)] bg-[var(--widget-surface)] shadow-sm"
    : "rounded-full border px-4 py-2 text-sm font-medium text-[var(--widget-text-muted)] bg-transparent";
}

export default function AdminConsoleShell({
  activeSection,
  title,
  description,
  children,
}: {
  activeSection: "tenants" | "analytics";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-6 py-10" style={{ background: "var(--widget-surface-alt)" }}>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h1 className="text-3xl font-semibold" style={{ color: "var(--widget-text)" }}>
                {title}
              </h1>
              <p className="mt-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                {description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin" className={tabClass(activeSection === "tenants")} style={{ borderColor: "var(--widget-border)" }}>
                Tenant Admin
              </Link>
              <Link href="/admin/analytics" className={tabClass(activeSection === "analytics")} style={{ borderColor: "var(--widget-border)" }}>
                Analytics
              </Link>
            </div>
          </div>
          <form action="/api/admin/logout" method="post">
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </div>

        {children}
      </div>
    </main>
  );
}