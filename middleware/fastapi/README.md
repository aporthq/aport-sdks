# Agent Passport Middleware - FastAPI

FastAPI middleware for The Passport for AI Agents verification and policy enforcement.

## Installation

```bash
pip install agent-passport-middleware-fastapi
```

## Getting Started

**Key Facts:**

- **Agent ID Required**: Every policy check needs an agent ID
- **Two Options**: Pass agent ID as function parameter (preferred) or use `X-Agent-Passport-Id` header
- **Resolution Priority**: Function parameter > Header > Fail with 401
- **Registry**: Defaults to `https://aport.io` (configurable)
- **Policies**: Choose from `finance.payment.refund.v1`, `data.export.create.v1`, `messaging.message.send.v1`, `code.repository.merge.v1`

| **Method** | **Agent ID Source** | **Security** | **Use Case** |
|------------|-------------------|--------------|--------------|
| **Explicit Parameter** | Function argument | ✅ Highest | Production, explicit control |
| **Header Fallback** | `X-Agent-Passport-Id` | ⚠️ Medium | Backward compatibility |
| **Global Middleware** | `X-Agent-Passport-Id` | ⚠️ Medium | All routes, same policy |

## Quick Start

### 1. Global Policy Enforcement

```python
from fastapi import FastAPI
from aporthq_middleware_fastapi import agent_passport_middleware, AgentPassportMiddlewareOptions

app = FastAPI()

# Enforce specific policy globally
app.add_middleware(
    agent_passport_middleware,
    options=AgentPassportMiddlewareOptions(
        policy_id="finance.payment.refund.v1",  # Enforces refunds policy
        fail_closed=True
    )
)

# All routes now require finance.payment.refund.v1 policy compliance
@app.post("/api/refunds")
async def process_refund(request: Request):
    # Policy already verified - safe to process
    body = await request.json()
    return {"success": True, "agent_id": request.state.agent.agent_id}
```

### 2. Route-Specific Policy Enforcement

```python
from aporthq_middleware_fastapi import require_policy, require_policy_with_context

AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"  # Your agent ID

# Explicit agent ID (preferred)
@app.post("/api/refunds")
async def process_refund(request: Request):
    # Policy verified with explicit agent ID
    return {"success": True}

# Add the policy middleware
app.middleware("http")(require_policy("finance.payment.refund.v1", AGENT_ID))

# Header fallback
@app.post("/api/export")
async def export_data(request: Request):
    # Policy verified via header
    return {"success": True}

# Add the policy middleware
app.middleware("http")(require_policy("data.export.create.v1"))  # Uses X-Agent-Passport-Id header
```

### 3. Multiple Policies

```python
# Different policies for different routes
app.middleware("http")(require_policy("finance.payment.refund.v1", AGENT_ID))
@app.post("/api/refunds")
async def refunds(request: Request):
    return {"message": "Refund processed"}

app.middleware("http")(require_policy("data.export.create.v1", AGENT_ID))
@app.post("/api/data/export")
async def export(request: Request):
    return {"message": "Export created"}

app.middleware("http")(require_policy("messaging.message.send.v1", AGENT_ID))
@app.post("/api/messages/send")
async def messaging(request: Request):
    return {"message": "Message sent"}
```

## API Reference

### `agent_passport_middleware(options)`

Global middleware that enforces a specific policy on all routes.

**Parameters:**

- `options.policy_id` (str): Policy ID to enforce (e.g., "finance.payment.refund.v1")
- `options.fail_closed` (bool): Fail if agent ID missing (default: True)
- `options.base_url` (str): Registry base URL (default: "https://aport.io")
- `options.timeout` (int): Request timeout in seconds (default: 5)

**Returns:** Middleware instance

### `require_policy(policy_id, agent_id=None)`

Route-specific middleware that enforces a specific policy.

**Parameters:**

- `policy_id` (str): Policy ID to enforce (e.g., "finance.payment.refund.v1")
- `agent_id` (str, optional): Explicit agent ID (preferred over header)

**Returns:** Middleware function

**Agent ID Resolution:**

1. Function parameter (if provided)
2. `X-Agent-Passport-Id` header (fallback)
3. Fail with 401 error (if neither provided)

### `require_policy_with_context(policy_id, context, agent_id=None)`

Route-specific middleware with custom context.

**Parameters:**

- `policy_id` (str): Policy ID to enforce
- `context` (dict): Custom context data
- `agent_id` (str, optional): Explicit agent ID

**Returns:** Middleware function

## Request Object

After successful policy verification, the request object contains:

```python
@app.post("/api/refunds")
async def process_refund(request: Request):
    # request.state.agent - Verified agent passport data
    print(request.state.agent.agent_id)        # "ap_a2d10232c6534523812423eec8a1425c45678"
    print(request.state.agent.assurance_level) # "L2"
    print(request.state.agent.capabilities)    # ["finance.payment.refund"]
    
    # request.state.policy_result - Policy evaluation result
    print(request.state.policy_result.evaluation.decision_id)
    print(request.state.policy_result.evaluation.remaining_daily_cap)
```

## Available Policies

### finance.payment.refund.v1

- **Capabilities:** `["finance.payment.refund"]`
- **Assurance:** L2 minimum
- **Fields:** `order_id`, `customer_id`, `amount_minor`, `currency`, `region`, `reason_code`, `idempotency_key`
- **Rules:** Currency support, region validation, reason code validation, idempotency handling

### data.export.create.v1

- **Capabilities:** `["data.export"]`
- **Assurance:** L1 minimum
- **Fields:** `rows`, `format`, `contains_pii`
- **Rules:** Row limits, PII handling

### messaging.message.send.v1

- **Capabilities:** `["messaging.send"]`
- **Assurance:** L1 minimum
- **Fields:** `channel`, `message_count`, `mentions`
- **Rules:** Rate limits, channel restrictions

### code.repository.merge.v1

- **Capabilities:** `["repo.pr.create", "repo.merge"]`
- **Assurance:** L2 minimum
- **Fields:** `repository`, `base_branch`, `pr_size_kb`
- **Rules:** Repository access, branch protection, PR size limits

## Error Handling

The middleware returns appropriate HTTP status codes:

```python
# 401 - Missing or invalid agent ID
{
    "error": "missing_agent_id",
    "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header."
}

# 403 - Policy violation
{
    "error": "policy_violation",
    "message": "Policy violation",
    "agent_id": "ap_a2d10232c6534523812423eec8a1425c45678",
    "policy_id": "finance.payment.refund.v1"
}

# 400 - Field validation failed
{
    "error": "field_validation_failed",
    "message": "Field validation failed: Required field 'order_id' is missing"
}
```

## Configuration

### Environment Variables

```bash
# Registry base URL (optional)
AGENT_PASSPORT_BASE_URL=https://aport.io

# Default agent ID for development (optional)
AGENT_PASSPORT_AGENT_ID=ap_a2d10232c6534523812423eec8a1425c45678
```

### Skip Paths

```python
app.add_middleware(
    agent_passport_middleware,
    options=AgentPassportMiddlewareOptions(
        policy_id="finance.payment.refund.v1",
        skip_paths=["/health", "/metrics", "/status"]
    )
)
```

## Examples

### E-commerce Refund System

```python
from fastapi import FastAPI, Request
from aporthq_middleware_fastapi import require_policy

app = FastAPI()

AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"

# Refund processing with policy enforcement
app.middleware("http")(require_policy("finance.payment.refund.v1", AGENT_ID))

@app.post("/api/refunds")
async def process_refund(request: Request):
    body = await request.json()
    amount = body.get("amount")
    currency = body.get("currency")
    order_id = body.get("order_id")
    
    # Policy already verified - safe to process
    return {
        "success": True,
        "refund_id": f"ref_{int(time.time() * 1000)}",
        "amount": amount,
        "currency": currency,
        "order_id": order_id,
        "agent_id": request.state.agent.agent_id
    }
```

### Data Export System

```python
# Data export with policy enforcement
app.middleware("http")(require_policy("data.export.create.v1", AGENT_ID))

@app.post("/api/data/export")
async def export_data(request: Request):
    body = await request.json()
    rows = body.get("rows")
    format = body.get("format")
    contains_pii = body.get("contains_pii")
    
    # Policy verified - safe to export
    return {
        "success": True,
        "export_id": f"exp_{int(time.time() * 1000)}",
        "rows": rows,
        "format": format,
        "contains_pii": contains_pii,
        "agent_id": request.state.agent.agent_id
    }
```

### Messaging System

```python
# Messaging with policy enforcement
app.middleware("http")(require_policy("messaging.message.send.v1", AGENT_ID))

@app.post("/api/messages/send")
async def send_message(request: Request):
    body = await request.json()
    channel = body.get("channel")
    message_count = body.get("message_count")
    mentions = body.get("mentions")
    
    # Policy verified - safe to send
    return {
        "success": True,
        "message_id": f"msg_{int(time.time() * 1000)}",
        "channel": channel,
        "message_count": message_count,
        "mentions": mentions,
        "agent_id": request.state.agent.agent_id
    }
```

## License

MIT

---

**Last Updated**: 2025-01-16 00:00:00 UTC