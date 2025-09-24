"""Session management for Agent Passport SDK."""

import os
from typing import Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .client import AgentPassportClient
from .exceptions import AgentPassportError


class AgentSession:
    """A requests.Session with automatic Agent Passport header injection."""
    
    def __init__(self, agent_id: str, base_url: Optional[str] = None):
        """
        Initialize the agent session.
        
        Args:
            agent_id: The agent passport ID
            base_url: Base URL of the passport registry
        """
        self.agent_id = agent_id
        self.base_url = base_url or os.getenv('AGENT_PASSPORT_BASE_URL', 'https://passport-registry.com')
        
        # Create session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Set default headers
        self.session.headers.update({
            'X-Agent-Passport-Id': agent_id,
            'User-Agent': 'agent-passport-sdk-python/0.1.0'
        })
    
    def __enter__(self):
        """Context manager entry."""
        return self.session
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.session.close()
    
    def get(self, url, **kwargs):
        """Make a GET request with agent passport header."""
        return self.session.get(url, **kwargs)
    
    def post(self, url, **kwargs):
        """Make a POST request with agent passport header."""
        return self.session.post(url, **kwargs)
    
    def put(self, url, **kwargs):
        """Make a PUT request with agent passport header."""
        return self.session.put(url, **kwargs)
    
    def patch(self, url, **kwargs):
        """Make a PATCH request with agent passport header."""
        return self.session.patch(url, **kwargs)
    
    def delete(self, url, **kwargs):
        """Make a DELETE request with agent passport header."""
        return self.session.delete(url, **kwargs)
    
    def request(self, method, url, **kwargs):
        """Make a request with agent passport header."""
        return self.session.request(method, url, **kwargs)


def agent_session(agent_id: Optional[str] = None) -> AgentSession:
    """
    Create an agent session with automatic header injection.
    
    Args:
        agent_id: The agent passport ID (defaults to AGENT_PASSPORT_ID env var)
        
    Returns:
        AgentSession instance
        
    Raises:
        AgentPassportError: If agent_id is not provided and not in environment
    """
    if agent_id is None:
        agent_id = os.getenv('AGENT_PASSPORT_ID')
        if agent_id is None:
            raise AgentPassportError(
                "Agent passport ID not provided and AGENT_PASSPORT_ID environment variable not set",
                "missing_agent_id",
                400
            )
    
    return AgentSession(agent_id)
