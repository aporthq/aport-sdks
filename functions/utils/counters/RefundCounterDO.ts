/**
 * Durable Object for Refund Counters
 *
 * Manages atomic counters for daily refund limits per agent and currency
 */

export class RefundCounterDO {
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname;

    switch (action) {
      case "/increment":
        return this.handleIncrement(request);
      case "/get":
        return this.handleGet(request);
      case "/reset":
        return this.handleReset(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async handleIncrement(request: Request): Promise<Response> {
    const { agentId, currency, amount, dailyLimit } =
      (await request.json()) as {
        agentId: string;
        currency: string;
        amount: number;
        dailyLimit: number;
      };
    const today = new Date().toISOString().substring(0, 10);
    const key = `${agentId}:${currency}:${today}`;

    // Get current count
    let currentCount = (await this.state.storage.get(key)) as any | 0;

    // Check if increment would exceed limit
    if (currentCount + amount > dailyLimit) {
      return new Response(
        JSON.stringify({
          allowed: false,
          currentCount,
          dailyLimit,
          wouldExceed: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Increment counter
    currentCount += amount;
    await this.state.storage.put(key, currentCount);

    // Set expiration for end of day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    await this.state.storage.put(`${key}:expires`, tomorrow.getTime());

    return new Response(
      JSON.stringify({
        allowed: true,
        currentCount,
        dailyLimit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async handleGet(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId");
    const currency = url.searchParams.get("currency");

    if (!agentId || !currency) {
      return new Response("Missing agentId or currency", { status: 400 });
    }

    const today = new Date().toISOString().substring(0, 10);
    const key = `${agentId}:${currency}:${today}`;
    const currentCount = (await this.state.storage.get(key)) || 0;

    return new Response(
      JSON.stringify({
        currentCount,
        date: today,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async handleReset(request: Request): Promise<Response> {
    const { agentId, currency } = (await request.json()) as {
      agentId: string;
      currency: string;
    };
    const today = new Date().toISOString().substring(0, 10);
    const key = `${agentId}:${currency}:${today}`;

    await this.state.storage.delete(key);
    await this.state.storage.delete(`${key}:expires`);

    return new Response(
      JSON.stringify({
        reset: true,
        date: today,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
