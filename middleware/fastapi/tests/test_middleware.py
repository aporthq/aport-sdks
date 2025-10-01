"""Tests for the FastAPI middleware."""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from httpx import AsyncClient

from agent_passport_middleware import (
    AgentPassportMiddleware,
    agent_passport_middleware,
    has_agent_permission,
    is_agent_allowed_in_region,
    get_agent,
    has_agent,
    AgentPassportMiddlewareOptions,
)
from agent_passport import AgentPassport, AgentPassportError


class TestAgentPassportMiddleware:
    """Test cases for AgentPassportMiddleware."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = FastAPI()
        self.mock_agent = AgentPassport(
            agent_id='aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef',
            slug='test-agent',
            name='Test Agent',
            owner='test-owner',
            controller_type='org',
            claimed=True,
            role='Test Role',
            description='Test Description',
            status='active',
            verification_status='verified',
            permissions=['read:data'],
            limits={},
            regions=['us-east-1'],
            contact='test@example.com',
            source='admin',
            created_at='2024-01-15T10:30:00Z',
            updated_at='2024-01-15T10:30:00Z',
            version='1.0.0'
        )
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_verifies_agent_and_attaches_to_request(self, mock_client_class):
        """Test that middleware verifies agent and attaches to request."""
        mock_client = Mock()
        mock_client.verify_agent_passport = AsyncMock(return_value=self.mock_agent)
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions()
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'agent_id': request.state.agent.agent_id}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test', headers={'X-Agent-Passport-Id': 'aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef'})
        
        assert response.status_code == 200
        assert response.json()['agent_id'] == 'aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef'
        mock_client.verify_agent_passport.assert_called_once_with('aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef')
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_returns_400_when_agent_id_missing_and_fail_closed_true(self, mock_client_class):
        """Test middleware returns 400 when agent ID is missing and fail_closed is True."""
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions(fail_closed=True)
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test')
        
        assert response.status_code == 400
        assert response.json()['error'] == 'missing_agent_id'
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_continues_when_agent_id_missing_and_fail_closed_false(self, mock_client_class):
        """Test middleware continues when agent ID is missing and fail_closed is False."""
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions(fail_closed=False)
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test')
        
        assert response.status_code == 200
        assert response.json()['success'] is True
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_skips_OPTIONS_requests(self, mock_client_class):
        """Test middleware skips OPTIONS requests."""
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions()
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.options('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.options('/test')
        
        assert response.status_code == 200
        assert response.json()['success'] is True
        mock_client.verify_agent_passport.assert_not_called()
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_skips_specified_paths(self, mock_client_class):
        """Test middleware skips specified paths."""
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions(skip_paths=['/health'])
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/health')
        async def health_endpoint(request: Request):
            return {'status': 'ok'}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/health')
        
        assert response.status_code == 200
        assert response.json()['status'] == 'ok'
        mock_client.verify_agent_passport.assert_not_called()
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_checks_required_permissions(self, mock_client_class):
        """Test middleware checks required permissions."""
        mock_client = Mock()
        mock_client.verify_agent_passport = AsyncMock(return_value=self.mock_agent)
        mock_client.has_permission = Mock(return_value=False)
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions(required_permissions=['write:data'])
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test', headers={'X-Agent-Passport-Id': 'aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef'})
        
        assert response.status_code == 403
        assert response.json()['error'] == 'insufficient_permissions'
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_checks_allowed_regions(self, mock_client_class):
        """Test middleware checks allowed regions."""
        mock_client = Mock()
        mock_client.verify_agent_passport = AsyncMock(return_value=self.mock_agent)
        mock_client.is_allowed_in_region = Mock(return_value=False)
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions(allowed_regions=['eu-west-1'])
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test', headers={'X-Agent-Passport-Id': 'aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef'})
        
        assert response.status_code == 403
        assert response.json()['error'] == 'region_not_allowed'
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_middleware_handles_verification_errors(self, mock_client_class):
        """Test middleware handles verification errors."""
        mock_client = Mock()
        mock_client.verify_agent_passport = AsyncMock(
            side_effect=AgentPassportError('Agent not found', 'agent_not_found', 404)
        )
        mock_client_class.return_value = mock_client
        
        options = AgentPassportMiddlewareOptions()
        middleware = AgentPassportMiddleware(self.app, options)
        
        @self.app.get('/test')
        async def test_endpoint(request: Request):
            return {'success': True}
        
        self.app.add_middleware(AgentPassportMiddleware, options=options)
        
        client = TestClient(self.app)
        response = client.get('/test', headers={'X-Agent-Passport-Id': 'ap_invalid_id'})
        
        assert response.status_code == 404
        assert response.json()['error'] == 'agent_not_found'


class TestHelperFunctions:
    """Test cases for helper functions."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_agent = AgentPassport(
            agent_id='aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef',
            slug='test-agent',
            name='Test Agent',
            owner='test-owner',
            controller_type='org',
            claimed=True,
            role='Test Role',
            description='Test Description',
            status='active',
            verification_status='verified',
            permissions=['read:data', 'write:logs'],
            limits={},
            regions=['us-east-1', 'eu-west-1'],
            contact='test@example.com',
            source='admin',
            created_at='2024-01-15T10:30:00Z',
            updated_at='2024-01-15T10:30:00Z',
            version='1.0.0'
        )
        self.mock_request = Mock()
        self.mock_request.state.agent = self.mock_agent
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_has_agent_permission(self, mock_client_class):
        """Test has_agent_permission helper function."""
        mock_client = Mock()
        mock_client.has_permission = Mock(return_value=True)
        mock_client_class.return_value = mock_client
        
        result = has_agent_permission(self.mock_request, 'read:data')
        
        assert result is True
        mock_client.has_permission.assert_called_once_with(self.mock_agent, 'read:data')
    
    @patch('agent_passport_middleware.middleware.AgentPassportClient')
    def test_is_agent_allowed_in_region(self, mock_client_class):
        """Test is_agent_allowed_in_region helper function."""
        mock_client = Mock()
        mock_client.is_allowed_in_region = Mock(return_value=True)
        mock_client_class.return_value = mock_client
        
        result = is_agent_allowed_in_region(self.mock_request, 'us-east-1')
        
        assert result is True
        mock_client.is_allowed_in_region.assert_called_once_with(self.mock_agent, 'us-east-1')
    
    def test_get_agent(self):
        """Test get_agent helper function."""
        result = get_agent(self.mock_request)
        
        assert result == self.mock_agent
    
    def test_has_agent(self):
        """Test has_agent helper function."""
        assert has_agent(self.mock_request) is True
        
        # Test with no agent
        request_no_agent = Mock()
        request_no_agent.state.agent = None
        assert has_agent(request_no_agent) is False
