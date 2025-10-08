# Agent Passport SDKs and Middleware

This directory contains SDKs and middleware for integrating with The Passport for AI Agents across different platforms and programming languages.

## 📦 Available Packages

### Node.js SDK
- **Package**: `@agent-passport/sdk-node`
- **Location**: `./node/`
- **Description**: Node.js SDK with fetch wrapper and verification utilities

### Python SDK
- **Package**: `agent-passport-sdk`
- **Location**: `./python/`
- **Description**: Python SDK with requests session and verification utilities

### Express.js Middleware
- **Package**: `@agent-passport/middleware-express`
- **Location**: `./middleware/express/`
- **Description**: Express.js middleware for automatic agent verification

### FastAPI Middleware
- **Package**: `agent-passport-middleware-fastapi`
- **Location**: `./middleware/fastapi/`
- **Description**: FastAPI middleware for automatic agent verification

## 🚀 Quick Start

### Node.js

```bash
npm install @agent-passport/sdk-node
```

```javascript
import { withAgentPassportId, verifyAgentPassport } from '@agent-passport/sdk-node';

// Wrap fetch to automatically include agent passport header
const fetchWithAgent = withAgentPassportId('ap_a2d10232c6534523812423eec8a1425c4567890abcdef');
const response = await fetchWithAgent('https://api.example.com/data');

// Verify agent passport
const agent = await verifyAgentPassport('ap_a2d10232c6534523812423eec8a1425c4567890abcdef');
```

### Python

```bash
pip install agent-passport-sdk
```

```python
from agent_passport import agent_session, AgentPassportClient

# Use agent session for automatic header injection
with agent_session('ap_a2d10232c6534523812423eec8a1425c4567890abcdef') as session:
    response = session.get('https://api.example.com/data')

# Or use client for verification
client = AgentPassportClient()
agent = client.verify_agent_passport('ap_a2d10232c6534523812423eec8a1425c4567890abcdef')
```

### Express.js Middleware

```bash
npm install @agent-passport/middleware-express
```

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@agent-passport/middleware-express');

const app = express();
app.use(agentPassportMiddleware());

app.get('/api/data', (req, res) => {
  res.json({ agent_id: req.agent.agent_id });
});
```

### FastAPI Middleware

```bash
pip install agent-passport-middleware-fastapi
```

```python
from fastapi import FastAPI, Request
from agent_passport_middleware import agent_passport_middleware

app = FastAPI()
app.add_middleware(agent_passport_middleware())

@app.get("/api/data")
async def get_data(request: Request):
    return {"agent_id": request.state.agent.agent_id}
```

## 🔧 Features

### SDK Features
- **Automatic Header Injection**: Automatically add `X-Agent-Passport-Id` header to requests
- **Agent Verification**: Verify agent passports against the registry
- **Permission Checking**: Check if agents have specific permissions
- **Regional Access Control**: Verify agents are allowed in specific regions
- **Caching**: Built-in caching for verification results
- **Error Handling**: Comprehensive error handling with custom exceptions
- **TypeScript Support**: Full TypeScript definitions for Node.js SDK

### Middleware Features
- **Automatic Verification**: Automatically verify agent passports on requests
- **Permission Enforcement**: Enforce required permissions for routes
- **Regional Access Control**: Restrict access based on agent regions
- **Configurable**: Flexible configuration options
- **Selective Application**: Skip verification for specific paths/methods
- **Error Handling**: Proper HTTP status codes and error messages

## 📋 Transport Profile

All SDKs and middleware implement the [Transport Profile Specification](../spec/transport-profile.md):

### HTTP/Webhooks
```
X-Agent-Passport-Id: <agent_id>
```

### gRPC
```
x-agent-passport-id: <agent_id>
```

### WebSocket/SSE
```
ws://api.example.com/stream?agent_id=ap_a2d10232c6534523812423eec8a1425c4567890abcdef
```

### Message Queues
```json
{
  "MessageAttributes": {
    "agent_id": {
      "StringValue": "ap_a2d10232c6534523812423eec8a1425c4567890abcdef",
      "DataType": "String"
    }
  }
}
```

### Environment Variables
```bash
export AGENT_PASSPORT_ID=ap_a2d10232c6534523812423eec8a1425c4567890abcdef
```

## 🛠️ Development

### Building SDKs

```bash
# Node.js SDK
cd node/
npm install
npm run build
npm test

# Python SDK
cd python/
pip install -e ".[dev]"
pytest
```

### Building Middleware

```bash
# Express.js Middleware
cd middleware/express/
npm install
npm run build
npm test

# FastAPI Middleware
cd middleware/fastapi/
pip install -e ".[dev]"
pytest
```

## 📚 Documentation

- [Transport Profile Specification](../spec/transport-profile.md) - Complete transport specification
- [Node.js SDK Documentation](./node/README.md) - Node.js SDK documentation
- [Python SDK Documentation](./python/README.md) - Python SDK documentation
- [Express.js Middleware Documentation](./middleware/express/README.md) - Express.js middleware documentation
- [FastAPI Middleware Documentation](./middleware/fastapi/README.md) - FastAPI middleware documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License
MIT


---
**Last Updated**: 2025-10-08 14:54:16 UTC
