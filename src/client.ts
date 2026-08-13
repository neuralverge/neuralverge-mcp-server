const BASE_URL = process.env.NEURALVERGE_BASE_URL ?? "https://api.neuralverge.ai";

export class NeuralVergeApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(NeuralVergeApiError.describe(status, body));
    this.name = "NeuralVergeApiError";
    this.status = status;
    this.body = body;
  }

  private static describe(status: number, body: unknown): string {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    switch (status) {
      case 400:
        return `Bad Request (400): the request body or parameters are invalid. ${detail}`;
      case 401:
        return `Unauthorized (401): authentication failed. Check NEURALVERGE_API_KEY. ${detail}`;
      case 402:
        return `Payment Required (402): plan or usage limits reached. ${detail}`;
      case 404:
        return `Not Found (404): the requested resource does not exist or is not available. ${detail}`;
      case 500:
        return `Internal Error (500): upstream provider or temporary service failure. ${detail}`;
      default:
        return `NeuralVerge API error (${status}): ${detail}`;
    }
  }
}

function apiKey(): string {
  const key = process.env.NEURALVERGE_API_KEY;
  if (!key) {
    throw new Error(
      "NEURALVERGE_API_KEY is not set. Provide it as an environment variable for the MCP server process.",
    );
  }
  return key;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(
  method: "GET" | "POST",
  path: string,
  init: { query?: Record<string, string>; json?: unknown } = {},
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });

  const body = await parseBody(res);
  if (!res.ok) {
    throw new NeuralVergeApiError(res.status, body);
  }
  return body;
}

export function apiGet(path: string, query?: Record<string, string>): Promise<unknown> {
  return request("GET", path, { query });
}

export function apiPost(path: string, json: unknown): Promise<unknown> {
  return request("POST", path, { json });
}
