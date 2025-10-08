# Agent Passport FastAPI Examples

This directory contains working examples showing how to integrate Agent Passport middleware with FastAPI applications using the new SDK-based approach.

## 📁 Examples Overview

### 1. `sdk_based_example.py` ⭐ **RECOMMENDED**
**Shows how to use the SDK directly in any Python application**

- ✅ Uses SDK functions directly in route handlers
- ✅ Demonstrates assurance, capability, and limits checking
- ✅ Shows both middleware and direct SDK usage
- ✅ Framework-agnostic SDK approach

### 2. `simple_standard_example.py` ⭐ **RECOMMENDED**
**Complete FastAPI integration with SDK-based middleware**

- ✅ Uses simplified middleware that only verifies agent passport
- ✅ Route handlers use SDK functions directly
- ✅ Shows proper error handling and status codes
- ✅ Demonstrates the complete flow

### 3. `test_working.py`
**Test script to verify examples work correctly**

- ✅ Tests imports and configuration
- ✅ Verifies SDK functions work
- ✅ Confirms middleware setup
- ✅ Validates example structure

## 🚀 Quick Start (5 minutes)

If you already have an agent ID (e.g., `agents/ap_a2d10232c6534523812423eec8a1425c`):

```bash
# 1. Install dependencies
pip install fastapi uvicorn httpx

# 2. Run the SDK-based example
python sdk_based_example.py

# 3. Test the endpoints
curl -X GET 'http://localhost:8000/'  # Public endpoint
curl -X GET 'http://localhost:8000/protected' \
  -H 'X-Agent-Passport-Id: agents/ap_a2d10232c6534523812423eec8a1425c'  # Protected endpoint
```

## 🔄 How It Works

### The New SDK-Based Flow:

1. **Middleware extracts agent ID** from headers (`X-Agent-Passport-Id`)
2. **Middleware calls SDK** to verify agent passport: `verifyAgentPassport(agentId)`
3. **Middleware attaches agent** to request state: `request.state.agent = agent`
4. **Route handlers use SDK functions** directly with agent data and context
5. **SDK functions take parameters explicitly** - no header extraction in SDK

### Key Benefits:
- ✅ **Explicit**: Agent ID and context passed explicitly to SDK functions
- ✅ **Framework-agnostic**: SDK works in any Python application
- ✅ **Clear separation**: Middleware only verifies, SDK handles enforcement
- ✅ **Testable**: Easy to test and debug
- ✅ **Consistent**: Same pattern as Node.js SDK

## 📋 Basic Usage

### SDK-Based Middleware Approach:
```python
from fastapi import FastAPI, Request
from agent_passport_middleware import (
    AgentPassportMiddleware,
    get_agent,
    check_assurance_requirement,
    AssuranceEnforcementConfig
)

app = FastAPI()

# Add middleware
app.add_middleware(AgentPassportMiddleware)

@app.get("/protected")
async def protected_endpoint(request: Request):
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check requirements
    assurance_config = AssuranceEnforcementConfig()
    assurance_check = check_assurance_requirement(
        agent_assurance_level=agent.assurance_level,
        path=request.url.path,
        config=assurance_config
    )
    
    if not assurance_check["allowed"]:
        raise HTTPException(status_code=403, detail="Insufficient assurance level")
    
    return {"message": "Access granted", "agent_id": agent.agent_id}
```

### Direct SDK Usage (Any Python App):
```python
from agent_passport import (
    AgentPassportClient,
    check_assurance_requirement,
    check_limits_for_operation,
    AssuranceEnforcementConfig,
    LimitsEnforcementConfig
)

# Use SDK directly in any Python application
client = AgentPassportClient()
agent = await client.verify_agent_passport("agents/ap_a2d10232c6534523812423eec8a1425c")

# Check requirements
assurance_config = AssuranceEnforcementConfig()
assurance_check = check_assurance_requirement(
    agent_assurance_level=agent.assurance_level,
    path="/api/payments/refund",
    config=assurance_config
)

limits_config = LimitsEnforcementConfig()
limits_check = check_limits_for_operation(
    operation_type="refund",
    limits=agent.limits,
    operation_data={"amount_cents": 500},
    config=limits_config
)
```

## 🛡️ SDK Functions Available

### Assurance Enforcement
- `check_assurance_requirement()` - Check if agent meets assurance level requirements
- `meets_minimum_assurance()` - Check if agent meets minimum assurance level
- `get_required_assurance_level()` - Get required assurance level for a path

### Capability Enforcement
- `check_capability_requirement()` - Check if agent has required capabilities
- `create_capability_enforcer()` - Create a capability enforcer function

### Limits Enforcement
- `check_limits_for_operation()` - Check if operation is within limits
- `create_limit_checker()` - Create a limit checker function

### Region Validation
- `check_region_requirements()` - Check if agent is allowed in required regions
- `validate_region()` - Validate a single region
- `is_agent_authorized_in_region()` - Check if agent is authorized in region

### MCP Enforcement
- `check_mcp_requirement()` - Check MCP (Model Context Protocol) requirements
- `validate_mcp_headers()` - Validate MCP headers

### Policy Enforcement
- `check_policy_compliance()` - Check policy compliance
- `check_policy_sync()` - Check policy synchronization

### Taxonomy Validation
- `validate_agent_taxonomy()` - Validate agent categories and frameworks
- `check_taxonomy_requirements()` - Check taxonomy requirements

## ⚙️ Configuration

```python
from agent_passport_middleware import AgentPassportMiddlewareOptions

middleware_options = AgentPassportMiddlewareOptions(
    base_url="https://api.aport.io",  # Agent Passport API URL
    timeout=5,                         # Request timeout
    cache=True,                        # Enable caching
    fail_closed=True,                  # Block on verification failure
    skip_paths=["/health", "/docs"],   # Paths to skip
    skip_methods=["OPTIONS"],          # HTTP methods to skip
    required_permissions=[],           # Required permissions
    allowed_regions=[]                 # Allowed regions
)

app.add_middleware(AgentPassportMiddleware, options=middleware_options)
```

## 🧪 Testing

### Test with valid agent ID:
```bash
curl -X GET 'http://localhost:8000/protected' \
  -H 'X-Agent-Passport-Id: agents/ap_a2d10232c6534523812423eec8a1425c'
```

### Test with POST data:
```bash
curl -X POST 'http://localhost:8000/api/refunds' \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Passport-Id: agents/ap_a2d10232c6534523812423eec8a1425c' \
  -d '{"amount": 25.00, "currency": "USD"}'
```

### Run the test script:
```bash
python test_working.py
```

## 🎯 Best Practices

### 1. Use SDK Functions Directly
```python
# ✅ Good: Use SDK functions in route handlers
@app.post("/api/refunds")
async def refunds(request: Request, amount: float):
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    # Use SDK to check requirements
    limits_check = check_limits_for_operation(
        operation_type="refund",
        limits=agent.limits,
        operation_data={"amount_cents": int(amount * 100)},
        config=LimitsEnforcementConfig()
    )
    
    if not limits_check["allowed"]:
        raise HTTPException(status_code=403, detail="Limit exceeded")
    
    return {"success": True}
```

### 2. Handle Errors Properly
```python
# ✅ Good: Proper error handling
try:
    agent = await client.verify_agent_passport(agent_id)
except AgentPassportError as e:
    raise HTTPException(status_code=e.status_code, detail=e.message)
```

### 3. Use Configuration Objects
```python
# ✅ Good: Use configuration objects
assurance_config = AssuranceEnforcementConfig(
    enforce_on_all_routes=True,
    allow_unmapped_routes=False
)

result = check_assurance_requirement(
    agent_assurance_level=agent.assurance_level,
    path=request.url.path,
    config=assurance_config
)
```

## ❓ Common Questions

### Q: How is this different from the old approach?
**A**: The old approach did all enforcement in the middleware. The new approach uses a simplified middleware that only verifies the agent passport, then route handlers use SDK functions directly for enforcement.

### Q: Can I use the SDK without FastAPI?
**A**: Yes! The SDK is framework-agnostic and can be used in any Python application.

### Q: Where does the agent ID come from?
**A**: The middleware extracts it from the `X-Agent-Passport-Id` header, but the SDK functions receive it as a parameter.

### Q: How do I handle multiple agents?
**A**: The middleware handles one agent per request, but you can use different agent IDs for different requests.

## 🎉 Summary

**The new SDK-based approach provides:**
- ✅ **Framework-agnostic SDK** - Works in any Python application
- ✅ **Explicit parameters** - Agent ID and context passed explicitly to SDK functions
- ✅ **Clear separation** - Middleware verifies, SDK enforces
- ✅ **Consistent with Node.js** - Same pattern as the Node.js SDK
- ✅ **Easy to test** - SDK functions can be tested independently
- ✅ **Flexible** - Use as much or as little as you need

**This approach follows the same pattern as the Node.js SDK where agent ID and context are passed explicitly to functions rather than being extracted from headers.**