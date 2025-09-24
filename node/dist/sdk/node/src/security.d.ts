/**
 * Security utilities for refunds and money handling
 *
 * Provides input sanitization, fraud detection, and security validation
 * for financial operations.
 */
export interface SecurityValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    suspicious: boolean;
    suspiciousReasons: string[];
}
export declare function sanitizeInput(input: any): any;
export declare function detectSuspiciousActivity(context: any): {
    suspicious: boolean;
    reasons: string[];
};
export declare function validateFinancialInput(context: any): SecurityValidationResult;
export declare function generateSecureId(prefix?: string): string;
export declare function validateAmountPrecision(amount: number, currency: string): boolean;
export declare function getCurrencyDecimals(currency: string): number;
//# sourceMappingURL=security.d.ts.map