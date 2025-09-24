import {
  withAgentPassportId,
  verifyAgentPassport,
  hasCapability,
  isAllowedInRegion,
  getAgentPassportId,
  withAgentPassportIdFromEnv,
  AgentPassportError,
} from "./index";
import {
  jest,
  beforeEach,
  describe,
  it,
  expect,
  afterEach,
} from "@jest/globals";

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe("withAgentPassportId", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should add X-Agent-Passport-Id header to requests", async () => {
    const agentId = "ap_128094d34567890abcdef";
    const wrappedFetch = withAgentPassportId(agentId, mockFetch);

    mockFetch.mockResolvedValueOnce(
      new Response('{"data": "test"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await wrappedFetch("https://api.example.com/data");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Agent-Passport-Id": agentId,
        }),
      })
    );
  });

  it("should preserve existing headers", async () => {
    const agentId = "ap_128094d34567890abcdef";
    const wrappedFetch = withAgentPassportId(agentId, mockFetch);

    mockFetch.mockResolvedValueOnce(
      new Response('{"data": "test"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await wrappedFetch("https://api.example.com/data", {
      headers: {
        Authorization: "Bearer token123",
        "Content-Type": "application/json",
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Agent-Passport-Id": agentId,
          Authorization: "Bearer token123",
          "Content-Type": "application/json",
        }),
      })
    );
  });
});

describe("verifyAgentPassport", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should verify active agent successfully", async () => {
    const agentId = "ap_128094d34567890abcdef";
    const mockAgentData = {
      agent_id: agentId,
      status: "active",
      permissions: ["read:data", "write:logs"],
      limits: { requests_per_hour: 1000 },
      regions: ["us-east-1"],
      verified_at: "2024-01-15T10:30:00Z",
    };

    // Mock the global fetch
    const originalFetch = global.fetch;
    const mockResponse = {
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue(mockAgentData as unknown as never),
    } as unknown as Response;
    global.fetch = jest
      .fn()
      .mockResolvedValue(mockResponse as unknown as never) as any;

    try {
      const result = await verifyAgentPassport(agentId, {
        baseUrl: "https://test-registry.com",
      });

      expect(result).toEqual(mockAgentData);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://test-registry.com/api/verify/${agentId}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            "Cache-Control": "public, max-age=60",
          }),
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should throw error for suspended agent", async () => {
    const agentId = "ap_128094d34567890abcdef";
    const mockErrorData = {
      error: "agent_suspended",
      message: "This agent is suspended",
      status: "suspended",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockErrorData), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(verifyAgentPassport(agentId)).rejects.toThrow(
      AgentPassportError
    );
  });

  it("should throw error for non-active agent", async () => {
    const agentId = "ap_128094d34567890abcdef";
    const mockAgentData = {
      agent_id: agentId,
      status: "suspended",
      permissions: [],
      limits: {},
      regions: [],
      verified_at: "2024-01-15T10:30:00Z",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockAgentData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(verifyAgentPassport(agentId)).rejects.toThrow(
      AgentPassportError
    );
  });

  it("should handle network errors", async () => {
    const agentId = "ap_128094d34567890abcdef";
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(verifyAgentPassport(agentId)).rejects.toThrow(
      AgentPassportError
    );
  });

  it("should handle timeout", async () => {
    const agentId = "ap_128094d34567890abcdef";

    // Mock the global fetch to reject with AbortError
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() => {
      const error = new Error("The operation was aborted");
      (error as any).name = "AbortError";
      return Promise.reject(error);
    }) as any;

    try {
      await expect(
        verifyAgentPassport(agentId, { timeout: 50 })
      ).rejects.toThrow(AgentPassportError);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("hasCapability", () => {
  const agent: any = {
    capabilities: [
      { id: "read:data" },
      { id: "write:logs" },
      { id: "admin:users" },
    ],
  };

  it("should return true for existing capability", () => {
    expect(hasCapability(agent, "read:data")).toBe(true);
    expect(hasCapability(agent, "write:logs")).toBe(true);
    expect(hasCapability(agent, "admin:users")).toBe(true);
  });

  it("should return false for non-existing capability", () => {
    expect(hasCapability(agent, "delete:data")).toBe(false);
    expect(hasCapability(agent, "admin:system")).toBe(false);
  });
});

describe("isAllowedInRegion", () => {
  const agent: any = {
    regions: ["us-east-1", "eu-west-1"],
  };

  it("should return true for allowed region", () => {
    expect(isAllowedInRegion(agent, "us-east-1")).toBe(true);
    expect(isAllowedInRegion(agent, "eu-west-1")).toBe(true);
  });

  it("should return false for disallowed region", () => {
    expect(isAllowedInRegion(agent, "ap-southeast-1")).toBe(false);
    expect(isAllowedInRegion(agent, "us-west-2")).toBe(false);
  });
});

describe("getAgentPassportId", () => {
  const originalEnv = process.env.AGENT_PASSPORT_ID;

  afterEach(() => {
    process.env.AGENT_PASSPORT_ID = originalEnv;
  });

  it("should return agent ID from environment", () => {
    process.env.AGENT_PASSPORT_ID = "ap_128094d34567890abcdef";
    expect(getAgentPassportId()).toBe("ap_128094d34567890abcdef");
  });

  it("should return undefined when not set", () => {
    delete process.env.AGENT_PASSPORT_ID;
    expect(getAgentPassportId()).toBeUndefined();
  });
});

describe("withAgentPassportIdFromEnv", () => {
  const originalEnv = process.env.AGENT_PASSPORT_ID;

  afterEach(() => {
    process.env.AGENT_PASSPORT_ID = originalEnv;
  });

  it("should return wrapped fetch when AGENT_PASSPORT_ID is set", () => {
    process.env.AGENT_PASSPORT_ID = "ap_128094d34567890abcdef";
    const wrappedFetch = withAgentPassportIdFromEnv(mockFetch);
    expect(wrappedFetch).toBeDefined();
  });

  it("should return undefined when AGENT_PASSPORT_ID is not set", () => {
    delete process.env.AGENT_PASSPORT_ID;
    const wrappedFetch = withAgentPassportIdFromEnv(mockFetch);
    expect(wrappedFetch).toBeUndefined();
  });
});
