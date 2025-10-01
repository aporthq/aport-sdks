/**
 * Currency Exchange Rates Utility
 *
 * Provides real-time currency exchange rates for accurate
 * assurance level calculations and currency conversions.
 */

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
  source: string;
}

export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

/**
 * Currency exchange rate service
 */
export class CurrencyRateService {
  private cache: Map<string, ExchangeRate> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(private kv: KVNamespace, private apiKey?: string) {}

  /**
   * Get exchange rate from one currency to another
   */
  async getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1.0;

    const cacheKey = `${from}_${to}`;
    const now = Date.now();

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.cache.get(cacheKey)!.rate;
      }
    }

    // Try to get from KV cache
    try {
      const cached = (await this.kv.get(
        `exchange_rate:${cacheKey}`,
        "json"
      )) as ExchangeRate | null;
      if (cached && now - cached.timestamp < this.CACHE_TTL) {
        this.cache.set(cacheKey, cached);
        this.cacheExpiry.set(cacheKey, cached.timestamp + this.CACHE_TTL);
        return cached.rate;
      }
    } catch (error) {
      console.warn("Failed to get cached exchange rate:", error);
    }

    // Fetch from external API
    try {
      const rate = await this.fetchExchangeRate(from, to);

      // Cache the result
      const exchangeRate: ExchangeRate = {
        from,
        to,
        rate,
        timestamp: now,
        source: "external_api",
      };

      this.cache.set(cacheKey, exchangeRate);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

      // Store in KV for persistence
      try {
        await this.kv.put(
          `exchange_rate:${cacheKey}`,
          JSON.stringify(exchangeRate),
          { expirationTtl: 300 } // 5 minutes
        );
      } catch (kvError) {
        console.warn("Failed to cache exchange rate in KV:", kvError);
      }

      return rate;
    } catch (error) {
      console.error("Failed to fetch exchange rate:", error);

      // Fallback to hardcoded rates
      return this.getHardcodedRate(from, to);
    }
  }

  /**
   * Convert amount from one currency to another
   */
  async convertAmount(
    amount: number,
    from: string,
    to: string
  ): Promise<number> {
    const rate = await this.getExchangeRate(from, to);
    return Math.round(amount * rate);
  }

  /**
   * Get USD equivalent for assurance level calculation
   */
  async getUSDEquivalent(amount: number, currency: string): Promise<number> {
    if (currency === "USD") return amount;
    return await this.convertAmount(amount, currency, "USD");
  }

  /**
   * Fetch exchange rate from external API with validation
   */
  private async fetchExchangeRate(from: string, to: string): Promise<number> {
    // Use a free exchange rate API
    const url = this.apiKey
      ? `https://api.exchangerate-api.com/v4/latest/${from}?access_key=${this.apiKey}`
      : `https://api.exchangerate-api.com/v4/latest/${from}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Agent-Passport/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API failed: ${response.status}`);
    }

    const data = (await response.json()) as CurrencyRates;
    const rate = data.rates[to];

    if (!rate) {
      throw new Error(`Exchange rate not found for ${from} to ${to}`);
    }

    // Validate rate is reasonable (prevent manipulation)
    if (!this.isValidExchangeRate(rate, from, to)) {
      throw new Error(
        `Exchange rate ${rate} for ${from} to ${to} is outside reasonable bounds`
      );
    }

    return rate;
  }

  /**
   * Validate exchange rate is within reasonable bounds
   */
  private isValidExchangeRate(rate: number, from: string, to: string): boolean {
    // Basic sanity checks
    if (!Number.isFinite(rate) || rate <= 0) {
      return false;
    }

    // Define reasonable bounds for common currency pairs
    const bounds: Record<string, { min: number; max: number }> = {
      USD_EUR: { min: 0.5, max: 2.0 },
      USD_GBP: { min: 0.5, max: 2.0 },
      USD_JPY: { min: 50, max: 200 },
      USD_CAD: { min: 0.8, max: 2.0 },
      USD_AUD: { min: 0.8, max: 2.0 },
      USD_CHF: { min: 0.5, max: 2.0 },
      USD_CNY: { min: 3, max: 15 },
      USD_INR: { min: 30, max: 150 },
      USD_BRL: { min: 2, max: 10 },
      USD_MXN: { min: 10, max: 50 },
    };

    const key = `${from}_${to}`;
    const reverseKey = `${to}_${from}`;

    if (bounds[key]) {
      return rate >= bounds[key].min && rate <= bounds[key].max;
    } else if (bounds[reverseKey]) {
      // For reverse pairs, check 1/rate
      const reverseRate = 1 / rate;
      return (
        reverseRate >= bounds[reverseKey].min &&
        reverseRate <= bounds[reverseKey].max
      );
    }

    // For unknown pairs, use general bounds (0.001 to 1000)
    return rate >= 0.001 && rate <= 1000;
  }

  /**
   * Fallback hardcoded rates (for when API is unavailable)
   */
  private getHardcodedRate(from: string, to: string): number {
    const rates: Record<string, Record<string, number>> = {
      USD: {
        EUR: 0.85,
        GBP: 0.73,
        JPY: 110.0,
        CAD: 1.25,
        AUD: 1.35,
        CHF: 0.92,
        CNY: 6.45,
        INR: 74.0,
        BRL: 5.2,
        MXN: 20.0,
      },
      EUR: {
        USD: 1.18,
        GBP: 0.86,
        JPY: 129.0,
        CAD: 1.47,
        AUD: 1.59,
        CHF: 1.08,
        CNY: 7.59,
        INR: 87.0,
        BRL: 6.12,
        MXN: 23.5,
      },
      GBP: {
        USD: 1.37,
        EUR: 1.16,
        JPY: 150.0,
        CAD: 1.71,
        AUD: 1.85,
        CHF: 1.26,
        CNY: 8.82,
        INR: 101.0,
        BRL: 7.12,
        MXN: 27.4,
      },
      JPY: {
        USD: 0.0091,
        EUR: 0.0077,
        GBP: 0.0067,
        CAD: 0.011,
        AUD: 0.012,
        CHF: 0.0084,
        CNY: 0.059,
        INR: 0.68,
        BRL: 0.047,
        MXN: 0.18,
      },
    };

    // Try direct conversion
    if (rates[from] && rates[from][to]) {
      return rates[from][to];
    }

    // Try reverse conversion
    if (rates[to] && rates[to][from]) {
      return 1 / rates[to][from];
    }

    // Try USD as intermediate currency
    if (rates.USD[from] && rates.USD[to]) {
      return rates.USD[to] / rates.USD[from];
    }

    // Default fallback
    console.warn(`No exchange rate found for ${from} to ${to}, using 1.0`);
    return 1.0;
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    return [
      "USD",
      "EUR",
      "GBP",
      "JPY",
      "CAD",
      "AUD",
      "CHF",
      "CNY",
      "INR",
      "BRL",
      "MXN",
      "KWD",
      "BHD",
      "SAR",
      "AED",
    ];
  }

  /**
   * Validate currency code
   */
  isValidCurrency(currency: string): boolean {
    return this.getSupportedCurrencies().includes(currency);
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

/**
 * Singleton instance for global use
 */
let currencyRateService: CurrencyRateService | null = null;

export function getCurrencyRateService(
  kv: KVNamespace,
  apiKey?: string
): CurrencyRateService {
  if (!currencyRateService) {
    currencyRateService = new CurrencyRateService(kv, apiKey);
  }
  return currencyRateService;
}
