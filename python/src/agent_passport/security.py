"""
Security utilities for refunds and money handling

Provides input sanitization, fraud detection, and security validation
for financial operations.
"""

import re
import secrets
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass

@dataclass
class SecurityValidationResult:
    valid: bool
    errors: List[str]
    warnings: List[str]
    suspicious: bool
    suspicious_reasons: List[str]

def sanitize_input(input_data: Any) -> Any:
    """
    Sanitize input data to prevent injection attacks
    
    Args:
        input_data: Input data to sanitize
        
    Returns:
        Sanitized input data
        
    Raises:
        ValueError: If input data is invalid
    """
    if isinstance(input_data, str):
        # Remove potentially dangerous characters
        return re.sub(r'[<>"\'&]', '', input_data).strip()
    elif isinstance(input_data, (int, float)):
        # Ensure number is finite and within safe bounds
        if not (isinstance(input_data, (int, float)) and 
                -2**63 <= input_data <= 2**63 - 1):
            raise ValueError('Invalid number input')
        return input_data
    elif isinstance(input_data, dict):
        sanitized = {}
        for key, value in input_data.items():
            # Sanitize key names
            clean_key = re.sub(r'[^a-zA-Z0-9_]', '', str(key))
            if clean_key and len(clean_key) <= 50:
                sanitized[clean_key] = sanitize_input(value)
        return sanitized
    elif isinstance(input_data, list):
        return [sanitize_input(item) for item in input_data]
    else:
        return input_data

def detect_suspicious_activity(context: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Detect suspicious patterns in refund requests
    
    Args:
        context: Refund context data
        
    Returns:
        Tuple of (is_suspicious, reasons)
    """
    reasons = []
    
    # Check for suspicious patterns
    amount_minor = context.get('amount_minor', 0)
    if amount_minor > 1000000:  # $10,000
        reasons.append('High-value refund request')
    
    # Check for round numbers (potential test attacks)
    if amount_minor % 10000 == 0 and amount_minor > 100000:
        reasons.append('Suspicious round number amount')
    
    # Check for suspicious order IDs
    order_id = context.get('order_id', '')
    if order_id and re.match(r'^(test|demo|fake)', order_id, re.IGNORECASE):
        reasons.append('Suspicious order ID pattern')
    
    # Check for suspicious customer IDs
    customer_id = context.get('customer_id', '')
    if customer_id and re.match(r'^(test|demo|fake)', customer_id, re.IGNORECASE):
        reasons.append('Suspicious customer ID pattern')
    
    # Check for duplicate idempotency keys (would need external tracking)
    # This is a placeholder - in production, you'd check against a database
    
    return len(reasons) > 0, reasons

def validate_financial_input(context: Dict[str, Any]) -> SecurityValidationResult:
    """
    Validate financial input with security checks
    
    Args:
        context: Refund context data
        
    Returns:
        Security validation result
    """
    errors = []
    warnings = []
    
    # Sanitize all inputs first
    try:
        sanitized_context = sanitize_input(context)
    except ValueError as e:
        errors.append('Invalid input data detected')
        return SecurityValidationResult(
            valid=False,
            errors=errors,
            warnings=[],
            suspicious=True,
            suspicious_reasons=['Malicious input detected']
        )
    
    # Validate amount
    amount_minor = sanitized_context.get('amount_minor')
    if amount_minor is not None:
        if amount_minor <= 0:
            errors.append('amount_minor must be positive')
        if amount_minor > 2**63 - 1:
            errors.append('amount_minor exceeds maximum safe integer')
        if not isinstance(amount_minor, int):
            errors.append('amount_minor must be an integer (minor units)')
        if amount_minor > 10000000:  # $100,000
            warnings.append('Very high refund amount - manual review recommended')

    # Validate currency format - must be 3 letters (ISO 4217 standard)
    currency = sanitized_context.get('currency', '')
    if currency:
        if not re.match(r'^[A-Z]{3}$', currency):
            errors.append('currency must be a 3-letter ISO 4217 code')
        # Additional validation: check if it's a reasonable currency code
        if len(currency) != 3 or not currency.isalpha():
            errors.append('currency must be exactly 3 uppercase letters')

    # Validate idempotency key format
    idempotency_key = sanitized_context.get('idempotency_key', '')
    if idempotency_key and not re.match(r'^[a-zA-Z0-9_-]{10,64}$', idempotency_key):
        errors.append('idempotency_key must be 10-64 characters, alphanumeric with hyphens/underscores')

    # Validate order ID format
    order_id = sanitized_context.get('order_id', '')
    if order_id:
        if len(order_id) > 100:
            errors.append('order_id must be 100 characters or less')
        if not re.match(r'^[a-zA-Z0-9_-]+$', order_id):
            errors.append('order_id must contain only alphanumeric characters, hyphens, and underscores')

    # Validate customer ID format
    customer_id = sanitized_context.get('customer_id', '')
    if customer_id:
        if len(customer_id) > 100:
            errors.append('customer_id must be 100 characters or less')
        if not re.match(r'^[a-zA-Z0-9_-]+$', customer_id):
            errors.append('customer_id must contain only alphanumeric characters, hyphens, and underscores')

    # Validate region format - flexible for any country/region code
    region = sanitized_context.get('region', '')
    if region:
        # Allow 2-4 character region codes (ISO 3166-1 alpha-2, alpha-3, or custom codes)
        if not re.match(r'^[A-Z]{2,4}$', region):
            errors.append('region must be a 2-4 letter country/region code')
        # Additional validation: check for reasonable region codes
        if len(region) < 2 or len(region) > 4:
            errors.append('region must be 2-4 characters long')

    # Validate reason code
    reason_code = sanitized_context.get('reason_code', '')
    if reason_code and len(reason_code) > 50:
        errors.append('reason_code must be 50 characters or less')

    # Check for suspicious activity
    is_suspicious, suspicious_reasons = detect_suspicious_activity(sanitized_context)
    
    return SecurityValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        suspicious=is_suspicious,
        suspicious_reasons=suspicious_reasons
    )

def generate_secure_id(prefix: str = 'ref') -> str:
    """
    Generate a cryptographically secure ID
    
    Args:
        prefix: ID prefix
        
    Returns:
        Secure ID string
    """
    import time
    timestamp = int(time.time() * 1000)
    random_bytes = secrets.token_hex(16)
    return f"{prefix}_{timestamp}_{random_bytes}"

def validate_amount_precision(amount: int, currency: str) -> bool:
    """
    Validate amount precision for currency
    
    Args:
        amount: Amount in minor units
        currency: Currency code
        
    Returns:
        True if precision is correct
    """
    # For any currency, amount must be an integer (minor units)
    # The actual decimal places are determined by the currency's standard
    # but we work in minor units, so amount should always be an integer
    return isinstance(amount, int) and amount > 0

def get_currency_decimals(currency: str) -> int:
    """
    Get decimal places for currency (for display purposes only)
    
    Args:
        currency: Currency code
        
    Returns:
        Number of decimal places
    """
    # Common currencies with their decimal places
    # This is for display purposes only - we always work in minor units
    currency_decimals = {
        'USD': 2, 'EUR': 2, 'GBP': 2, 'CAD': 2, 'AUD': 2, 'CHF': 2, 'CNY': 2, 
        'INR': 2, 'BRL': 2, 'MXN': 2, 'SEK': 2, 'NOK': 2, 'DKK': 2, 'PLN': 2,
        'CZK': 2, 'HUF': 2, 'RON': 2, 'BGN': 2, 'HRK': 2, 'RSD': 2, 'UAH': 2,
        'RUB': 2, 'TRY': 2, 'ILS': 2, 'AED': 2, 'SAR': 2, 'QAR': 2, 'KWD': 3,
        'BHD': 3, 'OMR': 3, 'JOD': 3, 'LBP': 2, 'EGP': 2, 'MAD': 2, 'TND': 3,
        'DZD': 2, 'ZAR': 2, 'NGN': 2, 'KES': 2, 'GHS': 2, 'ETB': 2,
        'JPY': 0, 'KRW': 0, 'VND': 0, 'IDR': 0, 'THB': 2, 'MYR': 2, 'SGD': 2,
        'PHP': 2, 'TWD': 0, 'HKD': 2, 'NZD': 2, 'ISK': 0, 'CLP': 0, 'COP': 0,
        'ARS': 2, 'UYU': 2, 'PEN': 2, 'BOB': 2, 'PYG': 0, 'VES': 2, 'CRC': 2,
        'GTQ': 2, 'HNL': 2, 'NIO': 2, 'PAB': 2, 'DOP': 2, 'JMD': 2, 'TTD': 2,
        'BBD': 2, 'BZD': 2, 'XCD': 2, 'AWG': 2, 'ANG': 2, 'SRD': 2, 'GYD': 2,
        'BMD': 2, 'KYD': 2, 'FKP': 2, 'SHP': 2, 'SBD': 2, 'VUV': 0, 'WST': 2,
        'TOP': 2, 'FJD': 2, 'PGK': 2
    }
    
    return currency_decimals.get(currency.upper(), 2)  # Default to 2 decimal places
