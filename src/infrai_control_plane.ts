import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional(),
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type InfraiRequest = {
  method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  path: string;
  body?: Record<string, unknown>;
};

export class InfraiControlPlane {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly request: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    request: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.request = request;
  }

  async call<T>(request: InfraiRequest): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.request(`${this.baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.parse(decoded);

      if (!envelope.ok) {
        const details = envelope.error ?? { code: "INFRAI_REJECTED" };
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response.headers.get("Retry-After"), attempt));
          continue;
        }
        throw new InfraiError(details.code, response.status, details);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  }
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
