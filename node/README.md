# Agent Passport SDK - Node.js

Node.js SDK for the AI Agent Passport Registry, providing easy integration with agent authentication and verification.

## Installation

```bash
npm install @agent-passport/sdk-node
```

## Quick Start

### Basic Usage

```javascript
import { withAgentPassportId, verifyAgentPassport } from '@agent-passport/sdk-node';

// Wrap fetch to automatically include agent passport header
const agentId = 'ap_128094d34567890abcdef';
const fetchWithAgent = withAgentPassportId(agentId, fetch);

// Make authenticated requests
const response = await fetchWithAgent('https://api.example.com/data');
const data = await response.json();
```

### Environment Variable Usage

```javascript
import { withAgentPassportIdFromEnv } from '@agent-passport/sdk-node';

// Set environment variable
process.env.AGENT_PASSPORT_ID = 'ap_128094d34567890abcdef';

// Use wrapped fetch from environment
const fetchWithAgent = withAgentPassportIdFromEnv(fetch);
if (fetchWithAgent) {
  const response = await fetchWithAgent('https://api.example.com/data');
}
```

### Agent Verification

```javascript
import { verifyAgentPassport, hasPermission, isAllowedInRegion } from '@agent-passport/sdk-node';

try {
  // Verify agent passport
  const agent = await verifyAgentPassport('ap_128094d34567890abcdef');
  
  // Check permissions
  if (hasPermission(agent, 'read:data')) {
    console.log('Agent can read data');
  }
  
  // Check regional access
  if (isAllowedInRegion(agent, 'us-east-1')) {
    console.log('Agent is allowed in us-east-1');
  }
} catch (error) {
  console.error('Verification failed:', error.message);
}
```

## API Reference

### `withAgentPassportId(agentId, fetchFn?)`

Wraps a fetch function to automatically include the `X-Agent-Passport-Id` header.

**Parameters:**
- `agentId` (string): The agent passport ID
- `fetchFn` (function, optional): The fetch function to wrap (defaults to global fetch)

**Returns:** A wrapped fetch function

**Example:**
```javascript
const fetchWithAgent = withAgentPassportId('ap_128094d34567890abcdef');
const response = await fetchWithAgent('https://api.example.com/data');
```

### `verifyAgentPassport(agentId, options?)`

Verifies an agent passport ID against the registry.

**Parameters:**
- `agentId` (string): The agent passport ID to verify
- `options` (object, optional): Verification options
  - `baseUrl` (string): Base URL of the passport registry (default: process.env.AGENT_PASSPORT_BASE_URL or 'https://passport-registry.com')
  - `cache` (boolean): Enable caching (default: true)
  - `timeout` (number): Request timeout in milliseconds (default: 5000)

**Returns:** Promise resolving to agent passport data

**Example:**
```javascript
const agent = await verifyAgentPassport('ap_128094d34567890abcdef', {
  baseUrl: 'https://my-registry.com',
  timeout: 10000
});
```

### `hasPermission(agent, permission)`

Checks if an agent has a specific permission.

**Parameters:**
- `agent` (AgentPassport): The agent passport data
- `permission` (string): The permission to check

**Returns:** boolean

**Example:**
```javascript
if (hasPermission(agent, 'read:data')) {
  // Agent has read permission
}
```

### `isAllowedInRegion(agent, region)`

Checks if an agent is allowed in a specific region.

**Parameters:**
- `agent` (AgentPassport): The agent passport data
- `region` (string): The region to check

**Returns:** boolean

**Example:**
```javascript
if (isAllowedInRegion(agent, 'us-east-1')) {
  // Agent is allowed in us-east-1
}
```

### `getAgentPassportId()`

Gets the current agent passport ID from environment variables.

**Returns:** string | undefined

**Example:**
```javascript
const agentId = getAgentPassportId();
if (agentId) {
  console.log('Agent ID:', agentId);
}
```

### `withAgentPassportIdFromEnv(fetchFn?)`

Creates a fetch function with the agent passport ID from environment variables.

**Parameters:**
- `fetchFn` (function, optional): The fetch function to wrap (defaults to global fetch)

**Returns:** A wrapped fetch function or undefined if AGENT_PASSPORT_ID is not set

**Example:**
```javascript
const fetchWithAgent = withAgentPassportIdFromEnv(fetch);
if (fetchWithAgent) {
  const response = await fetchWithAgent('https://api.example.com/data');
}
```

## Error Handling

The SDK throws `AgentPassportError` for various failure scenarios:

```javascript
import { AgentPassportError } from '@agent-passport/sdk-node';

try {
  const agent = await verifyAgentPassport('ap_invalid_id');
} catch (error) {
  if (error instanceof AgentPassportError) {
    console.error('Error code:', error.code);
    console.error('Status code:', error.statusCode);
    console.error('Agent ID:', error.agentId);
  }
}
```

## Configuration

### Environment Variables

- `AGENT_PASSPORT_ID`: The agent passport ID to use for requests
- `AGENT_PASSPORT_BASE_URL`: Base URL of the passport registry

### TypeScript Support

The SDK includes full TypeScript definitions:

```typescript
import { AgentPassport, VerificationOptions } from '@agent-passport/sdk-node';

const options: VerificationOptions = {
  baseUrl: 'https://my-registry.com',
  cache: true,
  timeout: 5000
};

const agent: AgentPassport = await verifyAgentPassport('ap_128094d34567890abcdef', options);
```

## License

MIT
