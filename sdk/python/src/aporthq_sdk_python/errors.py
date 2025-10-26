"""
Custom error types for the APort Python SDK
"""

from typing import List, Optional, Dict, Any


class AportError(Exception):
    """Custom error for APort API failures."""
    
    def __init__(
        self,
        status: int,
        reasons: Optional[List[Dict[str, str]]] = None,
        decision_id: Optional[str] = None,
        server_timing: Optional[str] = None,
        raw_response: Optional[str] = None,
    ):
        message = (
            f"API request failed: {status} {', '.join([r['message'] for r in reasons])}"
            if reasons
            else f"API request failed: {status}"
        )
        
        super().__init__(message)
        self.name = "AportError"
        self.status = status
        self.reasons = reasons
        self.decision_id = decision_id
        self.server_timing = server_timing
        self.raw_response = raw_response
