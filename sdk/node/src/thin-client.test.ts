import { APortClient, PolicyVerifier, AportError } from "./thin-client";
import { PolicyVerificationResponse } from "./types/decision";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("APortClient", () => {
  let client: APortClient;

  beforeEach(() => {
    client = new APortClient({
      baseUrl: "https://api.aport.io",
      apiKey: "test-key",
    });
    mockFetch.mockClear();
  });

  describe("verifyPolicy", () => {
    it("should make a POST request to the policy endpoint", async () => {
      const mockResponse: PolicyVerificationResponse = {
        decision_id: "dec_123",
        allow: true,
        reasons: [],
        expires_in: 60,
        created_at: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([["server-timing", "cache;dur=5"]]),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await client.verifyPolicy(
        "agent-123",
        "finance.payment.refund.v1",
        {
          amount: 100,
          currency: "USD",
        }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/policy/finance.payment.refund.v1",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "aport-sdk-js/0.1.0",
            Authorization: "Bearer test-key",
          },
          body: JSON.stringify({
            agent_id: "agent-123",
            context: {
              amount: 100,
              currency: "USD",
            },
            idempotency_key: undefined,
          }),
        })
      );

      expect(result).toEqual({
        ...mockResponse,
        _meta: { serverTiming: "cache;dur=5" },
      });
    });

    it("should include idempotency key in both header and body", async () => {
      const mockResponse: PolicyVerificationResponse = {
        decision_id: "dec_456",
        allow: true,
        reasons: [],
        expires_in: 60,
        created_at: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      await client.verifyPolicy(
        "agent-123",
        "finance.payment.refund.v1",
        {},
        "idem-key-123"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/policy/finance.payment.refund.v1",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": "idem-key-123",
          }),
          body: JSON.stringify({
            agent_id: "agent-123",
            context: {},
            idempotency_key: "idem-key-123",
          }),
        })
      );
    });

    it("should handle API errors with reasons", async () => {
      const errorResponse = {
        reasons: [
          {
            code: "INSUFFICIENT_CAPABILITIES",
            message: "Missing required capability",
            severity: "error",
          },
        ],
        decision_id: "dec_error",
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(errorResponse)),
      });

      try {
        await client.verifyPolicy("agent-123", "finance.payment.refund.v1", {});
        fail("Expected AportError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AportError);
        expect((error as AportError).status).toBe(400);
        expect((error as AportError).reasons).toEqual(errorResponse.reasons);
        expect((error as AportError).decision_id).toBe("dec_error");
      }
    });

    it("should handle timeout errors", async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error("Request timeout");
            error.name = "AbortError";
            reject(error);
          }, 10);
        });
      });

      try {
        await client.verifyPolicy("agent-123", "finance.payment.refund.v1", {});
        fail("Expected AportError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AportError);
        expect((error as AportError).status).toBe(408);
        expect((error as AportError).reasons?.[0]?.code).toBe("TIMEOUT");
      }
    });

    it("should normalize base URL correctly", async () => {
      const clientWithTrailingSlash = new APortClient({
        baseUrl: "https://api.aport.io/",
        apiKey: "test-key",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () =>
          Promise.resolve(JSON.stringify({ decision_id: "test", allow: true })),
      });

      await clientWithTrailingSlash.verifyPolicy(
        "agent-123",
        "finance.payment.refund.v1",
        {}
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/policy/finance.payment.refund.v1",
        expect.any(Object)
      );
    });
  });

  describe("getDecisionToken", () => {
    it("should make a POST request to the token endpoint", async () => {
      const mockResponse = { token: "jwt_token_123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await client.getDecisionToken(
        "agent-123",
        "finance.payment.refund.v1",
        {
          amount: 100,
          currency: "USD",
        }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/token/finance.payment.refund.v1",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            agent_id: "agent-123",
            context: {
              amount: 100,
              currency: "USD",
            },
          }),
        })
      );

      expect(result).toBe("jwt_token_123");
    });
  });

  describe("getPassportView", () => {
    it("should make a GET request to the passport view endpoint", async () => {
      const mockResponse = {
        agent_id: "agent-123",
        status: "active",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await client.getPassportView("agent-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/passports/agent-123/verify_view",
        expect.objectContaining({
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "aport-sdk-js/0.1.0",
            Authorization: "Bearer test-key",
          },
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });
});

describe("PolicyVerifier", () => {
  let client: APortClient;
  let verifier: PolicyVerifier;

  beforeEach(() => {
    client = new APortClient({
      baseUrl: "https://api.aport.io",
      apiKey: "test-key",
    });
    verifier = new PolicyVerifier(client);
    mockFetch.mockClear();
  });

  describe("verifyRefund", () => {
    it("should call verifyPolicy with finance.payment.refund.v1 policy", async () => {
      const mockResponse: PolicyVerificationResponse = {
        decision_id: "dec_123",
        allow: true,
        reasons: [],
        expires_in: 60,
        created_at: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await verifier.verifyRefund("agent-123", {
        amount: 100,
        currency: "USD",
        order_id: "order-123",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/policy/finance.payment.refund.v1",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            agent_id: "agent-123",
            context: {
              amount: 100,
              currency: "USD",
              order_id: "order-123",
            },
            idempotency_key: undefined,
          }),
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe("verifyRepository", () => {
    it("should call verifyPolicy with code.repository.merge.v1 policy", async () => {
      const mockResponse: PolicyVerificationResponse = {
        decision_id: "dec_repo",
        allow: true,
        reasons: [],
        expires_in: 60,
        created_at: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await verifier.verifyRepository("agent-123", {
        operation: "create_pr",
        repository: "my-org/my-repo",
        pr_size_kb: 500,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.aport.io/api/verify/policy/code.repository.merge.v1",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            agent_id: "agent-123",
            context: {
              operation: "create_pr",
              repository: "my-org/my-repo",
              pr_size_kb: 500,
            },
            idempotency_key: undefined,
          }),
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });
});
