"""
Limits Enforcement for Agent Passport SDK

Provides turnkey enforcement of passport limits with performance optimizations
for edge computing environments.
"""

from typing import Dict, List, Optional, Callable, Any, Tuple
from dataclasses import dataclass
import logging
from datetime import datetime, timedelta
import time

logger = logging.getLogger(__name__)


@dataclass
class LimitsEnforcementConfig:
    """Configuration for limits enforcement"""
    enabled: bool = True
    strict_mode: bool = True
    log_violations: bool = True
    custom_checkers: Optional[Dict[str, Callable]] = None

    def __post_init__(self):
        if self.custom_checkers is None:
            self.custom_checkers = {}


class LimitChecker:
    """Fast limit checker for edge performance"""
    
    def __init__(self, limits: Dict[str, Any]):
        self.limits = limits
        self.daily_counters: Dict[str, Dict[str, Any]] = {}
    
    def check_refund_limit(self, amount_cents: int) -> Tuple[bool, Optional[str]]:
        """Check if refund amount is within limits"""
        per_tx_limit = self.limits.get("refund_amount_max_per_tx")
        daily_limit = self.limits.get("refund_amount_daily_cap")
        
        if per_tx_limit is not None and amount_cents > per_tx_limit:
            return False, f"Refund amount {amount_cents} exceeds per-transaction limit {per_tx_limit}"
        
        if daily_limit is not None:
            daily_usage = self._get_daily_usage("refund")
            if daily_usage + amount_cents > daily_limit:
                return False, f"Refund would exceed daily limit {daily_limit} (current usage: {daily_usage})"
        
        return True, None
    
    def check_export_limit(self, row_count: int, has_pii: bool = False) -> Tuple[bool, Optional[str]]:
        """Check if export is within row limits"""
        max_rows = self.limits.get("max_export_rows")
        allow_pii = self.limits.get("allow_pii")
        
        if max_rows is not None and row_count > max_rows:
            return False, f"Export row count {row_count} exceeds limit {max_rows}"
        
        if has_pii and allow_pii is False:
            return False, "PII access not allowed (allow_pii is false)"
        
        return True, None
    
    def check_deploy_limit(self) -> Tuple[bool, Optional[str], Optional[int]]:
        """Check if deployment is within daily limits"""
        max_deploys = self.limits.get("max_deploys_per_day")
        
        if max_deploys is None:
            return True, None, None
        
        daily_usage = self._get_daily_usage("deploy")
        remaining = max_deploys - daily_usage
        
        if daily_usage >= max_deploys:
            return False, f"Daily deploy limit {max_deploys} exceeded (used: {daily_usage})", 0
        
        return True, None, remaining
    
    def check_action_rate_limit(self) -> Tuple[bool, Optional[str]]:
        """Check action rate limit"""
        max_actions = self.limits.get("max_actions_per_min")
        
        if max_actions is None:
            return True, None
        
        # This would integrate with your rate limiting system
        # For now, return allowed - implement with actual rate limiter
        return True, None
    
    def record_usage(self, usage_type: str, amount: int = 1) -> None:
        """Record usage for daily limits"""
        today_key = datetime.now().strftime("%Y-%m-%d")
        key = f"{usage_type}_{today_key}"
        
        if key not in self.daily_counters:
            tomorrow = datetime.now() + timedelta(days=1)
            tomorrow_midnight = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
            self.daily_counters[key] = {
                "count": 0,
                "reset_time": tomorrow_midnight.timestamp()
            }
        
        self.daily_counters[key]["count"] += amount
    
    def _get_daily_usage(self, usage_type: str) -> int:
        """Get current daily usage"""
        today_key = datetime.now().strftime("%Y-%m-%d")
        key = f"{usage_type}_{today_key}"
        
        if key not in self.daily_counters:
            return 0
        
        current_time = time.time()
        if current_time > self.daily_counters[key]["reset_time"]:
            return 0
        
        return self.daily_counters[key]["count"]


def create_limit_checker(limits: Dict[str, Any]) -> LimitChecker:
    """Create a limit checker instance"""
    return LimitChecker(limits)


def check_limits_for_operation(
    operation_type: str,
    limits: Dict[str, Any],
    operation_data: Optional[Dict[str, Any]] = None,
    config: Optional[LimitsEnforcementConfig] = None
) -> Dict[str, Any]:
    """
    Check limits for a specific operation.
    
    Args:
        operation_type: Type of operation (refund, export, deploy, etc.)
        limits: Agent limits dictionary
        operation_data: Additional data about the operation
        config: Limits enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    if config is None:
        config = LimitsEnforcementConfig()
    
    if not config.enabled:
        return {"allowed": True, "reason": None}
    
    limit_checker = create_limit_checker(limits)
    violations = []
    
    # Check action rate limit
    allowed, reason = limit_checker.check_action_rate_limit()
    if not allowed:
        violations.append({"type": "action_rate", "reason": reason or "Action rate limit exceeded"})
    
    # Check specific operation limits
    if operation_type == "deploy":
        allowed, reason, remaining = limit_checker.check_deploy_limit()
        if not allowed:
            violations.append({"type": "deploy_limit", "reason": reason or "Deploy limit exceeded"})
    
    elif operation_type == "export":
        export_rows = operation_data.get("row_count", 0) if operation_data else 0
        has_pii = operation_data.get("has_pii", False) if operation_data else False
        
        allowed, reason = limit_checker.check_export_limit(export_rows, has_pii)
        if not allowed:
            violations.append({"type": "export_limit", "reason": reason or "Export limit exceeded"})
    
    elif operation_type == "refund":
        refund_amount = operation_data.get("amount_cents", 0) if operation_data else 0
        allowed, reason = limit_checker.check_refund_limit(refund_amount)
        if not allowed:
            violations.append({"type": "refund_limit", "reason": reason or "Refund limit exceeded"})
    
    # Run custom checkers
    for checker_name, checker in (config.custom_checkers or {}).items():
        result = checker(limits, operation_data or {})
        if not result[0]:  # result is (allowed, reason)
            violations.append({"type": f"custom_{checker_name}", "reason": result[1] or "Custom limit exceeded"})
    
    if violations:
        return {
            "allowed": False,
            "reason": "limits_exceeded",
            "violations": violations,
            "limits": limits
        }
    
    return {"allowed": True, "reason": None}


# Helper functions for common limit checks
def has_limit(agent_limits: Dict[str, Any], limit_key: str) -> bool:
    """Check if agent has specific limit"""
    return agent_limits and limit_key in agent_limits


def get_limit_value(agent_limits: Dict[str, Any], limit_key: str):
    """Get limit value"""
    return agent_limits.get(limit_key) if agent_limits else None


def check_refund_limit(agent_limits: Dict[str, Any], amount_cents: int) -> Tuple[bool, Optional[str]]:
    """Check refund limit for specific amount"""
    limit_checker = create_limit_checker(agent_limits or {})
    return limit_checker.check_refund_limit(amount_cents)


def check_export_limit(agent_limits: Dict[str, Any], row_count: int, has_pii: bool = False) -> Tuple[bool, Optional[str]]:
    """Check export limit for specific row count"""
    limit_checker = create_limit_checker(agent_limits or {})
    return limit_checker.check_export_limit(row_count, has_pii)


def check_deploy_limit(agent_limits: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[int]]:
    """Check deploy limit"""
    limit_checker = create_limit_checker(agent_limits or {})
    return limit_checker.check_deploy_limit()


def check_pii_access(agent_limits: Dict[str, Any], has_pii: bool = False) -> Tuple[bool, Optional[str]]:
    """Check PII access permission"""
    allow_pii = get_limit_value(agent_limits, "allow_pii")
    
    if has_pii and allow_pii is False:
        return False, "PII access not allowed for this agent"
    
    return True, None
