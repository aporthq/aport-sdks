/**
 * Money Management Utilities
 *
 * Centralized utilities for handling money-related operations,
 * currency validation, and financial calculations.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  decimals: number;
  symbol: string;
  minorUnit: string;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface CurrencyLimits {
  max_per_tx: number;
  daily_cap: number;
}

/**
 * Currency information registry
 */
export const CURRENCY_REGISTRY: Record<string, CurrencyInfo> = {
  USD: {
    code: "USD",
    name: "US Dollar",
    decimals: 2,
    symbol: "$",
    minorUnit: "cents",
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    decimals: 2,
    symbol: "€",
    minorUnit: "cents",
  },
  GBP: {
    code: "GBP",
    name: "British Pound",
    decimals: 2,
    symbol: "£",
    minorUnit: "pence",
  },
  JPY: {
    code: "JPY",
    name: "Japanese Yen",
    decimals: 0,
    symbol: "¥",
    minorUnit: "yen",
  },
  CAD: {
    code: "CAD",
    name: "Canadian Dollar",
    decimals: 2,
    symbol: "C$",
    minorUnit: "cents",
  },
  AUD: {
    code: "AUD",
    name: "Australian Dollar",
    decimals: 2,
    symbol: "A$",
    minorUnit: "cents",
  },
  CHF: {
    code: "CHF",
    name: "Swiss Franc",
    decimals: 2,
    symbol: "CHF",
    minorUnit: "centimes",
  },
  KWD: {
    code: "KWD",
    name: "Kuwaiti Dinar",
    decimals: 3,
    symbol: "د.ك",
    minorUnit: "fils",
  },
  BHD: {
    code: "BHD",
    name: "Bahraini Dinar",
    decimals: 3,
    symbol: "د.ب",
    minorUnit: "fils",
  },
  SAR: {
    code: "SAR",
    name: "Saudi Riyal",
    decimals: 2,
    symbol: "ر.س",
    minorUnit: "halalas",
  },
  AED: {
    code: "AED",
    name: "UAE Dirham",
    decimals: 2,
    symbol: "د.إ",
    minorUnit: "fils",
  },
  INR: {
    code: "INR",
    name: "Indian Rupee",
    decimals: 2,
    symbol: "₹",
    minorUnit: "paise",
  },
  CNY: {
    code: "CNY",
    name: "Chinese Yuan",
    decimals: 2,
    symbol: "¥",
    minorUnit: "fen",
  },
  BRL: {
    code: "BRL",
    name: "Brazilian Real",
    decimals: 2,
    symbol: "R$",
    minorUnit: "centavos",
  },
  MXN: {
    code: "MXN",
    name: "Mexican Peso",
    decimals: 2,
    symbol: "$",
    minorUnit: "centavos",
  },
};

/**
 * Validate amount precision for currency
 */
export function isValidAmountForCurrency(
  amountMinor: number,
  currency: string
): boolean {
  const currencyInfo = CURRENCY_REGISTRY[currency];
  if (!currencyInfo) {
    // For unknown currencies, allow integer values
    return Number.isInteger(amountMinor);
  }

  // Check if amount is valid for currency's decimal places
  if (currencyInfo.decimals === 0) {
    // No decimal places (like JPY)
    return Number.isInteger(amountMinor);
  } else {
    // Has decimal places (like USD, EUR)
    return Number.isInteger(amountMinor);
  }
}

/**
 * Validate amount against currency-specific rules
 */
export function validateAmountForCurrency(
  amountMinor: number,
  currency: string
): { valid: boolean; error?: string } {
  // Basic validation
  const basicValidation = validateAmount(amountMinor);
  if (!basicValidation.valid) {
    return basicValidation;
  }

  // Currency-specific validation
  const currencyInfo = CURRENCY_REGISTRY[currency];
  if (!currencyInfo) {
    return { valid: false, error: `Unsupported currency: ${currency}` };
  }

  // Check precision
  if (!isValidAmountForCurrency(amountMinor, currency)) {
    return {
      valid: false,
      error: `Amount ${amountMinor} has invalid precision for currency ${currency} (${currencyInfo.decimals} decimal places)`,
    };
  }

  // Check for reasonable bounds (prevent extreme amounts)
  const maxAmount = 1000000000; // 10 billion in minor units
  if (amountMinor > maxAmount) {
    return {
      valid: false,
      error: `Amount ${amountMinor} exceeds maximum allowed amount ${maxAmount}`,
    };
  }

  // Check for minimum amount (prevent dust attacks)
  const minAmount = 1; // 1 minor unit minimum
  if (amountMinor < minAmount) {
    return {
      valid: false,
      error: `Amount ${amountMinor} is below minimum allowed amount ${minAmount}`,
    };
  }

  return { valid: true };
}

/**
 * Validate amount is positive and within safe limits
 */
export function validateAmount(amountMinor: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isFinite(amountMinor)) {
    return { valid: false, error: "Amount must be a finite number" };
  }

  if (amountMinor <= 0) {
    return { valid: false, error: "Amount must be positive" };
  }

  if (amountMinor > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: "Amount exceeds maximum safe integer" };
  }

  if (!Number.isInteger(amountMinor)) {
    return { valid: false, error: "Amount must be an integer (minor units)" };
  }

  return { valid: true };
}

/**
 * Convert amount to USD equivalent for assurance level calculation
 * Note: This is a simplified implementation for v1 - use CurrencyRateService for production
 */
export function convertToUSD(amountMinor: number, currency: string): number {
  // Simple conversion rates for v1 (in production, use real-time rates)
  const conversionRates: Record<string, number> = {
    USD: 1.0,
    EUR: 1.1,
    GBP: 1.25,
    JPY: 0.0067, // 1 JPY = 0.0067 USD (rough)
    CAD: 0.75,
    AUD: 0.65,
    CHF: 1.1,
    KWD: 3.3,
    BHD: 2.65,
    SAR: 0.27,
    AED: 0.27,
    INR: 0.012,
    CNY: 0.14,
    BRL: 0.2,
    MXN: 0.05,
  };

  const rate = conversionRates[currency] || 1.0;
  return Math.round(amountMinor * rate);
}

/**
 * Convert amount to USD equivalent using real-time rates
 * This is the production-ready version
 */
export async function convertToUSDAsync(
  amountMinor: number,
  currency: string,
  currencyRateService: any
): Promise<number> {
  if (currency === "USD") return amountMinor;

  try {
    return await currencyRateService.getUSDEquivalent(amountMinor, currency);
  } catch (error) {
    console.warn(
      "Failed to get real-time exchange rate, using fallback:",
      error
    );
    return convertToUSD(amountMinor, currency);
  }
}

/**
 * Format amount for display
 */
export function formatAmount(amountMinor: number, currency: string): string {
  const currencyInfo = CURRENCY_REGISTRY[currency];
  if (!currencyInfo) {
    return `${amountMinor} ${currency}`;
  }

  const majorAmount = amountMinor / Math.pow(10, currencyInfo.decimals);
  return `${currencyInfo.symbol}${majorAmount.toFixed(currencyInfo.decimals)}`;
}

/**
 * Get currency information
 */
export function getCurrencyInfo(currency: string): CurrencyInfo | null {
  return CURRENCY_REGISTRY[currency] || null;
}

/**
 * Validate currency code
 */
export function isValidCurrency(currency: string): boolean {
  return currency in CURRENCY_REGISTRY;
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(CURRENCY_REGISTRY);
}

/**
 * Check if amount exceeds daily cap
 */
export function checkDailyCap(
  amountMinor: number,
  currency: string,
  currencyLimits: CurrencyLimits,
  dailyUsage: number = 0
): { allowed: boolean; reason?: string; remaining?: number } {
  if (amountMinor > currencyLimits.max_per_tx) {
    return {
      allowed: false,
      reason: `Amount ${formatAmount(
        amountMinor,
        currency
      )} exceeds per-transaction limit ${formatAmount(
        currencyLimits.max_per_tx,
        currency
      )}`,
    };
  }

  if (dailyUsage + amountMinor > currencyLimits.daily_cap) {
    return {
      allowed: false,
      reason: `Refund would exceed daily cap ${formatAmount(
        currencyLimits.daily_cap,
        currency
      )} (current usage: ${formatAmount(dailyUsage, currency)})`,
      remaining: Math.max(0, currencyLimits.daily_cap - dailyUsage),
    };
  }

  return {
    allowed: true,
    remaining: currencyLimits.daily_cap - dailyUsage - amountMinor,
  };
}

/**
 * Calculate assurance level required for amount (no conversion)
 * Uses currency-specific thresholds based on common equivalents
 */
export function getRequiredAssuranceLevel(
  amountMinor: number,
  currency: string
): string {
  // Define currency-specific thresholds (in minor units)
  // These are rough equivalents to $100 and $500 USD
  const thresholds: Record<string, { l2: number; l3: number }> = {
    USD: { l2: 10000, l3: 50000 }, // $100, $500
    EUR: { l2: 8500, l3: 42500 }, // ~€85, ~€425
    GBP: { l2: 7300, l3: 36500 }, // ~£73, ~£365
    JPY: { l2: 15000, l3: 75000 }, // ~¥15000, ~¥75000
    CAD: { l2: 12500, l3: 62500 }, // ~C$125, ~C$625
    AUD: { l2: 13500, l3: 67500 }, // ~A$135, ~A$675
    CHF: { l2: 9200, l3: 46000 }, // ~CHF92, ~CHF460
    CNY: { l2: 700, l3: 3500 }, // ~¥700, ~¥3500
    INR: { l2: 7400, l3: 37000 }, // ~₹7400, ~₹37000
    BRL: { l2: 520, l3: 2600 }, // ~R$520, ~R$2600
    MXN: { l2: 2000, l3: 10000 }, // ~$2000, ~$10000
  };

  const currencyThresholds = thresholds[currency] || thresholds.USD;

  if (amountMinor <= currencyThresholds.l2) {
    return "L2";
  } else if (amountMinor <= currencyThresholds.l3) {
    return "L3";
  } else {
    return "L4"; // Deny for v1
  }
}

/**
 * Check if current assurance level meets requirement
 */
export function meetsAssuranceRequirement(
  current: string,
  required: string
): boolean {
  const levels = ["L1", "L2", "L3", "L4"];
  const currentIndex = levels.indexOf(current);
  const requiredIndex = levels.indexOf(required);

  if (currentIndex === -1 || requiredIndex === -1) {
    return false;
  }

  return currentIndex >= requiredIndex;
}
