"""
Simple test to verify FastAPI middleware works with the updated SDK
"""

import asyncio
from fastapi import FastAPI, Request
from agent_passport_middleware import (
    AgentPassportMiddleware,
    AgentPassportMiddlewareOptions,
    require_policy,
    require_refund_policy
)

app = FastAPI()

# Test global middleware
app.add_middleware(
    AgentPassportMiddleware,
    options=AgentPassportMiddlewareOptions(
        base_url="https://api.aport.io",
        fail_closed=False,  # Don't fail for testing
        skip_paths=["/health", "/test"]
    )
)

# Test route-specific middleware
@app.post("/api/refunds")
async def process_refund(request: Request):
    # Add policy middleware
    middleware = require_refund_policy("test-agent-id")
    response = await middleware(request, lambda req: None)
    if response:
        return response
    
    return {
        "success": True,
        "message": "Refund processed",
        "agent_id": getattr(request.state, 'agent', {}).get('agent_id'),
        "policy_result": getattr(request.state, 'policy_result', None)
    }

# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Test endpoint
@app.get("/test")
async def test_endpoint():
    return {"message": "Middleware test endpoint"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
