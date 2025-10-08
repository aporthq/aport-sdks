import request from "supertest";
import express from "express";
import {
  agentPassportMiddleware,
  requirePolicy,
  requireRefundPolicy,
  requireDataExportPolicy,
  AgentRequest,
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
    const mockPassportView = {
      agent_id: "ap_a2d10232c6534523812423eec8a1425c4567890abcdef",
      slug: "test-agent",
      name: "Test Agent",
      status: "active",
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPassportView), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(agentPassportMiddleware());
    app.get("/test", (req: AgentRequest, res: any) => {
      res.json({ agent: req.agent });
    });

    const response = await request(app)
      .get("/test")
      .set(
        "X-Agent-Passport-Id",
        "ap_a2d10232c6534523812423eec8a1425c4567890abcdef"
      );

    expect(response.status).toBe(200);
    expect(response.body.agent).toEqual({
      ...mockPassportView,
      agent_id: "ap_a2d10232c6534523812423eec8a1425c4567890abcdef",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.aport.io/api/passports/ap_a2d10232c6534523812423eec8a1425c4567890abcdef/verify_view",
      expect.any(Object)
    );
  });

  it("should return 401 when no agent ID is provided", async () => {
    app.use(agentPassportMiddleware());
    app.get("/test", (req: AgentRequest, res: any) => {
      res.json({ agent: req.agent });
    });

    const response = await request(app).get("/test");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("missing_agent_id");
  });

  it("should skip middleware for health check paths", async () => {
    app.use(agentPassportMiddleware({ skipPaths: ["/health"] }));
    app.get("/health", (req: any, res: any) => {
      res.json({ status: "ok" });
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should verify policy and attach result to request", async () => {
    const mockPolicyResponse = {
      decision_id: "dec_123",
      allow: true,
      reasons: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPolicyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(express.json());
    app.use(
      agentPassportMiddleware({
        policyId: "finance.payment.refund.v1",
      })
    );
    app.post("/refund", (req: AgentRequest, res: any) => {
      res.json({
        agent: req.agent,
        policyResult: req.policyResult,
      });
    });

    const response = await request(app)
      .post("/refund")
      .set("X-Agent-Passport-Id", "ap_test123")
      .send({ amount: 100, currency: "USD" });

    expect(response.status).toBe(200);
    expect(response.body.agent.agent_id).toBe("ap_test123");
    expect(response.body.policyResult.allow).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.aport.io/api/verify/policy/finance.payment.refund.v1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent_id: "ap_test123",
          context: { amount: 100, currency: "USD" },
        }),
      })
    );
  });

  it("should return 403 when policy verification fails", async () => {
    const mockPolicyResponse = {
      decision_id: "dec_123",
      allow: false,
      reasons: [{ code: "INSUFFICIENT_PERMISSIONS", message: "Access denied" }],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPolicyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(express.json());
    app.use(
      agentPassportMiddleware({
        policyId: "finance.payment.refund.v1",
      })
    );
    app.post("/refund", (req: AgentRequest, res: any) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .post("/refund")
      .set("X-Agent-Passport-Id", "ap_test123")
      .send({ amount: 100, currency: "USD" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("policy_violation");
    expect(response.body.reasons).toEqual(mockPolicyResponse.reasons);
  });
});

describe("requirePolicy", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should enforce specific policy on route", async () => {
    const mockPolicyResponse = {
      decision_id: "dec_123",
      allow: true,
      reasons: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPolicyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(express.json());
    app.post(
      "/data-export",
      requirePolicy("data.export.create.v1"),
      (req: AgentRequest, res: any) => {
        res.json({ success: true });
      }
    );

    const response = await request(app)
      .post("/data-export")
      .set("X-Agent-Passport-Id", "ap_test123")
      .send({ data_types: ["user_data"], destination: "s3://bucket" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe("requireRefundPolicy", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should enforce refund policy", async () => {
    const mockPolicyResponse = {
      decision_id: "dec_123",
      allow: true,
      reasons: [],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPolicyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    app.use(express.json());
    app.post(
      "/refund",
      requireRefundPolicy(),
      (req: AgentRequest, res: any) => {
        res.json({ success: true });
      }
    );

    const response = await request(app)
      .post("/refund")
      .set("X-Agent-Passport-Id", "ap_test123")
      .send({ amount: 100, currency: "USD", order_id: "order_123" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
