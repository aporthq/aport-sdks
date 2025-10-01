/**
 * Custom error types for the APort SDK
 */

export class AportError extends Error {
  public readonly status: number;
  public readonly reasons?: Array<{
    code: string;
    message: string;
    severity?: string;
  }>;
  public readonly decision_id?: string;
  public readonly serverTiming?: string;
  public readonly rawResponse?: string;

  constructor(
    status: number,
    reasons?: Array<{ code: string; message: string; severity?: string }>,
    decision_id?: string,
    serverTiming?: string,
    rawResponse?: string
  ) {
    const message = reasons?.length
      ? `API request failed: ${status} ${reasons
          .map((r) => r.message)
          .join(", ")}`
      : `API request failed: ${status}`;

    super(message);
    this.name = "AportError";
    this.status = status;
    this.reasons = reasons;
    this.decision_id = decision_id;
    this.serverTiming = serverTiming;
    this.rawResponse = rawResponse;
  }
}
