# APort SDK

Official SDK for APort agent verification and policy enforcement.

## 📦 Packages

- **Node.js** - `@aport/sdk-node` - TypeScript/JavaScript SDK
- **Python** - `aport-sdk` - Python SDK with type hints
- **Express Middleware** - `@aport/express-middleware` - Express.js integration
- **FastAPI Middleware** - `aport-fastapi-middleware` - FastAPI integration

## 🚀 Quick Start

### Node.js
```bash
pnpm install @aport/sdk-node
```

```typescript
import { APortClient } from '@aport/sdk-node';

const client = new APortClient('https://aport.io');
const passport = await client.getPassport('agent-id');
```

### Python
```bash
pip install aport-sdk
```

```python
from aport_sdk import APortClient

client = APortClient('https://aport.io')
passport = client.get_passport('agent-id')
```

## 🔗 Model Context Protocol (MCP)

APort supports MCP allowlists for secure agent tool access:

```typescript
const passport = await client.getPassport('agent-id');

// MCP configuration
console.log(passport.mcp.servers);  // Allowed MCP servers
console.log(passport.mcp.tools);    // Allowed tools
```

### MCP Security Features
- **Server Allowlists**: Whitelist trusted MCP servers
- **Tool Restrictions**: Control specific tool access
- **Policy Enforcement**: Automatic compliance checking
- **Audit Trail**: Complete access logging

## 📚 Documentation

- [SDK Guide](https://aport.io/docs/sdk)
- [API Reference](https://aport.io/docs/api)
- [MCP Integration](https://aport.io/docs/mcp)
- [Examples](https://github.com/aporthq/aport-sdk/tree/main/examples)

## 🤝 Contributing

The SDK is maintained in the main APort repository. Changes are automatically published here.

## 📄 License

MIT License - see LICENSE file for details.
