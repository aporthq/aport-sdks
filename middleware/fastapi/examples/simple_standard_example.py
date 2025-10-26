"""
Simple Standard Agent Passport Middleware Example

This shows the simplest and most common way to use the middleware
with explicit agent ID and context from business logic.
"""

from fastapi import FastAPI, HTTPException, Request
from typing import Optional, List
from aporthq_middleware_fastapi import (
    AgentPassportMiddleware,
    agent_passport_middleware,
    get_agent,
    has_agent,
    check_assurance_requirement,
    check_capability_requirement,
    check_limits_for_operation,
    check_region_requirements,
    AssuranceEnforcementConfig,
    CapabilityEnforcementConfig,
    LimitsEnforcementConfig,
    RegionValidationConfig,
)

app = FastAPI(title="Agent Passport Simple Example")

# ============================================================================
# YOUR EXISTING AGENT ID
# ============================================================================

AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c"  # Your existing agent ID

# Add simplified middleware to the app with configuration
from aporthq_middleware_fastapi import AgentPassportMiddlewareOptions
from aporthq_middleware_fastapi.middleware_simple import AgentPassportMiddleware as SimpleAgentPassportMiddleware

middleware_options = AgentPassportMiddlewareOptions(
    skip_paths=["/health", "/docs", "/openapi.json", "/redoc"],
    skip_methods=["OPTIONS"],
    fail_closed=True
)

app.add_middleware(SimpleAgentPassportMiddleware, options=middleware_options)

# ============================================================================
# SIMPLE APPROACH: SDK-BASED MIDDLEWARE
# ============================================================================

@app.post("/api/refunds")
async def process_refund(
    request: Request,
    amount: float,
    currency: str,  # Required - any valid ISO 4217 currency code
    reason: str = None,
    region: str = None  # Optional - any valid country/region code
):
    """
    Process a refund request.
    Use SDK to validate amount limits and region access.
    """
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check assurance requirements
    assurance_config = AssuranceEnforcementConfig()
    assurance_check = check_assurance_requirement(
        agent_assurance_level=getattr(agent, 'assurance_level', 'L0'),
        path=request.url.path,
        config=assurance_config
    )
    
    if not assurance_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "insufficient_assurance",
                "message": "This endpoint requires higher assurance level",
                "required": assurance_check.get("required", "L2"),
                "current": getattr(agent, 'assurance_level', 'L0')
            }
        )
    
    # Use SDK to check limits
    limits_config = LimitsEnforcementConfig()
    limits_check = check_limits_for_operation(
        operation_type="refund",
        limits=agent.limits or {},
        operation_data={"amount_cents": int(amount * 100)},
        config=limits_config
    )
    
    if not limits_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "limit_exceeded",
                "message": "Refund amount exceeds limits",
                "details": limits_check.get("violations", [])
            }
        )
    
    return {
        "success": True,
        "refund_id": f"ref_{int(__import__('time').time() * 1000)}",
        "message": "Refund processed successfully",
        "amount": amount,
        "currency": currency,
        "region": region,
        "agent_id": agent.agent_id
    }

@app.post("/api/data/export")
async def export_data(
    request: Request,
    rows: int,
    format: str = "json",
    contains_pii: bool = False,
    user_id: str = None
):
    """
    Export data with explicit context from business logic.
    Use SDK to validate row limits and PII access.
    """
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check limits
    limits_config = LimitsEnforcementConfig()
    limits_check = check_limits_for_operation(
        operation_type="export",
        limits=agent.limits or {},
        operation_data={"rows": rows, "contains_pii": contains_pii},
        config=limits_config
    )
    
    if not limits_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "limit_exceeded",
                "message": "Export request exceeds limits",
                "details": limits_check.get("violations", [])
            }
        )
    
    return {
        "success": True,
        "export_id": f"exp_{int(__import__('time').time() * 1000)}",
        "message": "Data export created successfully",
        "rows": rows,
        "format": format,
        "contains_pii": contains_pii,
        "agent_id": agent.agent_id
    }

@app.post("/api/repo/pr")
async def create_pull_request(
    request: Request,
    repository: str,
    base_branch: str = "main",
    pr_size_kb: int = 0,
    file_path: str = None,
    requires_review: bool = True,
    author: str = None
):
    """
    Create a pull request with comprehensive validation.
    Use SDK to check repository access, branch access, PR size, etc.
    """
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check limits
    limits_config = LimitsEnforcementConfig()
    limits_check = check_limits_for_operation(
        operation_type="pr",
        limits=agent.limits or {},
        operation_data={"pr_size_kb": pr_size_kb, "repository": repository},
        config=limits_config
    )
    
    if not limits_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "limit_exceeded",
                "message": "PR request exceeds limits",
                "details": limits_check.get("violations", [])
            }
        )
    
    return {
        "success": True,
        "pr_id": f"pr_{int(__import__('time').time() * 1000)}",
        "message": "Pull request created successfully",
        "repository": repository,
        "base_branch": base_branch,
        "pr_size_kb": pr_size_kb,
        "agent_id": agent.agent_id
    }

@app.post("/api/messages/send")
async def send_message(
    request: Request,
    channel: str,
    message_count: int = 1,
    mentions: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    message_type: str = "text"
):
    """
    Send a message with rate limiting and channel validation.
    Use SDK to check channel access, rate limits, mention policies.
    """
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check limits
    limits_config = LimitsEnforcementConfig()
    limits_check = check_limits_for_operation(
        operation_type="messaging",
        limits=agent.limits or {},
        operation_data={"message_count": message_count, "channel": channel},
        config=limits_config
    )
    
    if not limits_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "limit_exceeded",
                "message": "Message request exceeds limits",
                "details": limits_check.get("violations", [])
            }
        )
    
    return {
        "success": True,
        "message_id": f"msg_{int(__import__('time').time() * 1000)}",
        "message": "Message sent successfully",
        "channel": channel,
        "message_count": message_count,
        "agent_id": agent.agent_id
    }

# ============================================================================
# ERROR HANDLING
# ============================================================================

@app.exception_handler(HTTPException)
async def policy_exception_handler(request, exc):
    """Handle policy-related exceptions"""
    if exc.status_code == 403 and "policy_violation" in str(exc.detail):
        return {
            "error": "policy_violation",
            "message": exc.detail.get("message", "Policy violation"),
            "violations": exc.detail.get("violations", []),
            "agent_id": exc.detail.get("agent_id"),
            "policy_id": exc.detail.get("policy_id")
        }
    return {"error": exc.detail, "status_code": exc.status_code}

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "agent_id": AGENT_ID
    }

# ============================================================================
# STARTUP
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Startup event"""
    print("🚀 Agent Passport Simple Example Server Starting...")
    print(f"📋 Agent ID: {AGENT_ID}")
    print("\n📋 Test your endpoints:")
    print("\n1. Refunds:")
    print("curl -X POST 'http://localhost:8000/api/refunds' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"amount\": 25.00, \"currency\": \"USD\"}'")
    
    print("\n2. Data Export:")
    print("curl -X POST 'http://localhost:8000/api/data/export' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"rows\": 1000, \"format\": \"json\", \"contains_pii\": false}'")
    
    print("\n3. Repository PR:")
    print("curl -X POST 'http://localhost:8000/api/repo/pr' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"repository\": \"myorg/myrepo\", \"base_branch\": \"main\", \"pr_size_kb\": 50}'")
    
    print("\n4. Messaging:")
    print("curl -X POST 'http://localhost:8000/api/messages/send' \\")
    print("  -H 'Content-Type: application/json' \\")
    print("  -d '{\"channel\": \"general\", \"message_count\": 5, \"mentions\": [\"@user1\"]}'")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# ============================================================================
# SUMMARY: SIMPLE STANDARD APPROACH
# ============================================================================

"""
KEY BENEFITS:

✅ EXPLICIT: Agent ID passed explicitly, no header extraction
✅ CLEAR: Context comes from your business logic, not hidden
✅ STANDARD: Follows FastAPI dependency injection patterns
✅ SIMPLE: Just two functions: require_policy() and require_policy_with_context()
✅ FLEXIBLE: Can use request body or explicit context

USAGE:

1. Basic (context from request body):
   @app.post("/api/refunds")
   async def refunds(amount: float, _: dict = require_policy("finance.payment.refund.v1", AGENT_ID)):
       return {"success": True}

2. Explicit context:
   @app.post("/api/data/export")
   async def export(rows: int, _: dict = require_policy_with_context("data.export.create.v1", AGENT_ID, {"rows": rows})):
       return {"success": True}

THAT'S IT! No magic, no header extraction, just explicit and clear middleware.
"""
