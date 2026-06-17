import type { CatalogDataset } from "@/lib/platform-types";

export function buildFullCatalogSnapshot(dataset: CatalogDataset): string {
  if (dataset.rows.length === 0 || dataset.headers.length === 0) {
    return [
      "# RETRIEVED CATALOG CONTEXT",
      "",
      "- **Intent summary:** Active full catalog snapshot is empty.",
      "- **Applied filters:** full_catalog=yes",
      "- **Result count:** 0",
      "- **Relaxed filters:** no",
      "",
      "## CATALOG DATA",
      "",
      "(none)",
    ].join("\n");
  }

  const headerLine = dataset.headers.join(" | ");
  const separatorLine = dataset.headers.map(() => "---").join(" | ");
  const dataLines = dataset.rows.map((row) =>
    dataset.headers.map((header) => String(row[header] ?? "").trim()).join(" | ")
  );

  return [
    "# RETRIEVED CATALOG CONTEXT",
    "",
    "- **Intent summary:** Active tenant full catalog snapshot.",
    "- **Applied filters:** full_catalog=yes",
    `- **Result count:** ${dataset.rows.length}`,
    "- **Relaxed filters:** no",
    "",
    "## CATALOG DATA",
    "",
    headerLine,
    separatorLine,
    ...dataLines,
  ].join("\n");
}
