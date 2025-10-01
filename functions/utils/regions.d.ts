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
export declare const ISO_3166_COUNTRIES: Set<string>;
/**
 * Common subdivision codes for major countries (CC-SS format)
 * Only including the most commonly used ones to keep the list manageable
 */
export declare const ISO_3166_SUBDIVISIONS: Set<string>;
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
export declare function validateRegion(region: string): RegionValidationResult;
/**
 * Validate an array of region codes
 */
export declare function validateRegions(regions: string[]): RegionValidationResult;
/**
 * Normalize region codes to uppercase and remove duplicates
 */
export declare function normalizeRegions(regions: string[]): string[];
/**
 * Check if a region is a valid ISO-3166 country code (CC format)
 */
export declare function isValidCountryCode(code: string): boolean;
/**
 * Check if a region is a valid ISO-3166 subdivision code (CC-SS format)
 */
export declare function isValidSubdivisionCode(code: string): boolean;
/**
 * Get all valid country codes
 */
export declare function getValidCountryCodes(): string[];
/**
 * Get all valid subdivision codes for a country
 */
export declare function getValidSubdivisionCodes(countryCode: string): string[];
/**
 * Performance-optimized region validator for middleware
 */
export declare class RegionValidator {
    private countryCache;
    private subdivisionCache;
    /**
     * Fast validation with caching
     */
    isValid(region: string): boolean;
    /**
     * Clear caches (useful for testing)
     */
    clearCache(): void;
}
/**
 * Global validator instance for performance
 */
export declare const regionValidator: RegionValidator;
//# sourceMappingURL=regions.d.ts.map