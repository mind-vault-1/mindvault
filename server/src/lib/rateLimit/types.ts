export interface RateLimitConsumeResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the client can retry or the window fully resets. */
  resetAt: number;
  retryAfterSeconds?: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitConsumeResult>;
  close?(): Promise<void>;
}
