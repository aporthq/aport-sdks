"""
Example of using the new SDK-based FastAPI middleware.

This example demonstrates how to use the Agent Passport SDK modules
directly in any Python application, not just FastAPI.
"""

from fastapi import FastAPI, Request, HTTPException
from agent_passport_middleware import (
    # SDK-based middleware
    AgentPassportMiddleware,
    agent_passport_middleware,
    get_agent,
    has_agent,
    
    # SDK modules for direct use
    check_assurance_requirement,
    check_capability_requirement,
    check_limits_for_operation,
    check_mcp_requirement,
    check_region_requirements,
    AssuranceEnforcementConfig,
    CapabilityEnforcementConfig,
    LimitsEnforcementConfig,
    MCPEnforcementConfig,
    RegionValidationConfig,
)

# Create FastAPI app
app = FastAPI(title="Agent Passport SDK Example")

# Option 1: Use the SDK-based middleware with configuration
from agent_passport_middleware import AgentPassportMiddlewareOptions

middleware_options = AgentPassportMiddlewareOptions(
    skip_paths=["/", "/health", "/docs", "/openapi.json", "/redoc"],
    skip_methods=["OPTIONS"],
    fail_closed=True
)

app.add_middleware(AgentPassportMiddleware, options=middleware_options)

# Option 2: Use the middleware factory function
# middleware = agent_passport_middleware()
# app.add_middleware(middleware)


@app.get("/")
async def root():
    """Public endpoint that doesn't require agent passport."""
    return {"message": "Hello World"}


@app.get("/protected")
async def protected_endpoint(request: Request):
    """Protected endpoint that requires agent passport."""
    # The middleware automatically verifies the agent passport
    # and attaches it to request.state.agent
    
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    return {
        "message": "This is a protected endpoint",
        "agent_id": agent.agent_id,
        "agent_name": agent.name,
        "permissions": agent.permissions,
        "regions": agent.regions,
        "assurance_level": getattr(agent, 'assurance_level', 'L0')
    }


@app.get("/payments/refund")
async def refund_endpoint(request: Request):
    """Payment refund endpoint with assurance requirements."""
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check assurance requirements
    # This endpoint requires L2+ assurance (GitHub verified)
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
    
    return {
        "message": "Refund processed",
        "agent_id": agent.agent_id,
        "assurance_level": getattr(agent, 'assurance_level', 'L0')
    }


@app.get("/admin")
async def admin_endpoint(request: Request):
    """Admin endpoint with high assurance requirements."""
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check assurance requirements
    # This endpoint requires L4KYC+ assurance (KYC verified)
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
                "required": assurance_check.get("required", "L4KYC"),
                "current": getattr(agent, 'assurance_level', 'L0')
            }
        )
    
    return {
        "message": "Admin access granted",
        "agent_id": agent.agent_id,
        "assurance_level": getattr(agent, 'assurance_level', 'L0')
    }


# Example of using SDK modules directly (not just in FastAPI)
def example_direct_sdk_usage():
    """Example of using SDK modules directly in any Python application."""
    
    # Example agent data
    agent_data = {
        "agent_id": "agent_123",
        "assurance_level": "L2",
        "capabilities": ["finance.payment.refund", "data.export"],
        "regions": ["US", "CA"],
        "limits": {
            "refund_amount_max_per_tx": 1000,
            "max_export_rows": 10000
        }
    }
    
    # Check assurance requirements
    assurance_config = AssuranceEnforcementConfig()
    assurance_check = check_assurance_requirement(
        agent_data["assurance_level"],
        "/api/payments/refund",
        assurance_config
    )
    
    print(f"Assurance check: {assurance_check}")
    
    # Check capability requirements
    capability_config = CapabilityEnforcementConfig()
    capability_check = check_capability_requirement(
        "/api/payments/refund",
        agent_data["capabilities"],
        capability_config
    )
    
    print(f"Capability check: {capability_check}")
    
    # Check region requirements
    region_config = RegionValidationConfig()
    region_check = check_region_requirements(
        agent_data["regions"],
        ["US", "CA"],
        region_config
    )
    
    print(f"Region check: {region_check}")
    
    # Check limits
    limits_config = LimitsEnforcementConfig()
    limits_check = check_limits_for_operation(
        "refund",
        agent_data["limits"],
        {"amount_cents": 500},
        limits_config
    )
    
    print(f"Limits check: {limits_check}")
    
    # Check MCP requirements
    mcp_config = MCPEnforcementConfig()
    mcp_headers = {"x-mcp-server": "github", "x-mcp-tool": "create_pr"}
    mcp_check = check_mcp_requirement(
        mcp_headers,
        agent_data,
        mcp_config
    )
    
    print(f"MCP check: {mcp_check}")


if __name__ == "__main__":
    import uvicorn
    
    # Run the example
    print("Running Agent Passport SDK example...")
    print("Visit http://localhost:8000/docs to see the API documentation")
    
    # Example of direct SDK usage
    print("\nDirect SDK usage example:")
    example_direct_sdk_usage()
    
    # Run the FastAPI server
    uvicorn.run(app, host="0.0.0.0", port=8000)
