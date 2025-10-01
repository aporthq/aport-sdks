/**
 * Region Validation - ISO-3166 Country Code Validation
 *
 * This module provides ISO-3166 country code validation for agent passport regions.
 * Uses a lightweight approach with hardcoded country list for performance.
 */

/**
 * ISO-3166-1 Alpha-2 country codes
 * Source: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
 */
export const ISO_3166_COUNTRIES = new Set([
  // A
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  // B
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  // C
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  // D
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  // E
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  // F
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  // G
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  // H
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  // I
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  // J
  "JE",
  "JM",
  "JO",
  "JP",
  // K
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  // L
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  // M
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  // N
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  // O
  "OM",
  // P
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  // Q
  "QA",
  // R
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  // S
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  // T
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  // U
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  // V
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  // W
  "WF",
  "WS",
  // Y
  "YE",
  "YT",
  // Z
  "ZA",
  "ZM",
  "ZW",
]);

/**
 * Common subdivision codes for major countries (CC-SS format)
 * Only including the most commonly used ones to keep the list manageable
 */
export const ISO_3166_SUBDIVISIONS = new Set([
  // United States (US-XX)
  "US-AL",
  "US-AK",
  "US-AZ",
  "US-AR",
  "US-CA",
  "US-CO",
  "US-CT",
  "US-DE",
  "US-FL",
  "US-GA",
  "US-HI",
  "US-ID",
  "US-IL",
  "US-IN",
  "US-IA",
  "US-KS",
  "US-KY",
  "US-LA",
  "US-ME",
  "US-MD",
  "US-MA",
  "US-MI",
  "US-MN",
  "US-MS",
  "US-MO",
  "US-MT",
  "US-NE",
  "US-NV",
  "US-NH",
  "US-NJ",
  "US-NM",
  "US-NY",
  "US-NC",
  "US-ND",
  "US-OH",
  "US-OK",
  "US-OR",
  "US-PA",
  "US-RI",
  "US-SC",
  "US-SD",
  "US-TN",
  "US-TX",
  "US-UT",
  "US-VT",
  "US-VA",
  "US-WA",
  "US-WV",
  "US-WI",
  "US-WY",
  "US-DC", // District of Columbia

  // Canada (CA-XX)
  "CA-AB",
  "CA-BC",
  "CA-MB",
  "CA-NB",
  "CA-NL",
  "CA-NS",
  "CA-NT",
  "CA-NU",
  "CA-ON",
  "CA-PE",
  "CA-QC",
  "CA-SK",
  "CA-YT",

  // Australia (AU-XX)
  "AU-ACT",
  "AU-NSW",
  "AU-NT",
  "AU-QLD",
  "AU-SA",
  "AU-TAS",
  "AU-VIC",
  "AU-WA",

  // Germany (DE-XX)
  "DE-BW",
  "DE-BY",
  "DE-BE",
  "DE-BB",
  "DE-HB",
  "DE-HH",
  "DE-HE",
  "DE-MV",
  "DE-NI",
  "DE-NW",
  "DE-RP",
  "DE-SL",
  "DE-SN",
  "DE-ST",
  "DE-SH",
  "DE-TH",

  // United Kingdom (GB-XX)
  "GB-ENG",
  "GB-SCT",
  "GB-WLS",
  "GB-NIR",

  // France (FR-XX) - Regions
  "FR-ARA",
  "FR-BFC",
  "FR-BRE",
  "FR-CVL",
  "FR-COR",
  "FR-GES",
  "FR-HDF",
  "FR-IDF",
  "FR-NOR",
  "FR-NAQ",
  "FR-OCC",
  "FR-PDL",
  "FR-PAC",

  // India (IN-XX) - States
  "IN-AP",
  "IN-AR",
  "IN-AS",
  "IN-BR",
  "IN-CT",
  "IN-GA",
  "IN-GJ",
  "IN-HR",
  "IN-HP",
  "IN-JH",
  "IN-KA",
  "IN-KL",
  "IN-MP",
  "IN-MH",
  "IN-MN",
  "IN-ML",
  "IN-MZ",
  "IN-NL",
  "IN-OR",
  "IN-PB",
  "IN-RJ",
  "IN-SK",
  "IN-TN",
  "IN-TG",
  "IN-TR",
  "IN-UP",
  "IN-UT",
  "IN-WB",
  "IN-AN",
  "IN-CH",
  "IN-DN",
  "IN-DD",
  "IN-DL",
  "IN-JK",
  "IN-LA",
  "IN-LD",
  "IN-PY",

  // Brazil (BR-XX)
  "BR-AC",
  "BR-AL",
  "BR-AP",
  "BR-AM",
  "BR-BA",
  "BR-CE",
  "BR-DF",
  "BR-ES",
  "BR-GO",
  "BR-MA",
  "BR-MT",
  "BR-MS",
  "BR-MG",
  "BR-PA",
  "BR-PB",
  "BR-PR",
  "BR-PE",
  "BR-PI",
  "BR-RJ",
  "BR-RN",
  "BR-RS",
  "BR-RO",
  "BR-RR",
  "BR-SC",
  "BR-SP",
  "BR-SE",
  "BR-TO",

  // Mexico (MX-XX)
  "MX-AGU",
  "MX-BCN",
  "MX-BCS",
  "MX-CAM",
  "MX-CHP",
  "MX-CHH",
  "MX-COA",
  "MX-COL",
  "MX-DIF",
  "MX-DUR",
  "MX-GUA",
  "MX-GRO",
  "MX-HID",
  "MX-JAL",
  "MX-MEX",
  "MX-MIC",
  "MX-MOR",
  "MX-NAY",
  "MX-NLE",
  "MX-OAX",
  "MX-PUE",
  "MX-QUE",
  "MX-ROO",
  "MX-SLP",
  "MX-SIN",
  "MX-SON",
  "MX-TAB",
  "MX-TAM",
  "MX-TLA",
  "MX-VER",
  "MX-YUC",
  "MX-ZAC",
]);

/**
 * Region validation result
 */
export interface RegionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a single region code
 * Supports both CC and CC-SS formats per ISO-3166
 */
export function validateRegion(region: string): RegionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!region || typeof region !== "string") {
    errors.push("Region must be a non-empty string");
    return { valid: false, errors, warnings };
  }

  const regionUpper = region.toUpperCase().trim();

  // Check format
  if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(regionUpper)) {
    errors.push(
      `Invalid region format: ${region}. Must be ISO-3166 format (CC or CC-SS)`
    );
    return { valid: false, errors, warnings };
  }

  // Split into country and subdivision
  const parts = regionUpper.split("-");
  const countryCode = parts[0];
  const subdivisionCode = parts[1];

  // Validate country code
  if (!ISO_3166_COUNTRIES.has(countryCode)) {
    errors.push(`Invalid country code: ${countryCode}`);
    return { valid: false, errors, warnings };
  }

  // If subdivision is provided, validate it
  if (subdivisionCode) {
    const fullCode = `${countryCode}-${subdivisionCode}`;
    if (!ISO_3166_SUBDIVISIONS.has(fullCode)) {
      // Don't error on unknown subdivisions, just warn
      // This allows for less common subdivisions while still validating format
      warnings.push(
        `Unknown subdivision code: ${fullCode}. Verify this is a valid ISO-3166-2 code.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an array of region codes
 */
export function validateRegions(regions: string[]): RegionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(regions)) {
    errors.push("Regions must be an array");
    return { valid: false, errors, warnings };
  }

  // Check for duplicates
  const uniqueRegions = new Set();
  const duplicates: string[] = [];

  for (const region of regions) {
    const regionUpper = region.toUpperCase().trim();
    if (uniqueRegions.has(regionUpper)) {
      duplicates.push(region);
    } else {
      uniqueRegions.add(regionUpper);
    }

    // Validate individual region
    const result = validateRegion(region);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (duplicates.length > 0) {
    errors.push(`Duplicate regions: ${duplicates.join(", ")}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Normalize region codes to uppercase and remove duplicates
 */
export function normalizeRegions(regions: string[]): string[] {
  const normalized = new Set<string>();

  for (const region of regions) {
    if (region && typeof region === "string") {
      normalized.add(region.toUpperCase().trim());
    }
  }

  return Array.from(normalized).sort();
}

/**
 * Check if a region is a valid ISO-3166 country code (CC format)
 */
export function isValidCountryCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  return ISO_3166_COUNTRIES.has(code.toUpperCase().trim());
}

/**
 * Check if a region is a valid ISO-3166 subdivision code (CC-SS format)
 */
export function isValidSubdivisionCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  const codeUpper = code.toUpperCase().trim();

  // Must contain a hyphen and be in CC-SS format
  if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(codeUpper)) return false;

  const [countryCode] = codeUpper.split("-");

  // Country must be valid and subdivision must be in our known list
  return (
    ISO_3166_COUNTRIES.has(countryCode) && ISO_3166_SUBDIVISIONS.has(codeUpper)
  );
}

/**
 * Get all valid country codes
 */
export function getValidCountryCodes(): string[] {
  return Array.from(ISO_3166_COUNTRIES).sort();
}

/**
 * Get all valid subdivision codes for a country
 */
export function getValidSubdivisionCodes(countryCode: string): string[] {
  if (!isValidCountryCode(countryCode)) return [];

  const prefix = countryCode.toUpperCase() + "-";
  return Array.from(ISO_3166_SUBDIVISIONS)
    .filter((code) => code.startsWith(prefix))
    .sort();
}

/**
 * Performance-optimized region validator for middleware
 */
export class RegionValidator {
  private countryCache = new Map<string, boolean>();
  private subdivisionCache = new Map<string, boolean>();

  /**
   * Fast validation with caching
   */
  isValid(region: string): boolean {
    if (!region || typeof region !== "string") return false;

    const regionUpper = region.toUpperCase().trim();

    // Check cache first
    if (this.countryCache.has(regionUpper)) {
      return this.countryCache.get(regionUpper)!;
    }

    // Validate format
    if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(regionUpper)) {
      this.countryCache.set(regionUpper, false);
      return false;
    }

    const [countryCode, subdivisionCode] = regionUpper.split("-");

    // Validate country
    if (!ISO_3166_COUNTRIES.has(countryCode)) {
      this.countryCache.set(regionUpper, false);
      return false;
    }

    // If subdivision provided, validate it (allow unknown subdivisions)
    if (subdivisionCode) {
      // Just check that country is valid - don't reject unknown subdivisions
      this.subdivisionCache.set(regionUpper, true);
      return true;
    }

    this.countryCache.set(regionUpper, true);
    return true;
  }

  /**
   * Clear caches (useful for testing)
   */
  clearCache(): void {
    this.countryCache.clear();
    this.subdivisionCache.clear();
  }
}

/**
 * Global validator instance for performance
 */
export const regionValidator = new RegionValidator();
