/**
 * Pure helpers for invoice/billing calculations and VND formatting.
 * Money = integer VND; no floating-point arithmetic.
 */

/**
 * Sum a numeric field from an array of objects (supports both line_total and lineTotal).
 * Useful for computing totals from order_items, checkup_services, or InvoiceLine arrays.
 */
export function sumLineTotals(
  lines: Array<{ line_total?: number; lineTotal?: number } & Record<string, unknown>>
): number {
  return lines.reduce((sum, line) => sum + ((line.line_total ?? line.lineTotal) || 0), 0);
}

/**
 * Format an integer VND amount with Vietnamese locale (₫ suffix, proper grouping).
 */
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
}

/**
 * Format an integer VND amount with compact notation (K, M, B).
 * Useful for charts/dashboards with space constraints.
 */
export function formatVndCompact(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(amount);
}
