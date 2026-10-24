export type CurrencyId = "ILS" | "USD" | "EUR" | "GBP" | string;

export interface Money {
  price: number;
  currencyId: CurrencyId;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function normalizeMoney(
  moneyOrPrice?: Money | number,
  defaultCurrencyId: CurrencyId = "ILS"
): Money {
  if (
    moneyOrPrice &&
    typeof moneyOrPrice === "object" &&
    typeof moneyOrPrice.price === "number"
  ) {
    return {
      price: moneyOrPrice.price,
      currencyId: moneyOrPrice.currencyId || defaultCurrencyId,
    };
  }
  if (typeof moneyOrPrice === "number") {
    return {
      price: moneyOrPrice,
      currencyId: defaultCurrencyId,
    };
  }
  return { price: 0, currencyId: defaultCurrencyId };
}

export function formatMoney(money: Money): string {
  const safe = normalizeMoney(money);
  const symbol = CURRENCY_SYMBOLS[safe.currencyId] || `${safe.currencyId} `;
  const formatted = Number.isInteger(safe.price)
    ? safe.price.toString()
    : safe.price.toFixed(2);
  return `${symbol}${formatted}`;
}
