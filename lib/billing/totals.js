/**
 * Pure helpers for invoice/billing calculations and VND formatting.
 * Money = integer VND; no floating-point arithmetic.
 */

/**
 * Sum a numeric field from an array of objects (supports both line_total and lineTotal).
 * Useful for computing totals from order_items, checkup_services, or InvoiceLine arrays.
 *
 * @param {Array<{ line_total?: number; lineTotal?: number } & Record<string, unknown>>} lines
 * @returns {number}
 */
export function sumLineTotals(lines) {
  return lines.reduce((sum, line) => sum + ((line.line_total ?? line.lineTotal) || 0), 0);
}

/**
 * Format an integer VND amount with Vietnamese locale (₫ suffix, proper grouping).
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatVnd(amount) {
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
}

/**
 * Format an integer VND amount with compact notation (K, M, B).
 * Useful for charts/dashboards with space constraints.
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatVndCompact(amount) {
  return new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(amount);
}
