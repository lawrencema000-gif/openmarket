const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** True when fetch itself failed (DNS, connection refused, timeout). */
    public readonly networkError: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** "We hit the API and it said 404" — distinct from "couldn't reach API". */
  get isNotFound(): boolean {
    return !this.networkError && this.status === 404;
  }

  /** "API is unreachable" — show a service-unavailable banner, not a 404 page. */
  get isUnreachable(): boolean {
    return this.networkError || this.status >= 500 || this.status === 503;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      next: { revalidate: 60 },
    });
  } catch (err) {
    // Connection refused, DNS, timeout — API is unreachable.
    const message = err instanceof Error ? err.message : "Network error";
    throw new ApiError(0, message, true);
  }

  if (!res.ok) {
    throw new ApiError(res.status, `API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
