import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { healthRouter } from "../routes/health";

const app = new Hono();
app.route("/", healthRouter);

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("openmarket-api");
    expect(body.timestamp).toBeDefined();
  });
});
