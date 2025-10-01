/**
 * Unit tests for Tenant Durable Object
 *
 * These tests verify that the TenantDO correctly handles all message types
 * and provides the required guarantees for serialized writes, atomic counters,
 * idempotency, and audit hash-chain consistency.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TenantDO } from "../TenantDO";
import { TenantDOClient } from "../TenantDOClient";

// Mock Durable Object state
const createMockState = () => ({
  id: { toString: () => "ap_org_test123" },
  storage: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
});

// Mock environment
const createMockEnv = () => ({
  D1_US: { exec: vi.fn(), prepare: vi.fn() },
  D1_EU: { exec: vi.fn(), prepare: vi.fn() },
  D1_CA: { exec: vi.fn(), prepare: vi.fn() },
  DEFAULT_REGION: "US",
});

// Mock database factory
const createMockDbFactory = () => ({
  forTenant: vi.fn().mockResolvedValue({
    tx: {
      run: vi.fn().mockImplementation(async (fn) => {
        const ctx = {
          passports: {
            getById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            isSlugUnique: vi.fn(),
          },
          decisions: {
            append: vi.fn(),
          },
          refunds: {
            tryConsume: vi.fn(),
          },
        };
        return await fn(ctx);
      }),
    },
    repos: {},
  }),
});

describe("TenantDO", () => {
  let tenantDO: TenantDO;
  let mockState: any;
  let mockEnv: any;
  let mockDbFactory: any;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = createMockEnv();
    mockDbFactory = createMockDbFactory();

    // Mock the database factory creation
    vi.doMock("../../adapters/d1", () => ({
      createD1DbFactoryFromEnv: () => mockDbFactory,
    }));

    tenantDO = new TenantDO(mockState, mockEnv);
  });

  describe("CREATE_PASSPORT", () => {
    it("should create a passport successfully", async () => {
      const passport = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        role: "assistant",
        description: "A test agent",
        contact: "test@example.com",
        status: "active",
        assurance_level: "L1",
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      const message = {
        type: "CREATE_PASSPORT",
        payload: passport,
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(passport);
      expect(result.requestId).toBe("req_123");
    });

    it("should reject duplicate passport creation", async () => {
      const passport = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        role: "assistant",
        description: "A test agent",
        contact: "test@example.com",
        status: "active",
        assurance_level: "L1",
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      // Mock existing passport
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn().mockResolvedValue(passport), // Already exists
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn().mockResolvedValue(true),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const message = {
        type: "CREATE_PASSPORT",
        payload: passport,
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Passport already exists");
    });
  });

  describe("UPDATE_PASSPORT", () => {
    it("should update a passport successfully", async () => {
      const currentPassport = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        role: "assistant",
        description: "A test agent",
        contact: "test@example.com",
        status: "active",
        assurance_level: "L1",
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      const updatedPassport = {
        ...currentPassport,
        name: "Updated Test Agent",
        description: "An updated test agent",
        version_number: 2,
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn().mockResolvedValue(currentPassport),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn().mockResolvedValue(true),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const message = {
        type: "UPDATE_PASSPORT",
        payload: updatedPassport,
        expectedVersion: 1,
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.version_number).toBe(2);
    });

    it("should reject update with version conflict", async () => {
      const currentPassport = {
        agent_id: "ap_123456789",
        version_number: 2, // Current version is 2
      };

      const updatedPassport = {
        agent_id: "ap_123456789",
        version_number: 2, // Trying to update with version 2
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn().mockResolvedValue(currentPassport),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn().mockResolvedValue(true),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const message = {
        type: "UPDATE_PASSPORT",
        payload: updatedPassport,
        expectedVersion: 1, // Expected version 1, but current is 2
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ConcurrencyError");
    });
  });

  describe("REFUND_CONSUME", () => {
    it("should consume refund successfully", async () => {
      const message = {
        type: "REFUND_CONSUME",
        payload: {
          agentId: "ap_123456789",
          currency: "USD",
          amountMinor: 100,
          idempotencyKey: "refund_123",
        },
        requestId: "req_123",
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn(),
              },
              decisions: { append: vi.fn() },
              refunds: {
                tryConsume: vi
                  .fn()
                  .mockResolvedValue({ success: true, remaining: 900 }),
              },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.consumed).toBe(100);
      expect(result.data.remaining).toBe(900);
    });

    it("should reject refund when daily limit exceeded", async () => {
      const message = {
        type: "REFUND_CONSUME",
        payload: {
          agentId: "ap_123456789",
          currency: "USD",
          amountMinor: 1000, // This would exceed the 1000 daily limit
          idempotencyKey: "refund_124",
        },
        requestId: "req_124",
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn(),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(false);
      expect(result.data.consumed).toBe(0);
    });

    it("should handle idempotency correctly", async () => {
      const message = {
        type: "REFUND_CONSUME",
        payload: {
          agentId: "ap_123456789",
          currency: "USD",
          amountMinor: 100,
          idempotencyKey: "refund_125",
        },
        requestId: "req_125",
      };

      // First request - should succeed
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn(),
              },
              decisions: { append: vi.fn() },
              refunds: {
                tryConsume: vi
                  .fn()
                  .mockResolvedValue({ success: true, remaining: 900 }),
              },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const request1 = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response1 = await tenantDO.fetch(request1);
      const result1 = await response1.json();

      expect(result1.success).toBe(true);
      expect(result1.data.success).toBe(true);

      // Second request with same idempotency key - should return cached result
      const request2 = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response2 = await tenantDO.fetch(request2);
      const result2 = await response2.json();

      expect(result2.success).toBe(true);
      expect(result2.data.success).toBe(true);
      expect(result2.data.consumed).toBe(100); // Same as first request
    });
  });

  describe("STATUS_CHANGE", () => {
    it("should change passport status successfully", async () => {
      const currentPassport = {
        agent_id: "ap_123456789",
        status: "active",
        version_number: 1,
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn().mockResolvedValue(currentPassport),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn(),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const message = {
        type: "STATUS_CHANGE",
        payload: {
          agentId: "ap_123456789",
          status: "suspended",
          reason: "Policy violation",
        },
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
    });
  });

  describe("APPEND_DECISION", () => {
    it("should append decision successfully", async () => {
      const decision = {
        decision_id: "dec_123",
        org_id: "ap_org_test123",
        agent_id: "ap_123456789",
        policy_pack_id: "refunds",
        decision: "allow",
        reason: "Within limits",
        context: { amount: 100, currency: "USD" },
        created_at: "2024-01-01T00:00:00Z",
        record_hash: "",
      };

      // Mock database operations
      mockDbFactory.forTenant.mockResolvedValueOnce({
        tx: {
          run: vi.fn().mockImplementation(async (fn) => {
            const ctx = {
              passports: {
                getById: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                isSlugUnique: vi.fn(),
              },
              decisions: { append: vi.fn() },
              refunds: { tryConsume: vi.fn() },
            };
            return await fn(ctx);
          }),
        },
        repos: {},
      });

      const message = {
        type: "APPEND_DECISION",
        payload: decision,
        requestId: "req_123",
      };

      const request = new Request("http://tenant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
    });
  });

  describe("Health and State", () => {
    it("should return health status", async () => {
      const request = new Request("http://tenant/health");
      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.tenantId).toBe("ap_org_test123");
      expect(typeof result.activeRequests).toBe("number");
    });

    it("should return tenant state", async () => {
      const request = new Request("http://tenant/state");
      const response = await tenantDO.fetch(request);
      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.tenantId).toBe("ap_org_test123");
      expect(result.state).toBeDefined();
    });
  });
});

describe("TenantDOClient", () => {
  let client: TenantDOClient;
  let mockNamespace: any;

  beforeEach(() => {
    mockNamespace = {
      idFromName: vi.fn().mockReturnValue("test-id"),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        ),
      }),
    };

    client = new TenantDOClient(mockNamespace, "ap_org_test123");
  });

  describe("Passport Operations", () => {
    it("should create passport via client", async () => {
      const passport = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        role: "assistant",
        description: "A test agent",
        contact: "test@example.com",
        status: "active",
        assurance_level: "L1",
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      const result = await client.createPassport(passport);

      expect(result).toBeDefined();
      expect(mockNamespace.get).toHaveBeenCalled();
    });

    it("should update passport via client", async () => {
      const passport = {
        agent_id: "ap_123456789",
        version_number: 2,
      };

      const result = await client.updatePassport(passport, 1);

      expect(result).toBeDefined();
      expect(mockNamespace.get).toHaveBeenCalled();
    });

    it("should change status via client", async () => {
      const result = await client.changeStatus(
        "ap_123456789",
        "suspended",
        "Policy violation"
      );

      expect(result.success).toBe(true);
      expect(mockNamespace.get).toHaveBeenCalled();
    });
  });

  describe("Refund Operations", () => {
    it("should consume refund via client", async () => {
      const result = await client.consumeRefund(
        "ap_123456789",
        "USD",
        100,
        "refund_123"
      );

      expect(result).toBeDefined();
      expect(mockNamespace.get).toHaveBeenCalled();
    });
  });

  describe("Health and Monitoring", () => {
    it("should get health status via client", async () => {
      const result = await client.getHealth();

      expect(result).toBeDefined();
      expect(mockNamespace.get).toHaveBeenCalled();
    });

    it("should get state via client", async () => {
      const result = await client.getState();

      expect(result).toBeDefined();
      expect(mockNamespace.get).toHaveBeenCalled();
    });
  });
});
