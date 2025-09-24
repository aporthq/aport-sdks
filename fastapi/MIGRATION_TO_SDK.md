# Migration to SDK-Based Architecture

This document describes the migration of FastAPI middleware functionality to the Agent Passport SDK, making the enforcement capabilities framework-agnostic.

## Overview

The Agent Passport enforcement functionality has been moved from FastAPI-specific middleware to the Python SDK (`sdk/python/src/agent_passport/`). This allows any Python application to use these capabilities, not just FastAPI applications.

## What Was Moved

The following modules were moved from `middleware/fastapi/src/agent_passport_middleware/` to `sdk/python/src/agent_passport/`:

1. **`assurance_enforcement.py`** → `sdk/python/src/agent_passport/assurance_enforcement.py`
2. **`capability_routes.py`** → `sdk/python/src/agent_passport/capability_enforcement.py`
3. **`limits_enforcement.py`** → `sdk/python/src/agent_passport/limits_enforcement.py`
4. **`mcp_enforcement.py`** → `sdk/python/src/agent_passport/mcp_enforcement.py`
5. **`policy_enforcement.py`** → `sdk/python/src/agent_passport/policy_enforcement.py`
6. **`region_validation.py`** → `sdk/python/src/agent_passport/region_validation.py`

## Key Changes

### 1. Framework-Agnostic Design

The SDK modules are now framework-agnostic and can be used in any Python application:

```python
from agent_passport import (
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

# Use in any Python application
assurance_check = check_assurance_requirement(
    agent_assurance_level="L2",
    path="/api/payments/refund",
    config=AssuranceEnforcementConfig()
)
```

### 2. New FastAPI Middleware

A new FastAPI middleware (`AgentPassportMiddlewareV2`) has been created that uses the SDK modules:

```python
from agent_passport_middleware import AgentPassportMiddlewareV2, agent_passport_middleware_v2

# Option 1: Direct middleware class
app.add_middleware(AgentPassportMiddlewareV2)

# Option 2: Middleware factory function
middleware = agent_passport_middleware_v2()
app.add_middleware(middleware)
```

### 3. Backward Compatibility

The original FastAPI middleware is still available for backward compatibility:

```python
from agent_passport_middleware import (
    AgentPassportMiddleware,  # Original middleware
    AgentPassportMiddlewareV2,  # New SDK-based middleware
    agent_passport_middleware,  # Original factory
    agent_passport_middleware_v2,  # New factory
)
```

## Usage Examples

### Direct SDK Usage (Any Python Application)

```python
from agent_passport import (
    check_assurance_requirement,
    check_capability_requirement,
    check_limits_for_operation,
    AssuranceEnforcementConfig,
    CapabilityEnforcementConfig,
    LimitsEnforcementConfig,
)

# Check assurance requirements
assurance_config = AssuranceEnforcementConfig()
result = check_assurance_requirement(
    agent_assurance_level="L2",
    path="/api/payments/refund",
    config=assurance_config
)

if not result["allowed"]:
    print(f"Assurance check failed: {result['reason']}")
```

### FastAPI Middleware Usage

```python
from fastapi import FastAPI
from agent_passport_middleware import AgentPassportMiddlewareV2

app = FastAPI()
app.add_middleware(AgentPassportMiddlewareV2)

@app.get("/protected")
async def protected_endpoint(request: Request):
    agent = getattr(request.state, 'agent', None)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent passport required")
    
    return {"agent_id": agent.agent_id}
```

### Flask Usage (Example)

```python
from flask import Flask, request, jsonify
from agent_passport import check_assurance_requirement, AssuranceEnforcementConfig

app = Flask(__name__)

@app.before_request
def check_agent_passport():
    # Extract agent ID from headers
    agent_id = request.headers.get('X-Agent-Passport-Id')
    if not agent_id:
        return jsonify({"error": "Missing agent passport"}), 401
    
    # Verify agent passport (you'd implement this)
    agent = verify_agent_passport(agent_id)
    
    # Check assurance requirements
    assurance_config = AssuranceEnforcementConfig()
    result = check_assurance_requirement(
        agent.assurance_level,
        request.path,
        assurance_config
    )
    
    if not result["allowed"]:
        return jsonify({"error": "Insufficient assurance"}), 403
    
    # Attach agent to request context
    request.agent = agent
```

## Benefits

1. **Framework Agnostic**: SDK modules can be used in any Python framework (FastAPI, Flask, Django, etc.)
2. **Reusable**: Core enforcement logic is centralized and reusable
3. **Testable**: SDK modules can be easily unit tested independently
4. **Maintainable**: Single source of truth for enforcement logic
5. **Extensible**: Easy to add new enforcement capabilities

## Migration Guide

### For Existing FastAPI Applications

1. **No immediate action required** - the original middleware still works
2. **Gradual migration** - switch to `AgentPassportMiddlewareV2` when convenient
3. **Direct SDK usage** - use SDK modules directly for custom logic

### For New Applications

1. **Use the SDK directly** for maximum flexibility
2. **Use `AgentPassportMiddlewareV2`** for FastAPI applications
3. **Import from `agent_passport`** instead of `agent_passport_middleware` for core functionality

## File Structure

```
sdk/python/src/agent_passport/
├── __init__.py                    # Exports all SDK modules
├── client.py                      # Core client functionality
├── session.py                     # Session management
├── types.py                       # Type definitions
├── exceptions.py                  # Exception classes
├── shared_types.py                # Shared type definitions
├── assurance_enforcement.py       # Assurance level enforcement
├── capability_enforcement.py      # Capability-based enforcement
├── limits_enforcement.py          # Limits enforcement
├── mcp_enforcement.py             # MCP enforcement
├── policy_enforcement.py          # Policy enforcement
└── region_validation.py           # Region validation

middleware/fastapi/src/agent_passport_middleware/
├── __init__.py                    # Re-exports SDK + FastAPI middleware
├── middleware.py                  # Original FastAPI middleware
├── middleware_v2.py               # New SDK-based FastAPI middleware
├── types.py                       # FastAPI-specific types
└── [legacy modules]               # Original middleware modules (for compatibility)
```

## Next Steps

1. **Update documentation** to reflect the new architecture
2. **Create examples** for other frameworks (Flask, Django, etc.)
3. **Add tests** for the SDK modules
4. **Consider deprecating** the original middleware modules in a future version
5. **Create migration tools** to help users transition
