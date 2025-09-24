"""
Refunds v1 Policy Helper Functions

Provides easy-to-use functions for refunds.v1 policy enforcement
with proper Python types and error handling.
"""

from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
import asyncio
import logging

from .policy_enforcement import check_policy_compliance, PolicyEnforcementConfig
from .security import validate_financial_input, generate_secure_id

logger = logging.getLogger(__name__)

@dataclass
class RefundContext:
    """Refund context data for policy enforcement"""
    order_id: str
    customer_id: str
    amount_minor: int
    currency: str
    region: str
    reason_code: str
    idempotency_key: str
    order_currency: Optional[str] = None
    order_total_minor: Optional[int] = None
    already_refunded_minor: Optional[int] = None
    note: Optional[str] = None
    merchant_case_id: Optional[str] = None

@dataclass
class RefundResult:
    """Result of refund processing"""
    allowed: bool
    refund_id: Optional[str] = None
    decision_id: Optional[str] = None
    remaining_daily_cap: Optional[Dict[str, int]] = None
    expires_in: Optional[int] = None
    error: Optional[Dict[str, Any]] = None

@dataclass
class RefundPolicyConfig:
    """Configuration for refund policy enforcement"""
    agent_id: str
    fail_closed: bool = True
    log_violations: bool = True
    api_base_url: str = "https://api.aport.io"
    cache_ttl: int = 60
    enabled: bool = True
    strict_mode: bool = True

def validate_refund_context(context: RefundContext) -> Dict[str, Any]:
    """
    Validate refund context for required fields with security checks
    
    Args:
        context: Refund context to validate
        
    Returns:
        Dict with validation results including security info
    """
    # Convert dataclass to dict for security validation
    context_dict = {
        'order_id': context.order_id,
        'customer_id': context.customer_id,
        'amount_minor': context.amount_minor,
        'currency': context.currency,
        'region': context.region,
        'reason_code': context.reason_code,
        'idempotency_key': context.idempotency_key,
        'order_currency': context.order_currency,
        'order_total_minor': context.order_total_minor,
        'already_refunded_minor': context.already_refunded_minor,
        'note': context.note,
        'merchant_case_id': context.merchant_case_id
    }
    
    # Use enhanced security validation
    security_result = validate_financial_input(context_dict)
    
    # Check required fields
    required_fields = [
        'order_id', 'customer_id', 'amount_minor', 
        'currency', 'region', 'reason_code', 'idempotency_key'
    ]
    
    for field in required_fields:
        if not getattr(context, field, None):
            security_result.errors.append(f"{field} is required")
    
    return {
        'valid': security_result.valid and len(security_result.errors) == 0,
        'errors': security_result.errors,
        'warnings': security_result.warnings,
        'suspicious': security_result.suspicious,
        'suspicious_reasons': security_result.suspicious_reasons
    }

async def process_refund(
    context: RefundContext,
    config: RefundPolicyConfig
) -> RefundResult:
    """
    Process a refund request with refunds.v1 policy enforcement
    
    Args:
        context: Refund context data
        config: Policy configuration
        
    Returns:
        Refund result with decision details
    """
    # Validate context
    validation = validate_refund_context(context)
    if not validation['valid']:
        return RefundResult(
            allowed=False,
            error={
                'code': 'invalid_context',
                'message': 'Invalid refund context',
                'reasons': [{'code': 'validation_error', 'message': error} for error in validation['errors']]
            }
        )
    
    try:
        # Convert context to dict for policy check
        context_dict = {
            'order_id': context.order_id,
            'customer_id': context.customer_id,
            'amount_minor': context.amount_minor,
            'currency': context.currency,
            'region': context.region,
            'reason_code': context.reason_code,
            'idempotency_key': context.idempotency_key,
            'order_currency': context.order_currency,
            'order_total_minor': context.order_total_minor,
            'already_refunded_minor': context.already_refunded_minor,
            'note': context.note,
            'merchant_case_id': context.merchant_case_id
        }
        
        # Check policy compliance
        result = await check_policy_compliance(
            agent_id=config.agent_id,
            policy_id='refunds.v1',
            context=context_dict,
            config=config
        )
        
        if not result.get('allowed', False):
            return RefundResult(
                allowed=False,
                error={
                    'code': result.get('reason', 'refund_policy_violation'),
                    'message': result.get('error', 'Refund request violates policy'),
                    'reasons': [{'code': 'policy_violation', 'message': v} for v in result.get('violations', [])]
                }
            )
        
        # Generate cryptographically secure refund ID
        refund_id = generate_secure_id('ref')
        
        return RefundResult(
            allowed=True,
            refund_id=refund_id,
            decision_id=result.get('policy_result', {}).get('evaluation', {}).get('decision_id'),
            remaining_daily_cap=result.get('policy_result', {}).get('evaluation', {}).get('remaining_daily_cap'),
            expires_in=result.get('policy_result', {}).get('evaluation', {}).get('expires_in')
        )
        
    except Exception as error:
        logger.error(f"Refund processing error: {error}")
        
        return RefundResult(
            allowed=False,
            error={
                'code': 'refund_processing_error',
                'message': 'Failed to process refund request'
            }
        )

async def is_refund_allowed(
    context: RefundContext,
    config: RefundPolicyConfig
) -> bool:
    """
    Check if a refund is allowed without processing
    
    Args:
        context: Refund context data
        config: Policy configuration
        
    Returns:
        Boolean indicating if refund is allowed
    """
    result = await process_refund(context, config)
    return result.allowed

def create_refund_context(
    request_data: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None
) -> RefundContext:
    """
    Create a refund context from request data
    
    Args:
        request_data: Raw request data (from FastAPI request, etc.)
        headers: Request headers (optional)
        
    Returns:
        Refund context object
    """
    if headers is None:
        headers = {}
    
    return RefundContext(
        order_id=request_data.get('order_id', ''),
        customer_id=request_data.get('customer_id', ''),
        amount_minor=request_data.get('amount_minor', 0),
        currency=request_data.get('currency', ''),
        region=request_data.get('region') or headers.get('x-region', ''),
        reason_code=request_data.get('reason_code', ''),
        idempotency_key=request_data.get('idempotency_key', ''),
        order_currency=request_data.get('order_currency'),
        order_total_minor=request_data.get('order_total_minor'),
        already_refunded_minor=request_data.get('already_refunded_minor'),
        note=request_data.get('note'),
        merchant_case_id=request_data.get('merchant_case_id')
    )

# Refunds v1 policy constants
REFUNDS_V1 = {
    'POLICY_ID': 'refunds.v1',
    'REQUIRED_FIELDS': [
        'order_id', 'customer_id', 'amount_minor', 
        'currency', 'region', 'reason_code', 'idempotency_key'
    ],
    'OPTIONAL_FIELDS': [
        'order_currency', 'order_total_minor', 
        'already_refunded_minor', 'note', 'merchant_case_id'
    ],
    # No hardcoded currencies - supports any valid ISO 4217 currency code
    # No hardcoded regions - supports any valid country/region code
    'REASON_CODES': [
        'customer_request', 'defective', 'not_as_described', 
        'duplicate', 'fraud', 'cancelled', 'returned'
    ]
}
