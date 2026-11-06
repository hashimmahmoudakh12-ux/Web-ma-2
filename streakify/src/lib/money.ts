/**
 * Money is always stored as whole cents (integers) so we never get
 * floating-point surprises like 0.1 + 0.2 = 0.30000000000000004.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
