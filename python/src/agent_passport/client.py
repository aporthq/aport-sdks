"""Agent Passport client for verification and management."""

import os
import time
from typing import Optional, Dict, Any, List
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .types import AgentPassport, VerificationOptions
from .exceptions import AgentPassportError


class AgentPassportClient:
    """Client for interacting with the Agent Passport Registry."""
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: int = 5,
        cache: bool = True
    ):
        """
        Initialize the Agent Passport client.
        
        Args:
            base_url: Base URL of the passport registry
            timeout: Request timeout in seconds
            cache: Enable caching
        """
        self.base_url = base_url or os.getenv('AGENT_PASSPORT_BASE_URL', 'https://passport-registry.com')
        self.timeout = timeout
        self.cache = cache
        self._cache: Dict[str, tuple[AgentPassport, float]] = {}
        
        # Setup session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
    
    def verify_agent_passport(
        self, 
        agent_id: str, 
        options: Optional[VerificationOptions] = None
    ) -> AgentPassport:
        """
        Verify an agent passport ID against the registry.
        
        Args:
            agent_id: The agent passport ID to verify
            options: Verification options
            
        Returns:
            Agent passport data
            
        Raises:
            AgentPassportError: If verification fails
        """
        if options is None:
            options = VerificationOptions()
        
        # Check cache first
        if self.cache and options.cache:
            cached_data, expiry = self._cache.get(agent_id, (None, 0))
            if cached_data and time.time() < expiry:
                return cached_data
        
        # Prepare request
        url = f"{self.base_url}/api/verify"
        params = {"agent_id": agent_id}
        headers = {}
        
        if options.cache:
            headers["Cache-Control"] = "public, max-age=60"
        
        try:
            response = self.session.get(
                url,
                params=params,
                headers=headers,
                timeout=options.timeout or self.timeout
            )
            
            if response.status_code == 304:
                # Cache hit - return cached data if available
                cached_data, _ = self._cache.get(agent_id, (None, 0))
                if cached_data:
                    return cached_data
                raise AgentPassportError(
                    "Agent passport verification failed - cache hit but no cached data available",
                    "cache_error",
                    304,
                    agent_id
                )
            
            if not response.ok:
                try:
                    error_data = response.json()
                    error_code = error_data.get("error", "verification_failed")
                    error_message = error_data.get("message", f"HTTP {response.status_code}: {response.reason}")
                except ValueError:
                    error_code = "verification_failed"
                    error_message = f"HTTP {response.status_code}: {response.reason}"
                
                raise AgentPassportError(
                    error_message,
                    error_code,
                    response.status_code,
                    agent_id
                )
            
            data = response.json()
            
            # Validate agent status
            if data.get("status") != "active":
                raise AgentPassportError(
                    f"Agent is {data.get('status')}",
                    f"agent_{data.get('status')}",
                    403,
                    agent_id
                )
            
            # Create agent passport object
            agent = AgentPassport(
                agent_id=data["agent_id"],
                slug=data.get("slug", ""),
                name=data.get("name", ""),
                owner=data.get("owner", ""),
                controller_type=data.get("controller_type", "org"),
                claimed=data.get("claimed", False),
                role=data.get("role", ""),
                description=data.get("description", ""),
                status=data["status"],
                verification_status=data.get("verification_status", "unverified"),
                permissions=data.get("permissions", []),
                limits=data.get("limits", {}),
                regions=data.get("regions", []),
                contact=data.get("contact", ""),
                source=data.get("source", "admin"),
                created_at=data.get("created_at", ""),
                updated_at=data.get("updated_at", ""),
                version=data.get("version", "1.0.0"),
                links=data.get("links"),
                framework=data.get("framework"),
                categories=data.get("categories"),
                logo_url=data.get("logo_url"),
                verification_method=data.get("verification_method"),
                model_info=data.get("model_info")
            )
            
            # Cache the result
            if self.cache and options.cache:
                self._cache[agent_id] = (agent, time.time() + 60)  # Cache for 60 seconds
            
            return agent
            
        except requests.exceptions.Timeout:
            raise AgentPassportError(
                "Verification request timed out",
                "timeout",
                408,
                agent_id
            )
        except requests.exceptions.RequestException as e:
            raise AgentPassportError(
                f"Network error: {str(e)}",
                "network_error",
                0,
                agent_id
            )
    
    def has_permission(self, agent: AgentPassport, permission: str) -> bool:
        """
        Check if an agent has a specific permission.
        
        Args:
            agent: The agent passport data
            permission: The permission to check
            
        Returns:
            True if the agent has the permission
        """
        return permission in agent.permissions
    
    def is_allowed_in_region(self, agent: AgentPassport, region: str) -> bool:
        """
        Check if an agent is allowed in a specific region.
        
        Args:
            agent: The agent passport data
            region: The region to check
            
        Returns:
            True if the agent is allowed in the region
        """
        return region in agent.regions
    
    def get_agent_passport_id(self) -> Optional[str]:
        """
        Get the current agent passport ID from environment variables.
        
        Returns:
            The agent passport ID or None if not set
        """
        return os.getenv('AGENT_PASSPORT_ID')
    
    def clear_cache(self) -> None:
        """Clear the verification cache."""
        self._cache.clear()
