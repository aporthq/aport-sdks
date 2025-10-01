import request from "supertest";
import express from "express";
import {
  agentPassportMiddleware,
  hasAgentPermission,
  isAgentAllowedInRegion,
  getAgent,
  AgentPassport,
} from "./index";
import {
  jest,
  beforeEach,
  describe,
  it,
  expect,
  afterEach,
} from "@jest/globals";

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

describe("agentPassportMiddleware", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should verify agent passport and attach to request", async () => {
    const mockAgent: AgentPassport = {
      agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef",
      slug: "test-agent",
      name: "Test Agent",
      owner: "test-owner",
      controller_type: "org",
      claimed: true,
      role: "Test Role",
      description: "Test Description",
      status: "active",
      verification_status: "verified",
      permissions: ["read:data"],
      limits: {},
      regions: ["us-east-1"],
      contact: "test@example.com",
      links: {},
      source: "admin",
      created_at: "2024-01-15T10:30:00Z",
      updated_at: "2024-01-15T10:30:00Z",
      version: "1.0.0",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockAgent), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(agentPassportMiddleware());
    app.get("/test", (req: any, res: any) => {
      res.json({ agent: req.agent });
    });

    const response = await request(app)
      .get("/test")
      .set(
        "X-Agent-Passport-Id",
        "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef"
      );

    expect(response.status).toBe(200);
    expect(response.body.agent).toEqual(mockAgent);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/verify/aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef"
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Cache-Control": "public, max-age=60",
        }),
      })
    );
  });

  it("should return 400 when agent ID is missing and failClosed is true", async () => {
    app.use(agentPassportMiddleware({ failClosed: true }));
    app.get("/test", (req, res) => res.json({ success: true }));

    const response = await request(app).get("/test");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("missing_agent_id");
  });

  it("should continue when agent ID is missing and failClosed is false", async () => {
    app.use(agentPassportMiddleware({ failClosed: false }));
    app.get("/test", (req, res) => res.json({ success: true }));

    const response = await request(app).get("/test");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should skip OPTIONS requests", async () => {
    app.use(agentPassportMiddleware());
    app.options("/test", (req, res) => res.json({ success: true }));

    const response = await request(app).options("/test");

    expect(response.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should skip specified paths", async () => {
    app.use(agentPassportMiddleware({ skipPaths: ["/health"] }));
    app.get("/health", (req, res) => res.json({ status: "ok" }));

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should check required permissions", async () => {
    const mockAgent: AgentPassport = {
      agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef",
      slug: "test-agent",
      name: "Test Agent",
      owner: "test-owner",
      controller_type: "org",
      claimed: true,
      role: "Test Role",
      description: "Test Description",
      status: "active",
      verification_status: "verified",
      permissions: ["read:data"],
      limits: {},
      regions: ["us-east-1"],
      contact: "test@example.com",
      links: {},
      source: "admin",
      created_at: "2024-01-15T10:30:00Z",
      updated_at: "2024-01-15T10:30:00Z",
      version: "1.0.0",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockAgent), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(
      agentPassportMiddleware({
        requiredPermissions: ["write:data"],
      })
    );
    app.get("/test", (req, res) => res.json({ success: true }));

    const response = await request(app)
      .get("/test")
      .set(
        "X-Agent-Passport-Id",
        "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef"
      );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("insufficient_permissions");
  });

  it("should check allowed regions", async () => {
    const mockAgent: AgentPassport = {
      agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef",
      slug: "test-agent",
      name: "Test Agent",
      owner: "test-owner",
      controller_type: "org",
      claimed: true,
      role: "Test Role",
      description: "Test Description",
      status: "active",
      verification_status: "verified",
      permissions: ["read:data"],
      limits: {},
      regions: ["us-east-1"],
      contact: "test@example.com",
      links: {},
      source: "admin",
      created_at: "2024-01-15T10:30:00Z",
      updated_at: "2024-01-15T10:30:00Z",
      version: "1.0.0",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockAgent), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(
      agentPassportMiddleware({
        allowedRegions: ["eu-west-1"],
      })
    );
    app.get("/test", (req, res) => res.json({ success: true }));

    const response = await request(app)
      .get("/test")
      .set(
        "X-Agent-Passport-Id",
        "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef"
      );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("region_not_allowed");
  });

  it("should handle verification errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Agent not found") as any);

    app.use(agentPassportMiddleware());
    app.get("/test", (req, res) => res.json({ success: true }));

    const response = await request(app)
      .get("/test")
      .set("X-Agent-Passport-Id", "ap_invalid_id");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("internal_error");
  });
});

describe("Helper Functions", () => {
  let mockReq: any;
  let mockAgent: AgentPassport;

  beforeEach(() => {
    mockAgent = {
      agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da64567890abcdef",
      slug: "test-agent",
      name: "Test Agent",
      owner: "test-owner",
      controller_type: "org",
      claimed: true,
      role: "Test Role",
      description: "Test Description",
      status: "active",
      verification_status: "verified",
      permissions: ["read:data", "write:logs"],
      limits: {},
      regions: ["us-east-1", "eu-west-1"],
      contact: "test@example.com",
      links: {},
      source: "admin",
      created_at: "2024-01-15T10:30:00Z",
      updated_at: "2024-01-15T10:30:00Z",
      version: "1.0.0",
    };

    mockReq = {
      agent: mockAgent,
    };
  });

  it("should check agent permission", () => {
    const result = hasAgentPermission(mockReq, "read:data");

    expect(result).toBe(true);
  });

  it("should check agent region access", () => {
    const result = isAgentAllowedInRegion(mockReq, "us-east-1");

    expect(result).toBe(true);
  });

  it("should get agent from request", () => {
    const result = getAgent(mockReq);

    expect(result).toBe(mockAgent);
  });

  it("should check if request has agent", () => {
    expect(hasAgent(mockReq)).toBe(true);
    expect(hasAgent({} as any)).toBe(false);
  });
});
