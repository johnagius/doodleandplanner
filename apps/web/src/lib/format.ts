/** Format a number as currency, falling back gracefully for unknown codes. */
export function formatMoney(amount: number, currency = 'EUR', locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Supported currencies offered in the budget UI. */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'] as const;
