# Database Adapters

This directory contains database adapters that provide a unified interface for different database implementations.

## Architecture

The database abstraction follows the **Repository Pattern** and **Adapter Pattern** to provide:

- **Database Agnostic Code**: Business logic doesn't depend on specific database implementations
- **Easy Database Switching**: Change from D1 to PostgreSQL without changing business logic
- **Consistent Interface**: All database adapters implement the same `DatabaseAdapter` interface
- **Type Safety**: Full TypeScript support with proper type definitions

## Supported Databases

### ✅ Implemented
- **D1 (SQLite)**: Cloudflare's serverless SQL database
- **PostgreSQL**: Stub implementation (ready for completion)
- **MySQL**: Stub implementation (ready for completion)

### 🔄 Planned
- **Oracle**: Enterprise database support
- **SQL Server**: Microsoft SQL Server support

## Usage

### Basic Usage

```typescript
import { createDatabaseAdapter, createPostgreSQLConfig } from "./adapters";

// Create PostgreSQL adapter
const config = createPostgreSQLConfig("postgresql://user:pass@localhost:5432/mydb");
const adapter = await createDatabaseAdapter(config);

// Use the adapter
const passport = await adapter.passports.getById("org123", "agent456");
```

### Tenant-Specific Adapters

```typescript
import { createDatabaseAdapterForTenant } from "./adapters";

// Create tenant-specific adapter
const adapter = await createDatabaseAdapterForTenant("tenant123", config);
```

### Database Factory

```typescript
import { DatabaseFactory } from "./adapters";

const factory = DatabaseFactory.getInstance();

// Create different types of adapters
const d1Adapter = await factory.createAdapter({ type: "d1" });
const pgAdapter = await factory.createAdapter({ type: "postgresql", connectionString: "..." });
const mysqlAdapter = await factory.createAdapter({ type: "mysql", connectionString: "..." });
```

## Configuration

### D1 Configuration
```typescript
const config = {
  type: "d1",
  options: {
    bindingName: "D1_US"
  }
};
```

### PostgreSQL Configuration
```typescript
const config = {
  type: "postgresql",
  connectionString: "postgresql://user:pass@localhost:5432/mydb",
  ssl: true,
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
  }
};
```

### MySQL Configuration
```typescript
const config = {
  type: "mysql",
  host: "localhost",
  port: 3306,
  database: "mydb",
  username: "user",
  password: "pass",
  ssl: true
};
```

## Repository Interfaces

Each database adapter provides the following repositories:

- **`passports`**: Passport management
- **`decisions`**: Decision event logging
- **`policies`**: Policy management
- **`organizations`**: Organization management
- **`tenants`**: Tenant management
- **`refunds`**: Refund counter management
- **`idempotency`**: Idempotency key management

## Transaction Support

All adapters support transactions:

```typescript
await adapter.transaction(async (ctx) => {
  const passport = await ctx.passports.create(passportData);
  await ctx.decisions.append(decisionData);
  return passport;
});
```

## Health Checks

```typescript
const isHealthy = await adapter.healthCheck();
if (!isHealthy) {
  console.error("Database connection failed");
}
```

## Error Handling

The adapters provide specific error types:

```typescript
import { DatabaseError, ConnectionError, QueryError, TransactionError } from "./adapters";

try {
  await adapter.passports.create(data);
} catch (error) {
  if (error instanceof ConnectionError) {
    // Handle connection issues
  } else if (error instanceof QueryError) {
    // Handle query issues
  } else if (error instanceof TransactionError) {
    // Handle transaction issues
  }
}
```

## Implementation Status

### D1 Adapter
- ✅ **Fully Implemented**: Production ready
- ✅ **Transaction Support**: Yes
- ✅ **Health Checks**: Yes
- ✅ **Error Handling**: Yes

### PostgreSQL Adapter
- 🔄 **Stub Implementation**: Interface defined, implementation needed
- ❌ **Transaction Support**: Not implemented
- ❌ **Health Checks**: Not implemented
- ❌ **Error Handling**: Not implemented

### MySQL Adapter
- 🔄 **Stub Implementation**: Interface defined, implementation needed
- ❌ **Transaction Support**: Not implemented
- ❌ **Health Checks**: Not implemented
- ❌ **Error Handling**: Not implemented

## Adding New Database Support

To add support for a new database:

1. **Create the adapter directory**: `functions/adapters/your-db/`
2. **Implement the interfaces**: Create repository classes that implement the required interfaces
3. **Create the main adapter**: Implement `DatabaseAdapter` interface
4. **Add to factory**: Update `DatabaseFactory` to support the new database type
5. **Add configuration**: Add configuration validation and creation helpers
6. **Update exports**: Add exports to `index.ts`

## Testing

Each adapter should include comprehensive tests:

```typescript
// Example test structure
describe("PostgreSQLPassportRepository", () => {
  let adapter: DatabaseAdapter;
  
  beforeEach(async () => {
    adapter = await createDatabaseAdapter(testConfig);
  });
  
  afterEach(async () => {
    await adapter.close();
  });
  
  it("should create passport", async () => {
    const passport = await adapter.passports.create(passportData);
    expect(passport).toBeDefined();
  });
});
```

## Performance Considerations

- **Connection Pooling**: Use connection pooling for production databases
- **Query Optimization**: Implement efficient queries for each database type
- **Caching**: Consider adding caching layers for frequently accessed data
- **Monitoring**: Add database performance monitoring and metrics

## Security Considerations

- **Connection Security**: Use SSL/TLS for database connections
- **Credential Management**: Store database credentials securely
- **SQL Injection**: Use parameterized queries to prevent SQL injection
- **Access Control**: Implement proper database access controls
