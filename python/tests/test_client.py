"""Tests for the Agent Passport client."""

import pytest
import requests
from unittest.mock import Mock, patch
from src.agent_passport.client import AgentPassportClient
from src.agent_passport.exceptions import AgentPassportError
from src.agent_passport.types import AgentPassport, VerificationOptions


class TestAgentPassportClient:
    """Test cases for AgentPassportClient."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.client = AgentPassportClient(base_url="https://test-registry.com")
        self.mock_agent_data = {
            "agent_id": "ap_128094d34567890abcdef",
            "slug": "test-agent",
            "name": "Test Agent",
            "owner": "test-owner",
            "controller_type": "org",
            "claimed": True,
            "role": "Test Role",
            "description": "Test Description",
            "status": "active",
            "verification_status": "verified",
            "permissions": ["read:data", "write:logs"],
            "limits": {"requests_per_hour": 1000},
            "regions": ["us-east-1"],
            "contact": "test@example.com",
            "links": {},
            "source": "admin",
            "created_at": "2024-01-15T10:30:00Z",
            "updated_at": "2024-01-15T10:30:00Z",
            "version": "1.0.0"
        }
    
    @patch('src.agent_passport.client.requests.Session.get')
    def test_verify_agent_passport_success(self, mock_get):
        """Test successful agent passport verification."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = self.mock_agent_data
        mock_get.return_value = mock_response
        
        agent = self.client.verify_agent_passport("ap_128094d34567890abcdef")
        
        assert agent.agent_id == "ap_128094d34567890abcdef"
        assert agent.status == "active"
        assert agent.permissions == ["read:data", "write:logs"]
        assert agent.regions == ["us-east-1"]
        
        mock_get.assert_called_once_with(
            "https://test-registry.com/api/verify",
            params={"agent_id": "ap_128094d34567890abcdef"},
            headers={"Cache-Control": "public, max-age=60"},
            timeout=5
        )
    
    @patch('src.agent_passport.client.requests.Session.get')
    def test_verify_agent_passport_suspended(self, mock_get):
        """Test verification of suspended agent."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            **self.mock_agent_data,
            "status": "suspended"
        }
        mock_get.return_value = mock_response
        
        with pytest.raises(AgentPassportError) as exc_info:
            self.client.verify_agent_passport("ap_128094d34567890abcdef")
        
        assert exc_info.value.code == "agent_suspended"
        assert exc_info.value.status_code == 403
    
    @patch('src.agent_passport.client.requests.Session.get')
    def test_verify_agent_passport_not_found(self, mock_get):
        """Test verification of non-existent agent."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.ok = False
        mock_response.json.return_value = {
            "error": "agent_not_found",
            "message": "Agent passport not found"
        }
        mock_get.return_value = mock_response
        
        with pytest.raises(AgentPassportError) as exc_info:
            self.client.verify_agent_passport("ap_invalid_id")
        
        assert exc_info.value.code == "agent_not_found"
        assert exc_info.value.status_code == 404
    
    @patch('src.agent_passport.client.requests.Session.get')
    def test_verify_agent_passport_timeout(self, mock_get):
        """Test verification timeout."""
        mock_get.side_effect = requests.exceptions.Timeout()
        
        with pytest.raises(AgentPassportError) as exc_info:
            self.client.verify_agent_passport("ap_128094d34567890abcdef")
        
        assert exc_info.value.code == "timeout"
        assert exc_info.value.status_code == 408
    
    @patch('src.agent_passport.client.requests.Session.get')
    def test_verify_agent_passport_network_error(self, mock_get):
        """Test verification network error."""
        mock_get.side_effect = requests.exceptions.ConnectionError("Network error")
        
        with pytest.raises(AgentPassportError) as exc_info:
            self.client.verify_agent_passport("ap_128094d34567890abcdef")
        
        assert exc_info.value.code == "network_error"
        assert exc_info.value.status_code == 0
    
    def test_has_permission(self):
        """Test permission checking."""
        agent = AgentPassport(
            agent_id="ap_128094d34567890abcdef",
            slug="test-agent",
            name="Test Agent",
            owner="test-owner",
            controller_type="org",
            claimed=True,
            role="Test Role",
            description="Test Description",
            status="active",
            verification_status="verified",
            permissions=["read:data", "write:logs"],
            limits={},
            regions=[],
            contact="test@example.com",
            source="admin",
            created_at="2024-01-15T10:30:00Z",
            updated_at="2024-01-15T10:30:00Z",
            version="1.0.0"
        )
        
        assert self.client.has_permission(agent, "read:data") is True
        assert self.client.has_permission(agent, "write:logs") is True
        assert self.client.has_permission(agent, "delete:data") is False
    
    def test_is_allowed_in_region(self):
        """Test regional access checking."""
        agent = AgentPassport(
            agent_id="ap_128094d34567890abcdef",
            slug="test-agent",
            name="Test Agent",
            owner="test-owner",
            controller_type="org",
            claimed=True,
            role="Test Role",
            description="Test Description",
            status="active",
            verification_status="verified",
            permissions=[],
            limits={},
            regions=["us-east-1", "eu-west-1"],
            contact="test@example.com",
            source="admin",
            created_at="2024-01-15T10:30:00Z",
            updated_at="2024-01-15T10:30:00Z",
            version="1.0.0"
        )
        
        assert self.client.is_allowed_in_region(agent, "us-east-1") is True
        assert self.client.is_allowed_in_region(agent, "eu-west-1") is True
        assert self.client.is_allowed_in_region(agent, "ap-southeast-1") is False
    
    @patch.dict('os.environ', {'AGENT_PASSPORT_ID': 'ap_128094d34567890abcdef'})
    def test_get_agent_passport_id_from_env(self):
        """Test getting agent ID from environment variable."""
        assert self.client.get_agent_passport_id() == "ap_128094d34567890abcdef"
    
    def test_get_agent_passport_id_not_set(self):
        """Test getting agent ID when not set in environment."""
        with patch.dict('os.environ', {}, clear=True):
            assert self.client.get_agent_passport_id() is None
    
    def test_clear_cache(self):
        """Test cache clearing."""
        # Add something to cache
        self.client._cache["test_id"] = (Mock(), 999999999)
        assert "test_id" in self.client._cache
        
        self.client.clear_cache()
        assert len(self.client._cache) == 0
