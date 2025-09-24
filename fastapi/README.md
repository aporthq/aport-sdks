# Agent Passport Middleware - FastAPI

FastAPI middleware for AI Agent Passport Registry verification and authorization.

## Installation

```bash
pip install agent-passport-middleware-fastapi
```

## Quick Start

### Basic Usage

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import agent_passport_middleware

app = FastAPI()

# Add middleware
app.add_middleware(agent_passport_middleware())

@app.get("/api/data")
async def get_data(request: Request):
    # request.state.agent contains the verified agent passport
    return {
        "message": "Hello from agent",
        "agent_id": request.state.agent.agent_id
    }
```

### With Configuration

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import (
    agent_passport_middleware,
    AgentPassportMiddlewareOptions
)

app = FastAPI()

# Configure middleware
from agent_passport_middleware.capability_routes import CapabilityEnforcementConfig

options = AgentPassportMiddlewareOptions(
    base_url="https://my-registry.com",
    fail_closed=True,
    required_permissions=["read:data"],
    allowed_regions=["us-east-1", "eu-west-1"],
    skip_paths=["/health", "/metrics"],
    capability_enforcement=CapabilityEnforcementConfig(
        enforce_on_all_routes=True,
        skip_routes=["/public", "/health"],
        allow_unmapped_routes=False,
        custom_mappings={
            "/api/custom": ["data.export"],
            "/api/admin": ["identity.manage_roles"]
        }
    )
)

app.add_middleware(agent_passport_middleware(options))

@app.get("/api/data")
async def get_data(request: Request):
    return {"data": "sensitive data"}
```

## API Reference

### `agent_passport_middleware(options)`

Creates FastAPI middleware for agent passport verification.

**Parameters:**
- `options` (AgentPassportMiddlewareOptions, optional): Middleware configuration

**Returns:** Middleware factory function

### `AgentPassportMiddlewareOptions`

Configuration options for the middleware.

**Parameters:**
- `base_url` (str, optional): Base URL of the passport registry
- `timeout` (int): Request timeout in seconds (default: 5)
- `cache` (bool): Enable caching (default: True)
- `fail_closed` (bool): Fail closed when agent ID is missing (default: True)
- `required_permissions` (List[str]): Required permissions for all requests
- `allowed_regions` (List[str]): Allowed regions for all requests
- `skip_paths` (List[str]): Paths to skip verification
- `skip_methods` (List[str]): HTTP methods to skip verification (default: ['OPTIONS'])
- `capability_enforcement` (CapabilityEnforcementConfig): Capability enforcement configuration

### Capability Enforcement

The middleware automatically enforces capability requirements based on route patterns:

```python
from agent_passport_middleware.capability_routes import CapabilityEnforcementConfig

options = AgentPassportMiddlewareOptions(
    capability_enforcement=CapabilityEnforcementConfig(
        enforce_on_all_routes=True,        # Enforce capabilities on all routes
        skip_routes=["/public", "/health"], # Routes to skip capability checks
        allow_unmapped_routes=False,       # Deny access to unmapped routes
        custom_mappings={                  # Custom route to capability mappings
            "/api/custom": ["data.export"],
            "/api/admin": ["identity.manage_roles"]
        }
    )
)
```

**Pre-configured Route Mappings:**
- `/api/payments/refund` → `payments.refund`
- `/api/payments/payout` → `payments.payout`
- `/api/returns/*` → `returns.process`
- `/api/inventory/*` → `inventory.adjust`
- `/api/data/export` → `data.export`
- `/api/data/delete` → `data.delete`
- `/api/identity/roles` → `identity.manage_roles`
- `/api/messages/*` → `messaging.send`
- `/api/crm/*` → `crm.update`
- `/api/repo/merge` → `repo.merge`
- `/api/deploy/*` → `infra.deploy`

### Helper Functions

#### `has_agent_permission(request, permission)`

Check if the agent has a specific permission.

**Parameters:**
- `request` (Request): FastAPI request object
- `permission` (str): Permission to check

**Returns:** bool

#### `is_agent_allowed_in_region(request, region)`

Check if the agent is allowed in a specific region.

**Parameters:**
- `request` (Request): FastAPI request object
- `region` (str): Region to check

**Returns:** bool

#### `get_agent(request)`

Get the agent passport data from the request.

**Parameters:**
- `request` (Request): FastAPI request object

**Returns:** AgentPassport object or None

#### `has_agent(request)`

Check if the request has an agent.

**Parameters:**
- `request` (Request): FastAPI request object

**Returns:** bool

## Configuration Options

### Basic Configuration

```python
from agent_passport_middleware import agent_passport_middleware, AgentPassportMiddlewareOptions

options = AgentPassportMiddlewareOptions(
    base_url="https://my-registry.com",
    timeout=10,
    cache=True
)

app.add_middleware(agent_passport_middleware(options))
```

### Security Configuration

```python
options = AgentPassportMiddlewareOptions(
    fail_closed=True,  # Require agent ID for all requests
    required_permissions=["read:data", "write:logs"],
    allowed_regions=["us-east-1", "eu-west-1"]
)

app.add_middleware(agent_passport_middleware(options))
```

### Selective Verification

```python
options = AgentPassportMiddlewareOptions(
    skip_paths=["/health", "/metrics", "/public"],
    skip_methods=["OPTIONS", "HEAD"]
)

app.add_middleware(agent_passport_middleware(options))
```

## Examples

### Public and Private Routes

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import agent_passport_middleware, AgentPassportMiddlewareOptions

app = FastAPI()

# Public routes (no verification)
@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/public")
async def public_data():
    return {"message": "public data"}

# Private routes (with verification)
options = AgentPassportMiddlewareOptions(skip_paths=["/health", "/public"])
app.add_middleware(agent_passport_middleware(options))

@app.get("/api/data")
async def get_data(request: Request):
    return {
        "data": "sensitive data",
        "agent": request.state.agent.agent_id
    }
```

### Permission-Based Access

```python
from fastapi import FastAPI, Request, HTTPException
from agent_passport_middleware import (
    agent_passport_middleware,
    has_agent_permission
)

app = FastAPI()
app.add_middleware(agent_passport_middleware())

# Read-only endpoint
@app.get("/api/data")
async def get_data(request: Request):
    return {"data": "read-only data"}

# Write endpoint with permission check
@app.post("/api/data")
async def create_data(request: Request):
    if not has_agent_permission(request, "write:data"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    return {"message": "Data created successfully"}
```

### Regional Access Control

```python
from fastapi import FastAPI, Request, HTTPException
from agent_passport_middleware import (
    agent_passport_middleware,
    is_agent_allowed_in_region
)

app = FastAPI()
app.add_middleware(agent_passport_middleware())

@app.get("/api/data")
async def get_data(request: Request):
    if not is_agent_allowed_in_region(request, "us-east-1"):
        raise HTTPException(status_code=403, detail="Access denied in this region")
    
    return {"data": "US East data"}
```

### Error Handling

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from agent_passport_middleware import agent_passport_middleware, AgentPassportMiddlewareOptions

app = FastAPI()

# Configure middleware with error handling
options = AgentPassportMiddlewareOptions(fail_closed=True)
app.add_middleware(agent_passport_middleware(options))

# Custom error handler
@app.exception_handler(HTTPException)
async def agent_passport_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == 400 and "agent" in str(exc.detail):
        return JSONResponse(
            status_code=401,
            content={"error": "Authentication failed", "message": str(exc.detail)}
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.get("/api/data")
async def get_data(request: Request):
    return {"data": "protected data"}
```

### Dependency Injection

```python
from fastapi import FastAPI, Request, Depends, HTTPException
from agent_passport_middleware import agent_passport_middleware, get_agent, has_agent_permission

app = FastAPI()
app.add_middleware(agent_passport_middleware())

def require_agent(request: Request):
    """Dependency to require agent authentication."""
    agent = get_agent(request)
    if not agent:
        raise HTTPException(status_code=401, detail="Agent authentication required")
    return agent

def require_permission(permission: str):
    """Dependency factory for permission requirements."""
    def permission_checker(request: Request):
        if not has_agent_permission(request, permission):
            raise HTTPException(status_code=403, detail=f"Permission {permission} required")
        return True
    return permission_checker

@app.get("/api/data")
async def get_data(agent=Depends(require_agent)):
    return {"data": "sensitive data", "agent_id": agent.agent_id}

@app.post("/api/data")
async def create_data(
    request: Request,
    agent=Depends(require_agent),
    _=Depends(require_permission("write:data"))
):
    return {"message": "Data created", "agent_id": agent.agent_id}
```

## Error Responses

The middleware returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Missing agent ID when fail_closed is True
- `401 Unauthorized`: Agent verification failed
- `403 Forbidden`: Insufficient permissions or region not allowed
- `500 Internal Server Error`: Unexpected errors

## TypeScript Support

The middleware is designed to work with FastAPI's type system:

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import agent_passport_middleware, get_agent
from agent_passport import AgentPassport

app = FastAPI()
app.add_middleware(agent_passport_middleware())

@app.get("/api/data")
async def get_data(request: Request) -> dict:
    agent: AgentPassport = get_agent(request)
    if agent and has_agent_permission(request, "read:data"):
        return {"data": "sensitive data"}
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
```

## Development

### Running Tests

```bash
pip install -e ".[dev]"
pytest
```

### Code Formatting

```bash
black src/
isort src/
```

### Type Checking

```bash
mypy src/
```

## MCP (Model Context Protocol) Support

The middleware includes support for MCP header validation and allowlist enforcement.

### Basic MCP Enforcement

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import (
    AgentPassportMiddleware,
    MCPEnforcementMiddleware,
    AgentPassportMiddlewareOptions
)

app = FastAPI()

# Add agent passport middleware first
options = AgentPassportMiddlewareOptions()
app.add_middleware(AgentPassportMiddleware, options=options)

# Add MCP enforcement middleware
app.add_middleware(MCPEnforcementMiddleware)

@app.post("/api/refund")
async def process_refund(request: Request):
    # request.state.mcp contains extracted MCP headers
    mcp = request.state.mcp
    print(f"MCP Server: {mcp.server}")
    print(f"MCP Tool: {mcp.tool}")
    print(f"MCP Session: {mcp.session}")
    
    return {"success": True}
```

### MCP Headers

The middleware extracts and validates these MCP headers:

- `X-MCP-Server`: MCP server identifier (e.g., `https://mcp.stripe.com`)
- `X-MCP-Tool`: MCP tool identifier (e.g., `stripe.refunds.create`)
- `X-MCP-Session`: MCP session identifier for tracking

### MCP Policy Enforcement

Use policy-aware MCP enforcement for specific policy packs:

```python
from agent_passport_middleware import create_mcp_aware_policy_middleware

# Create policy-aware middleware
refunds_middleware = create_mcp_aware_policy_middleware('refunds.v1')
export_middleware = create_mcp_aware_policy_middleware('data_export.v1')

# Apply to specific routes
@app.middleware("http")
async def refunds_policy_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/refunds/"):
        return await refunds_middleware(request, call_next)
    return await call_next(request)
```

### MCP Configuration

```python
from agent_passport_middleware import MCPEnforcementConfig, MCPEnforcementMiddleware

config = MCPEnforcementConfig(
    enabled=True,
    strict_mode=True,  # Return 403 on violations
    log_violations=True  # Log violations for monitoring
)

app.add_middleware(MCPEnforcementMiddleware, config=config)
```

### MCP Helper Functions

```python
from agent_passport_middleware import (
    extract_mcp_headers,
    is_mcp_server_allowed,
    is_mcp_tool_allowed,
    validate_mcp_headers,
    get_mcp_headers,
    has_mcp_headers
)

@app.post("/api/custom")
async def custom_endpoint(request: Request):
    mcp_headers = extract_mcp_headers(request)
    
    if mcp_headers.server and not is_mcp_server_allowed(mcp_headers.server, request.state.agent):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "mcp_denied",
                "reason": "server_not_allowlisted",
                "server": mcp_headers.server
            }
        )
    
    return {"success": True}

# Or use convenience functions
@app.get("/api/check-mcp")
async def check_mcp(request: Request):
    if has_mcp_headers(request):
        mcp = get_mcp_headers(request)
        return {"mcp": mcp.to_dict()}
    return {"mcp": None}
```

### MCP Error Responses

MCP enforcement returns these error responses:

- `403 Forbidden`: MCP server or tool not allowlisted
  ```json
  {
    "error": "mcp_denied",
    "reason": "server_not_allowlisted",
    "server": "https://unauthorized-server.com"
  }
  ```
  ```json
  {
    "error": "mcp_denied", 
    "reason": "tool_not_allowlisted",
    "tool": "unauthorized.tool.action"
  }
  ```

## License

MIT
