"""
Tests for the production-grade thin client implementation.
"""

import asyncio
import pytest
import json
from unittest.mock import AsyncMock, Mock, patch
import aiohttp

from aporthq_sdk_python import (
    APortClient,
    APortClientOptions,
    PolicyVerifier,
    AportError,
    PolicyVerificationResponse,
)


def create_mock_session(response_data, status=200, headers=None):
    """Helper to create a mock aiohttp session."""
    if headers is None:
        headers = {}
    
    # Create a mock response object
    mock_response_obj = AsyncMock()
    mock_response_obj.ok = status < 400
    mock_response_obj.status = status
    mock_response_obj.headers = headers
    mock_response_obj.text = AsyncMock(return_value=json.dumps(response_data))

    # Create a mock context manager for the request
    class MockRequestContext:
        def __init__(self, response):
            self.response = response
        
        async def __aenter__(self):
            return self.response
        
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    # Create a mock session
    mock_session = AsyncMock()
    mock_session.request = Mock(return_value=MockRequestContext(mock_response_obj))
    mock_session.closed = False
    
    return mock_session


class TestAPortClient:
    """Test the APortClient class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.options = APortClientOptions(
            base_url="https://api.aport.io",
            api_key="test-api-key",
            timeout_ms=800,
        )

    @pytest.mark.asyncio
    async def test_verify_policy_success(self):
        """Test successful policy verification."""
        mock_response = {
            "decision_id": "dec_123",
            "allow": True,
            "reasons": [],
            "expires_in": 60,
            "assurance_level": "L2",
            "created_at": "2025-01-01T00:00:00Z",
        }

        mock_session = create_mock_session(
            mock_response, 
            status=200, 
            headers={"server-timing": "cache;dur=5"}
        )

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            # Patch _ensure_session to avoid creating a new session
            client._ensure_session = AsyncMock()
            client._session = mock_session
            result = await client.verify_policy(
                "test-agent",
                "finance.payment.refund.v1",
                {"amount": 1000, "currency": "USD"},
                "test-key",
            )

            # Verify request was made correctly
            mock_session.request.assert_called_once()
            call_args = mock_session.request.call_args
            assert call_args[1]["method"] == "POST"
            assert call_args[1]["url"] == "https://api.aport.io/api/verify/policy/finance.payment.refund.v1"
            assert "Authorization" in call_args[1]["headers"]
            assert call_args[1]["headers"]["Authorization"] == "Bearer test-api-key"
            assert call_args[1]["headers"]["Idempotency-Key"] == "test-key"

            # Verify response
            assert result.decision_id == "dec_123"
            assert result.allow is True
            assert result.assurance_level == "L2"
            assert result._meta == {"serverTiming": "cache;dur=5"}

    @pytest.mark.asyncio
    async def test_verify_policy_with_reasons(self):
        """Test policy verification with rejection reasons."""
        mock_response = {
            "decision_id": "dec_456",
            "allow": False,
            "reasons": [
                {
                    "code": "INSUFFICIENT_CAPABILITIES",
                    "message": "Missing required capability: finance.payment.refund",
                    "severity": "error",
                }
            ],
            "expires_in": 60,
            "created_at": "2025-01-01T00:00:00Z",
        }

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            client._session = mock_session
            result = await client.verify_policy(
                "test-agent", "finance.payment.refund.v1", {"amount": 1000, "currency": "USD"}
            )

            assert result.allow is False
            assert len(result.reasons) == 1
            assert result.reasons[0]["code"] == "INSUFFICIENT_CAPABILITIES"
            assert result.reasons[0]["severity"] == "error"

    @pytest.mark.asyncio
    async def test_verify_policy_api_error(self):
        """Test policy verification with API error."""
        error_response = {
            "reasons": [
                {
                    "code": "INVALID_REQUEST",
                    "message": "Invalid request",
                    "severity": "error",
                }
            ],
            "decision_id": "dec_error",
        }

        mock_session = create_mock_session(error_response, status=400)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session

            with pytest.raises(AportError) as exc_info:
                await client.verify_policy("test-agent", "finance.payment.refund.v1", {})

            assert exc_info.value.status == 400
            assert exc_info.value.reasons == error_response["reasons"]
            assert exc_info.value.decision_id == "dec_error"

    @pytest.mark.asyncio
    async def test_get_decision_token(self):
        """Test getting a decision token."""
        mock_response = {"token": "jwt_token_123"}

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            result = await client.get_decision_token(
                "test-agent", "finance.payment.refund.v1", {"amount": 1000, "currency": "USD"}
            )

            mock_session.request.assert_called_once()
            call_args = mock_session.request.call_args
            assert call_args[1]["method"] == "POST"
            assert call_args[1]["url"] == "https://api.aport.io/api/verify/token/finance.payment.refund.v1"
            assert result == "jwt_token_123"

    @pytest.mark.asyncio
    async def test_validate_decision_token(self):
        """Test validating a decision token."""
        mock_response = {
            "decision": {
                "decision_id": "dec_789",
                "allow": True,
                "reasons": [],
                "expires_in": 60,
                "created_at": "2025-01-01T00:00:00Z",
            }
        }

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            result = await client.validate_decision_token("jwt_token_123")

            mock_session.request.assert_called_once()
            call_args = mock_session.request.call_args
            assert call_args[1]["method"] == "POST"
            assert call_args[1]["url"] == "https://api.aport.io/api/verify/token/validate"
            assert result.decision_id == "dec_789"

    @pytest.mark.asyncio
    async def test_get_passport_view(self):
        """Test getting passport view."""
        mock_response = {
            "agent_id": "test-agent",
            "status": "active",
            "capabilities": ["finance.payment.refund"],
        }

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            result = await client.get_passport_view("test-agent")

            mock_session.request.assert_called_once()
            call_args = mock_session.request.call_args
            assert call_args[1]["method"] == "GET"
            assert call_args[1]["url"] == "https://api.aport.io/api/passports/test-agent/verify_view"
            assert result["agent_id"] == "test-agent"

    @pytest.mark.asyncio
    async def test_normalize_url(self):
        """Test URL normalization."""
        client = APortClient(self.options)
        
        # Test with trailing slash
        client_with_slash = APortClient(
            APortClientOptions(base_url="https://api.aport.io/")
        )
        
        assert client._normalize_url("/api/test") == "https://api.aport.io/api/test"
        assert client_with_slash._normalize_url("/api/test") == "https://api.aport.io/api/test"
        assert client._normalize_url("api/test") == "https://api.aport.io/api/test"

    @pytest.mark.asyncio
    async def test_timeout_error(self):
        """Test timeout error handling."""
        # Create a mock session that raises TimeoutError
        mock_session = AsyncMock()
        mock_session.closed = False
        
        # Create a mock request context that raises TimeoutError
        class MockRequestContextWithTimeout:
            async def __aenter__(self):
                raise asyncio.TimeoutError()
            
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        
        mock_session.request = Mock(return_value=MockRequestContextWithTimeout())

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session

            with pytest.raises(AportError) as exc_info:
                await client.verify_policy("test-agent", "finance.payment.refund.v1", {})

            assert exc_info.value.status == 408
            assert exc_info.value.reasons[0]["code"] == "TIMEOUT"

    @pytest.mark.asyncio
    async def test_network_error(self):
        """Test network error handling."""
        # Create a mock session that raises ClientError
        mock_session = AsyncMock()
        mock_session.closed = False
        
        # Create a mock request context that raises ClientError
        class MockRequestContextWithError:
            async def __aenter__(self):
                raise aiohttp.ClientError("Network error")
            
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        
        mock_session.request = Mock(return_value=MockRequestContextWithError())

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session

            with pytest.raises(AportError) as exc_info:
                await client.verify_policy("test-agent", "finance.payment.refund.v1", {})

            assert exc_info.value.status == 0
            assert exc_info.value.reasons[0]["code"] == "NETWORK_ERROR"


class TestPolicyVerifier:
    """Test the PolicyVerifier class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.options = APortClientOptions(
            base_url="https://api.aport.io",
            api_key="test-api-key",
        )

    @pytest.mark.asyncio
    async def test_verify_refund(self):
        """Test refund policy verification."""
        mock_response = {
            "decision_id": "dec_123",
            "allow": True,
            "reasons": [],
            "expires_in": 60,
            "created_at": "2025-01-01T00:00:00Z",
        }

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            verifier = PolicyVerifier(client)

            context = {
                "amount": 1000,
                "currency": "USD",
                "order_id": "order_123",
                "reason": "defective",
            }
            result = await verifier.verify_refund("test-agent", context, "idem_123")

            assert result.decision_id == "dec_123"
            assert result.allow is True

    @pytest.mark.asyncio
    async def test_verify_repository(self):
        """Test repository policy verification."""
        mock_response = {
            "decision_id": "dec_repo",
            "allow": True,
            "reasons": [],
            "expires_in": 60,
            "created_at": "2025-01-01T00:00:00Z",
        }

        mock_session = create_mock_session(mock_response)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            client = APortClient(self.options)
            client._ensure_session = AsyncMock()
            client._session = mock_session
            verifier = PolicyVerifier(client)

            context = {
                "operation": "create_pr",
                "repository": "my-org/my-repo",
                "pr_size_kb": 500,
            }
            result = await verifier.verify_repository("test-agent", context)

            assert result.decision_id == "dec_repo"
            assert result.allow is True