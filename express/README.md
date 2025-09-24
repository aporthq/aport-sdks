# Agent Passport Middleware - Express.js

Express.js middleware for AI Agent Passport Registry verification and authorization.

## Installation

```bash
npm install @agent-passport/middleware-express
```

## Quick Start

### Basic Usage

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@agent-passport/middleware-express');

const app = express();

// Add middleware
app.use(agentPassportMiddleware());

// Your routes
app.get('/api/data', (req, res) => {
  // req.agent contains the verified agent passport
  res.json({ 
    message: 'Hello from agent',
    agent_id: req.agent.agent_id 
  });
});

app.listen(3000);
```

### With Configuration

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@agent-passport/middleware-express');

const app = express();

app.use(agentPassportMiddleware({
  baseUrl: 'https://my-registry.com',
  failClosed: true,
  requiredPermissions: ['read:data'],
  allowedRegions: ['us-east-1', 'eu-west-1'],
  skipPaths: ['/health', '/metrics'],
  capabilityEnforcement: {
    enforceOnAllRoutes: true,
    skipRoutes: ['/public', '/health'],
    allowUnmappedRoutes: false,
    customMappings: {
      '/api/custom': ['data.export']
    }
  }
}));

app.get('/api/data', (req, res) => {
  res.json({ data: 'sensitive data' });
});

app.listen(3000);
```

## API Reference

### `agentPassportMiddleware(options)`

Creates Express.js middleware for agent passport verification.

**Parameters:**
- `options` (object, optional): Middleware configuration
  - `baseUrl` (string): Base URL of the passport registry
  - `timeout` (number): Request timeout in milliseconds (default: 5000)
  - `cache` (boolean): Enable caching (default: true)
  - `failClosed` (boolean): Fail closed when agent ID is missing (default: true)
  - `requiredPermissions` (string[]): Required permissions for all requests
  - `allowedRegions` (string[]): Allowed regions for all requests
  - `skipPaths` (string[]): Paths to skip verification
  - `skipMethods` (string[]): HTTP methods to skip verification (default: ['OPTIONS'])

**Returns:** Express middleware function

### Helper Functions

#### `hasAgentPermission(req, permission)`

Check if the agent has a specific permission.

**Parameters:**
- `req` (Request): Express request object
- `permission` (string): Permission to check

**Returns:** boolean

#### `isAgentAllowedInRegion(req, region)`

Check if the agent is allowed in a specific region.

**Parameters:**
- `req` (Request): Express request object
- `region` (string): Region to check

**Returns:** boolean

#### `getAgent(req)`

Get the agent passport data from the request.

**Parameters:**
- `req` (Request): Express request object

**Returns:** AgentPassport object or undefined

#### `hasAgent(req)`

Check if the request has an agent.

**Parameters:**
- `req` (Request): Express request object

**Returns:** boolean

#### `hasAgentCapability(req, capabilityId)`

Check if the agent has a specific capability.

**Parameters:**
- `req` (Request): Express request object
- `capabilityId` (string): Capability ID to check

**Returns:** boolean

#### `hasRequiredCapabilities(req, route)`

Check if the agent has all required capabilities for a route.

**Parameters:**
- `req` (Request): Express request object
- `route` (string): Route path to check

**Returns:** boolean

## Configuration Options

### Basic Configuration

```javascript
app.use(agentPassportMiddleware({
  baseUrl: 'https://my-registry.com',
  timeout: 10000,
  cache: true
}));
```

### Security Configuration

```javascript
app.use(agentPassportMiddleware({
  failClosed: true,  // Require agent ID for all requests
  requiredPermissions: ['read:data', 'write:logs'],
  allowedRegions: ['us-east-1', 'eu-west-1']
}));
```

### Capability Enforcement

The middleware automatically enforces capability requirements based on route patterns:

```javascript
app.use(agentPassportMiddleware({
  capabilityEnforcement: {
    enforceOnAllRoutes: true,        // Enforce capabilities on all routes
    skipRoutes: ['/public', '/health'], // Routes to skip capability checks
    allowUnmappedRoutes: false,      // Deny access to unmapped routes
    customMappings: {                // Custom route to capability mappings
      '/api/custom': ['data.export'],
      '/api/admin': ['identity.manage_roles']
    }
  }
}));
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

### Selective Verification

```javascript
app.use(agentPassportMiddleware({
  skipPaths: ['/health', '/metrics', '/public'],
  skipMethods: ['OPTIONS', 'HEAD']
}));
```

## Examples

### Public and Private Routes

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@agent-passport/middleware-express');

const app = express();

// Public routes (no verification)
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/public', (req, res) => res.json({ message: 'public data' }));

// Private routes (with verification)
app.use(agentPassportMiddleware({
  skipPaths: ['/health', '/public']
}));

app.get('/api/data', (req, res) => {
  res.json({ 
    data: 'sensitive data',
    agent: req.agent.agent_id 
  });
});
```

### Permission-Based Access

```javascript
const express = require('express');
const { agentPassportMiddleware, hasAgentPermission } = require('@agent-passport/middleware-express');

const app = express();

app.use(agentPassportMiddleware());

// Read-only endpoint
app.get('/api/data', (req, res) => {
  res.json({ data: 'read-only data' });
});

// Write endpoint with permission check
app.post('/api/data', (req, res) => {
  if (!hasAgentPermission(req, 'write:data')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  res.json({ message: 'Data written successfully' });
});
```

### Regional Access Control

```javascript
const express = require('express');
const { agentPassportMiddleware, isAgentAllowedInRegion } = require('@agent-passport/middleware-express');

const app = express();

app.use(agentPassportMiddleware());

app.get('/api/data', (req, res) => {
  if (!isAgentAllowedInRegion(req, 'us-east-1')) {
    return res.status(403).json({ error: 'Access denied in this region' });
  }
  
  res.json({ data: 'US East data' });
});
```

### Error Handling

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@agent-passport/middleware-express');

const app = express();

app.use(agentPassportMiddleware({
  failClosed: true
}));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.message.includes('Agent Passport')) {
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: err.message 
    });
  }
  next(err);
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'protected data' });
});
```

## TypeScript Support

```typescript
import express, { Request, Response } from 'express';
import { 
  agentPassportMiddleware, 
  AgentRequest, 
  hasAgentPermission 
} from '@agent-passport/middleware-express';

const app = express();

app.use(agentPassportMiddleware());

app.get('/api/data', (req: AgentRequest, res: Response) => {
  if (hasAgentPermission(req, 'read:data')) {
    res.json({ data: 'sensitive data' });
  } else {
    res.status(403).json({ error: 'Insufficient permissions' });
  }
});
```

## MCP (Model Context Protocol) Support

The middleware includes support for MCP header validation and allowlist enforcement.

### Basic MCP Enforcement

```javascript
const { 
  agentPassportMiddleware, 
  mcpEnforcementMiddleware 
} = require('@agent-passport/middleware-express');

app.use(agentPassportMiddleware());
app.use(mcpEnforcementMiddleware());

app.post('/api/refund', (req, res) => {
  // req.mcp contains extracted MCP headers
  console.log('MCP Server:', req.mcp.server);
  console.log('MCP Tool:', req.mcp.tool);
  console.log('MCP Session:', req.mcp.session);
  
  res.json({ success: true });
});
```

### MCP Headers

The middleware extracts and validates these MCP headers:

- `X-MCP-Server`: MCP server identifier (e.g., `https://mcp.stripe.com`)
- `X-MCP-Tool`: MCP tool identifier (e.g., `stripe.refunds.create`)
- `X-MCP-Session`: MCP session identifier for tracking

### MCP Policy Enforcement

Use policy-aware MCP enforcement for specific policy packs:

```javascript
const { createMCPAwarePolicyMiddleware } = require('@agent-passport/middleware-express');

// Enforce refunds.v1 policy with MCP checks
app.use('/api/refunds/*', createMCPAwarePolicyMiddleware('refunds.v1'));

// Enforce data_export.v1 policy with MCP checks  
app.use('/api/export/*', createMCPAwarePolicyMiddleware('data_export.v1'));
```

### MCP Configuration

```javascript
app.use(mcpEnforcementMiddleware({
  enabled: true,
  strictMode: true,  // Return 403 on violations
  logViolations: true  // Log violations for monitoring
}));
```

### MCP Helper Functions

```javascript
const { 
  extractMCPHeaders,
  isMCPServerAllowed,
  isMCPToolAllowed,
  validateMCPHeaders
} = require('@agent-passport/middleware-express');

app.post('/api/custom', (req, res) => {
  const mcpHeaders = extractMCPHeaders(req);
  
  if (mcpHeaders.server && !isMCPServerAllowed(mcpHeaders.server, req.agent)) {
    return res.status(403).json({
      error: 'mcp_denied',
      reason: 'server_not_allowlisted',
      server: mcpHeaders.server
    });
  }
  
  res.json({ success: true });
});
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

## Error Responses

The middleware returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Missing agent ID when failClosed is true
- `401 Unauthorized`: Agent verification failed
- `403 Forbidden`: Insufficient permissions or region not allowed
- `500 Internal Server Error`: Unexpected errors

## License

MIT

---
**Last Updated**: 2025-09-24 23:02:26 UTC
