"""
Simple Agent Passport FastAPI Middleware Example

This example demonstrates the three main usage patterns:
1. Global policy enforcement
2. Route-specific with explicit agent ID
3. Route-specific with header fallback
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

from aporthq_middleware_fastapi import (
    agent_passport_middleware,
    require_policy,
    require_policy_with_context,
    AgentPassportMiddlewareOptions,
)

app = FastAPI(title="Agent Passport Example API")

# ============================================================================
# CONFIGURATION
# ============================================================================

AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"  # Your agent ID

# ============================================================================
# PATTERN 1: GLOBAL POLICY ENFORCEMENT
# ============================================================================

"""
Global middleware enforces a specific policy on all routes.
Agent ID is extracted from X-Agent-Passport-Id header.
"""
app.add_middleware(
    agent_passport_middleware,
    options=AgentPassportMiddlewareOptions(
        policy_id="finance.payment.refund.v1",  # Enforces refunds policy globally
        fail_closed=True
    )
)

# All routes below now require finance.payment.refund.v1 policy compliance
@app.post("/api/refunds")
async def process_refund(request: Request):
    """Process refund with global policy enforcement."""
    # Policy already verified - safe to process
    body = await request.json()
    amount = body.get("amount")
    currency = body.get("currency")
    order_id = body.get("order_id")
    
    return JSONResponse({
        "success": True,
        "refund_id": f"ref_{int(time.time() * 1000)}",
        "amount": amount,
        "currency": currency,
        "order_id": order_id,
        "agent_id": request.state.agent.agent_id
    })

# ============================================================================
# PATTERN 2: ROUTE-SPECIFIC WITH EXPLICIT AGENT ID (PREFERRED)
# ============================================================================

"""
Explicit agent ID is most secure and clear.
No header extraction needed.
"""
@app.post("/api/data/export")
async def export_data(request: Request):
    """Export data with explicit agent ID."""
    # Policy verified with explicit agent ID
    body = await request.json()
    rows = body.get("rows")
    format = body.get("format")
    contains_pii = body.get("contains_pii")
    
    return JSONResponse({
        "success": True,
        "export_id": f"exp_{int(time.time() * 1000)}",
        "rows": rows,
        "format": format,
        "contains_pii": contains_pii,
        "agent_id": request.state.agent.agent_id
    })

# Add the policy middleware
app.middleware("http")(require_policy("data.export.create.v1", AGENT_ID))

# ============================================================================
# PATTERN 3: ROUTE-SPECIFIC WITH HEADER FALLBACK
# ============================================================================

"""
Header fallback for backward compatibility.
Uses X-Agent-Passport-Id header.
"""
@app.post("/api/messages/send")
async def send_message(request: Request):
    """Send message with header fallback."""
    # Policy verified via header
    body = await request.json()
    channel = body.get("channel")
    message_count = body.get("message_count")
    mentions = body.get("mentions")
    
    return JSONResponse({
        "success": True,
        "message_id": f"msg_{int(time.time() * 1000)}",
        "channel": channel,
        "message_count": message_count,
        "mentions": mentions,
        "agent_id": request.state.agent.agent_id
    })

# Add the policy middleware
app.middleware("http")(require_policy("messaging.message.send.v1"))  # No agent ID - uses header

# ============================================================================
# PATTERN 4: CUSTOM CONTEXT
# ============================================================================

"""
Custom context for complex scenarios.
"""
@app.post("/api/repo/pr")
async def create_pr(request: Request):
    """Create PR with custom context."""
    # Policy verified with custom context
    body = await request.json()
    pr_size_kb = body.get("pr_size_kb")
    file_path = body.get("file_path")
    
    return JSONResponse({
        "success": True,
        "pr_id": f"pr_{int(time.time() * 1000)}",
        "repository": "myorg/myrepo",
        "base_branch": "main",
        "pr_size_kb": pr_size_kb,
        "file_path": file_path,
        "agent_id": request.state.agent.agent_id
    })

# Add the policy middleware with custom context
app.middleware("http")(
    require_policy_with_context(
        "code.repository.merge.v1",
        {
            "repository": "myorg/myrepo",
            "base_branch": "main"
        },
        AGENT_ID
    )
)

# ============================================================================
# ERROR HANDLING
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions from middleware."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "Internal server error"
        }
    )

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse({
        "status": "ok",
        "timestamp": "2025-01-16T00:00:00Z",
        "agent_id": AGENT_ID
    })

# ============================================================================
# STARTUP
# ============================================================================

if __name__ == "__main__":
    import time
    
    print("🚀 Agent Passport FastAPI Example Server starting...")
    print(f"📋 Agent ID: {AGENT_ID}")
    print("\n📋 Test your endpoints:")
    print("\n1. Refunds (Global Policy):")
    print(f"curl -X POST 'http://localhost:8000/api/refunds' \\")
    print(f"  -H 'Content-Type: application/json' \\")
    print(f"  -H 'X-Agent-Passport-Id: {AGENT_ID}' \\")
    print("  -d '{\"amount\": 25.00, \"currency\": \"USD\", \"order_id\": \"order_123\", \"customer_id\": \"cust_456\", \"reason_code\": \"defective\", \"idempotency_key\": \"idem_789\"}'")
    
    print("\n2. Data Export (Explicit Agent ID):")
    print("curl -X POST 'http://localhost:8000/api/data/export' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"rows\": 1000, \"format\": \"json\", \"contains_pii\": false}'")
    
    print("\n3. Messaging (Header Fallback):")
    print(f"curl -X POST 'http://localhost:8000/api/messages/send' \\")
    print(f"  -H 'Content-Type: application/json' \\")
    print(f"  -H 'X-Agent-Passport-Id: {AGENT_ID}' \\")
    print("  -d '{\"channel\": \"general\", \"message_count\": 5, \"mentions\": [\"@user1\"]}'")
    
    print("\n4. Repository PR (Custom Context):")
    print("curl -X POST 'http://localhost:8000/api/repo/pr' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"pr_size_kb\": 50, \"file_path\": \"src/main.py\"}'")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)

# ============================================================================
# SUMMARY: SIMPLE PATTERNS
# ============================================================================

"""
KEY PATTERNS:

✅ GLOBAL: Enforce one policy on all routes
   app.add_middleware(agent_passport_middleware, options=AgentPassportMiddlewareOptions(policy_id="finance.payment.refund.v1"))

✅ EXPLICIT: Most secure, explicit agent ID
   app.middleware("http")(require_policy("finance.payment.refund.v1", AGENT_ID))

✅ HEADER: Backward compatible, uses header
   app.middleware("http")(require_policy("data.export.create.v1"))

✅ CONTEXT: Custom context for complex scenarios
   app.middleware("http")(require_policy_with_context("code.repository.merge.v1", context, AGENT_ID))

THAT'S IT! Simple, clear, and powerful policy enforcement.
"""
