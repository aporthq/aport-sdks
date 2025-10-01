/**
 * Unit tests for D1 Repository implementations
 *
 * These tests verify that the D1 repositories correctly implement the port interfaces
 * and handle CRUD operations, optimistic concurrency, and multi-tenant isolation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { D1Database } from "@cloudflare/workers-types";
import {
  D1PassportRepo,
  D1DecisionLogRepo,
  D1PolicyRepo,
  D1OrgRepo,
  D1RefundRepo,
  D1IdempotencyRepo,
} from "../d1Repos";
import { ConcurrencyError } from "../../ports";

// Mock D1 database
const createMockD1 = (): D1Database =>
  ({
    exec: vi.fn(),
    prepare: vi.fn(),
    batch: vi.fn(),
    dump: vi.fn(),
    load: vi.fn(),
  } as any);

// Mock Drizzle database
const createMockDb = () => {
  const mockD1 = createMockD1();
  return drizzle(mockD1);
};

describe("D1PassportRepo", () => {
  let repo: D1PassportRepo;
  let mockDb: ReturnType<typeof drizzle>;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new D1PassportRepo(mockDb, "ap_org_test123");
  });

  describe("create", () => {
    it("should create a new passport", async () => {
      const passport: any = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        owner_display: "Test Org",
        controller_type: "org",
        claimed: false,
        role: "assistant",
        description: "A test agent",
        capabilities: ["read", "write"],
        limits: { daily: 100 },
        regions: ["US", "CA"],
        status: "active",
        verification_status: "unverified",
        assurance_level: "L1",
        contact: "test@example.com",
        links: { homepage: "https://example.com" },
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      // Mock the insert operation
      const mockInsert = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: mockInsert,
        }),
      } as any);

      await repo.create(passport);

      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("should return passport when found", async () => {
      const mockPassport = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        owner_display: "Test Org",
        controller_type: "org",
        claimed: 0,
        role: "assistant",
        description: "A test agent",
        capabilities: '["read", "write"]',
        limits: '{"daily": 100}',
        regions: '["US", "CA"]',
        status: "active",
        verification_status: "unverified",
        assurance_level: "L1",
        contact: "test@example.com",
        links: '{"homepage": "https://example.com"}',
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        version: "1.0.0",
        version_number: 1,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPassport]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.getById("ap_org_test123", "ap_123456789");

      expect(result).toBeDefined();
      expect(result?.agent_id).toBe("ap_123456789");
      expect(result?.capabilities).toEqual(["read", "write"]);
      expect(result?.limits).toEqual({ daily: 100 });
    });

    it("should return null when passport not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.getById("ap_org_test123", "ap_nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("should update passport successfully", async () => {
      const passport: any = {
        agent_id: "ap_123456789",
        slug: "test-agent",
        name: "Updated Test Agent",
        owner_id: "ap_org_test123",
        owner_type: "org",
        owner_display: "Test Org",
        controller_type: "org",
        claimed: false,
        role: "assistant",
        description: "An updated test agent",
        capabilities: ["read", "write", "delete"],
        limits: { daily: 200 },
        regions: ["US", "CA", "EU"],
        status: "active",
        verification_status: "unverified",
        assurance_level: "L1",
        contact: "test@example.com",
        links: { homepage: "https://example.com" },
        source: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T01:00:00Z",
        version: "1.0.0",
        version_number: 2,
      };

      const mockUpdate = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "update").mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: mockUpdate,
          }),
        }),
      } as any);

      await repo.update(passport);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should throw ConcurrencyError when version mismatch", async () => {
      const passport: any = {
        agent_id: "ap_123456789",
        version_number: 2,
      };

      // Mock getById to return a passport with different version
      const mockPassport = {
        agent_id: "ap_123456789",
        version_number: 3, // Different version
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPassport]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      await expect(
        repo.update(passport, { expectedVersion: 2 })
      ).rejects.toThrow(ConcurrencyError);
    });
  });

  describe("listByOrg", () => {
    it("should return list of passports for organization", async () => {
      const mockPassports = [
        {
          agent_id: "ap_123456789",
          slug: "test-agent-1",
          name: "Test Agent 1",
          owner_id: "ap_org_test123",
          owner_type: "org",
          status: "active",
          role: "assistant",
          description: "A test agent",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          kind: "template",
        },
        {
          agent_id: "ap_987654321",
          slug: "test-agent-2",
          name: "Test Agent 2",
          owner_id: "ap_org_test123",
          owner_type: "org",
          status: "active",
          role: "assistant",
          description: "Another test agent",
          created_at: "2024-01-02T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          kind: "instance",
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockPassports),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.listByOrg("ap_org_test123");

      expect(result).toHaveLength(2);
      expect(result[0].agent_id).toBe("ap_123456789");
      expect(result[1].agent_id).toBe("ap_987654321");
    });

    it("should filter by kind when specified", async () => {
      const mockPassports = [
        {
          agent_id: "ap_123456789",
          slug: "test-agent-1",
          name: "Test Agent 1",
          owner_id: "ap_org_test123",
          owner_type: "org",
          status: "active",
          role: "assistant",
          description: "A test agent",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          kind: "template",
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockPassports),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.listByOrg("ap_org_test123", "template");

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe("template");
    });
  });

  describe("isSlugUnique", () => {
    it("should return true when slug is unique", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.isSlugUnique("ap_org_test123", "unique-slug");

      expect(result).toBe(true);
    });

    it("should return false when slug is not unique", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.isSlugUnique("ap_org_test123", "existing-slug");

      expect(result).toBe(false);
    });
  });
});

describe("D1DecisionLogRepo", () => {
  let repo: D1DecisionLogRepo;
  let mockDb: ReturnType<typeof drizzle>;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new D1DecisionLogRepo(mockDb, "ap_org_test123");
  });

  describe("append", () => {
    it("should append a decision event", async () => {
      const event: any = {
        decision_id: "dec_123456789",
        org_id: "ap_org_test123",
        agent_id: "ap_123456789",
        policy_pack_id: "refunds",
        decision: "allow",
        reason: "Within limits",
        context: { amount: 100, currency: "USD" },
        created_at: "2024-01-01T00:00:00Z",
        record_hash: "hash123",
      };

      const mockInsert = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: mockInsert,
        }),
      } as any);

      await repo.append(event);

      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("getByAgent", () => {
    it("should return decision events for an agent", async () => {
      const mockEvents = [
        {
          decision_id: "dec_123456789",
          org_id: "ap_org_test123",
          agent_id: "ap_123456789",
          policy_pack_id: "refunds",
          decision: "allow",
          reason: "Within limits",
          context: '{"amount": 100, "currency": "USD"}',
          created_at: "2024-01-01T00:00:00Z",
          record_hash: "hash123",
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockEvents),
            }),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.getByAgent("ap_org_test123", "ap_123456789");

      expect(result).toHaveLength(1);
      expect(result[0].decision_id).toBe("dec_123456789");
      expect(result[0].context).toEqual({ amount: 100, currency: "USD" });
    });
  });
});

describe("D1RefundRepo", () => {
  let repo: D1RefundRepo;
  let mockDb: ReturnType<typeof drizzle>;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new D1RefundRepo(mockDb, "ap_org_test123");
  });

  describe("tryConsume", () => {
    it("should consume refund amount successfully", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No existing counter
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const mockInsert = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: mockInsert,
        }),
      } as any);

      const result = await repo.tryConsume(
        "ap_org_test123",
        "ap_123456789",
        "USD",
        100
      );

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(100);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should update existing counter", async () => {
      const existingCounter = {
        counter_id: "ap_org_test123:ap_123456789:USD:2024-01-01",
        amount_minor: 50,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingCounter]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const mockUpdate = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "update").mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: mockUpdate,
          }),
        }),
      } as any);

      const result = await repo.tryConsume(
        "ap_org_test123",
        "ap_123456789",
        "USD",
        25
      );

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(75); // 50 + 25
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});

describe("D1IdempotencyRepo", () => {
  let repo: D1IdempotencyRepo;
  let mockDb: ReturnType<typeof drizzle>;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new D1IdempotencyRepo(mockDb, "ap_org_test123");
  });

  describe("checkAndStore", () => {
    it("should store new idempotency key", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ changes: 1 });
      vi.spyOn(mockDb, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: mockInsert,
        }),
      } as any);

      const result = await repo.checkAndStore(
        "key123",
        "ap_org_test123",
        "ap_123456789",
        "refund",
        { amount: 100 },
        3600
      );

      expect(result.isIdempotent).toBe(false);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should return cached result for existing key", async () => {
      const existingKey = {
        idempotency_key: "key123",
        result: '{"amount": 100}',
      };

      // Mock insert to throw (key already exists)
      const mockInsert = vi
        .fn()
        .mockRejectedValue(new Error("UNIQUE constraint failed"));
      vi.spyOn(mockDb, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: mockInsert,
        }),
      } as any);

      // Mock select to return existing key
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingKey]),
          }),
        }),
      });
      vi.spyOn(mockDb, "select").mockReturnValue(mockSelect as any);

      const result = await repo.checkAndStore(
        "key123",
        "ap_org_test123",
        "ap_123456789",
        "refund",
        { amount: 200 },
        3600
      );

      expect(result.isIdempotent).toBe(true);
      expect(result.cachedResult).toEqual({ amount: 100 });
    });
  });
});
