"""
Production-grade thin Python SDK Client - API calls only
No policy logic, no Cloudflare imports, no counters
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import aiohttp
from aiohttp import ClientTimeout, ClientError

from .decision_types import (
    PolicyVerificationRequest,
    PolicyVerificationResponse,
    Jwks,
    JwksKey,
)
from .errors import AportError


class APortClientOptions:
    """Configuration options for APortClient."""
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_ms: int = 800,
    ):
        self.base_url = base_url or "https://api.aport.io"
        self.api_key = api_key
        self.timeout_ms = timeout_ms


class APortClient:
    """Production-grade thin SDK Client for APort API."""
    
    def __init__(self, options: APortClientOptions):
        self.opts = options
        self.jwks_cache: Optional[Jwks] = None
        self.jwks_cache_expiry: Optional[float] = None
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry."""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def _ensure_session(self):
        """Ensure HTTP session is created."""
        if self._session is None or self._session.closed:
            timeout = ClientTimeout(total=self.opts.timeout_ms / 1000)
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "aport-sdk-python/0.1.0",
                },
            )

    async def close(self):
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    def _get_headers(self, idempotency_key: Optional[str] = None) -> Dict[str, str]:
        """Get request headers."""
        headers = {}
        
        if self.opts.api_key:
            headers["Authorization"] = f"Bearer {self.opts.api_key}"
        
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
            
        return headers

    def _normalize_url(self, path: str) -> str:
        """Normalize URL by removing trailing slashes and ensuring proper path."""
        base_url = self.opts.base_url.rstrip("/")
        clean_path = path if path.startswith("/") else f"/{path}"
        return f"{base_url}{clean_path}"

    async def _make_request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Make HTTP request with proper error handling."""
        await self._ensure_session()
        
        url = self._normalize_url(path)
        headers = self._get_headers(idempotency_key)
        
        try:
            async with self._session.request(
                method=method,
                url=url,
                headers=headers,
                json=data,
            ) as response:
                server_timing = response.headers.get("server-timing")
                text = await response.text()
                
                try:
                    json_data = json.loads(text) if text else {}
                except json.JSONDecodeError:
                    json_data = {}
                
                if not response.ok:
                    raise AportError(
                        status=response.status,
                        reasons=json_data.get("reasons"),
                        decision_id=json_data.get("decision_id"),
                        server_timing=server_timing,
                        raw_response=text,
                    )
                
                if server_timing:
                    json_data["_meta"] = {"serverTiming": server_timing}
                
                return json_data
                
        except ClientError as e:
            raise AportError(
                status=0,
                reasons=[{"code": "NETWORK_ERROR", "message": str(e)}],
            )
        except asyncio.TimeoutError:
            raise AportError(
                status=408,
                reasons=[{"code": "TIMEOUT", "message": "Request timeout"}],
            )

    async def verify_policy(
        self,
        agent_id: str,
        policy_id: str,
        context: Dict[str, Any] = None,
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify a policy against an agent."""
        if context is None:
            context = {}
            
        request = PolicyVerificationRequest(
            agent_id=agent_id,
            context=context,
            idempotency_key=idempotency_key,
        )
        
        response_data = await self._make_request(
            "POST",
            f"/api/verify/policy/{policy_id}",
            data=request.__dict__,
            idempotency_key=idempotency_key,
        )
        
        return PolicyVerificationResponse(**response_data)

    async def get_decision_token(
        self,
        agent_id: str,
        policy_id: str,
        context: Dict[str, Any] = None,
    ) -> str:
        """Get a decision token for near-zero latency validation."""
        if context is None:
            context = {}
            
        request = PolicyVerificationRequest(
            agent_id=agent_id,
            context=context,
        )
        
        response_data = await self._make_request(
            "POST",
            f"/api/verify/token/{policy_id}",
            data=request.__dict__,
        )
        
        return response_data["token"]

    async def validate_decision_token_local(
        self, token: str
    ) -> PolicyVerificationResponse:
        """Validate a decision token locally using JWKS."""
        try:
            jwks = await self.get_jwks()
            # For now, we'll still use the server endpoint
            # TODO: Implement local JWT validation with JWKS
            return await self.validate_decision_token(token)
        except Exception:
            raise AportError(
                401,
                [{"code": "INVALID_TOKEN", "message": "Token validation failed"}],
            )

    async def validate_decision_token(
        self, token: str
    ) -> PolicyVerificationResponse:
        """Validate a decision token via server (for debugging)."""
        response_data = await self._make_request(
            "POST",
            "/api/verify/token/validate",
            data={"token": token},
        )
        
        return PolicyVerificationResponse(**response_data["decision"])

    async def get_passport_view(self, agent_id: str) -> Dict[str, Any]:
        """Get passport verification view (for debugging/about pages)."""
        return await self._make_request("GET", f"/api/passports/{agent_id}/verify_view")

    async def get_jwks(self) -> Jwks:
        """Get JWKS for local token validation."""
        # Check cache first
        if (
            self.jwks_cache
            and self.jwks_cache_expiry
            and time.time() < self.jwks_cache_expiry
        ):
            return self.jwks_cache

        try:
            response_data = await self._make_request("GET", "/jwks.json")
            self.jwks_cache = Jwks(**response_data)
            self.jwks_cache_expiry = time.time() + (5 * 60)  # Cache for 5 minutes
            return self.jwks_cache
        except Exception:
            raise AportError(
                500,
                [{"code": "JWKS_FETCH_FAILED", "message": "Failed to fetch JWKS"}],
            )


class PolicyVerifier:
    """Convenience class for policy-specific verification methods."""
    
    def __init__(self, client: APortClient):
        self.client = client

    async def verify_refund(
        self,
        agent_id: str,
        context: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify the finance.payment.refund.v1 policy."""
        return await self.client.verify_policy(
            agent_id, "finance.payment.refund.v1", context, idempotency_key
        )

    async def verify_release(
        self,
        agent_id: str,
        context: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify the code.release.publish.v1 policy."""
        return await self.client.verify_policy(
            agent_id, "code.release.publish.v1", context, idempotency_key
        )

    async def verify_data_export(
        self,
        agent_id: str,
        context: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify the data.export.create.v1 policy."""
        return await self.client.verify_policy(
            agent_id, "data.export.create.v1", context, idempotency_key
        )

    async def verify_messaging(
        self,
        agent_id: str,
        context: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify the messaging.message.send.v1 policy."""
        return await self.client.verify_policy(
            agent_id, "messaging.message.send.v1", context, idempotency_key
        )

    async def verify_repository(
        self,
        agent_id: str,
        context: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> PolicyVerificationResponse:
        """Verify the code.repository.merge.v1 policy."""
        return await self.client.verify_policy(
            agent_id, "code.repository.merge.v1", context, idempotency_key
        )