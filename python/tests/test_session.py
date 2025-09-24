"""Tests for the Agent Passport session."""

import pytest
import os
from unittest.mock import Mock, patch
from src.agent_passport.session import AgentSession, agent_session
from src.agent_passport.exceptions import AgentPassportError


class TestAgentSession:
    """Test cases for AgentSession."""
    
    def test_init(self):
        """Test AgentSession initialization."""
        session = AgentSession("ap_128094d34567890abcdef")
        
        assert session.agent_id == "ap_128094d34567890abcdef"
        assert session.session.headers["X-Agent-Passport-Id"] == "ap_128094d34567890abcdef"
        assert "User-Agent" in session.session.headers
    
    def test_context_manager(self):
        """Test AgentSession as context manager."""
        with AgentSession("ap_128094d34567890abcdef") as session:
            assert session.headers["X-Agent-Passport-Id"] == "ap_128094d34567890abcdef"
    
    @patch('src.agent_passport.session.requests.Session.get')
    def test_get_request(self, mock_get):
        """Test GET request with agent passport header."""
        mock_response = Mock()
        mock_get.return_value = mock_response
        
        session = AgentSession("ap_128094d34567890abcdef")
        response = session.get("https://api.example.com/data")
        
        assert response == mock_response
        mock_get.assert_called_once_with("https://api.example.com/data")
    
    @patch('src.agent_passport.session.requests.Session.post')
    def test_post_request(self, mock_post):
        """Test POST request with agent passport header."""
        mock_response = Mock()
        mock_post.return_value = mock_response
        
        session = AgentSession("ap_128094d34567890abcdef")
        response = session.post("https://api.example.com/data", json={"key": "value"})
        
        assert response == mock_response
        mock_post.assert_called_once_with("https://api.example.com/data", json={"key": "value"})
    
    @patch('src.agent_passport.session.requests.Session.request')
    def test_request_method(self, mock_request):
        """Test generic request method with agent passport header."""
        mock_response = Mock()
        mock_request.return_value = mock_response
        
        session = AgentSession("ap_128094d34567890abcdef")
        response = session.request("PATCH", "https://api.example.com/data")
        
        assert response == mock_response
        mock_request.assert_called_once_with("PATCH", "https://api.example.com/data")


class TestAgentSessionFunction:
    """Test cases for agent_session function."""
    
    def test_agent_session_with_id(self):
        """Test agent_session with explicit agent ID."""
        session = agent_session("ap_128094d34567890abcdef")
        
        assert isinstance(session, AgentSession)
        assert session.agent_id == "ap_128094d34567890abcdef"
    
    @patch.dict('os.environ', {'AGENT_PASSPORT_ID': 'ap_128094d34567890abcdef'})
    def test_agent_session_from_env(self):
        """Test agent_session with agent ID from environment."""
        session = agent_session()
        
        assert isinstance(session, AgentSession)
        assert session.agent_id == "ap_128094d34567890abcdef"
    
    def test_agent_session_no_id(self):
        """Test agent_session without agent ID."""
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(AgentPassportError) as exc_info:
                agent_session()
            
            assert exc_info.value.code == "missing_agent_id"
            assert exc_info.value.status_code == 400
