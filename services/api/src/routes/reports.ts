import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import { reports, users } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import type { Variables } from "../lib/types";

export const reportsRouter = new Hono<{ Variables: Variables }>();

const createReportSchema = z.object({
  targetType: z.enum(["app", "release", "developer", "review"]),
  targetId: z.string().uuid(),
  reportType: z.enum([
    "malware",
    "scam",
    "impersonation",
    "illegal",
    "spam",
    "broken",
    "other",
  ]),
  description: z.string().min(1),
});

const updateReportSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]),
  resolutionNotes: z.string().optional(),
});

// Helper: find or create user record by auth user email
async function findOrCreateUser(email: string, authUserId: string) {
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({ email, authProvider: "better-auth", authProviderId: authUserId })
      .returning();
    user = created;
  }

  return user;
}

// POST /reports — submit a report (auth required)
reportsRouter.post(
  "/reports",
  requireAuth,
  zValidator("json", createReportSchema),
  async (c) => {
    const authUser = c.get("user");
    const body = c.req.valid("json");

    const user = await findOrCreateUser(authUser.email, authUser.id);

    const [report] = await db
      .insert(reports)
      .values({
        targetType: body.targetType,
        targetId: body.targetId,
        reporterId: user.id,
        reportType: body.reportType,
        description: body.description,
      })
      .returning();

    return c.json(report, 201);
  }
);

// GET /reports — list all reports, admin only
reportsRouter.get("/reports", requireAdmin, async (c) => {
  const status = c.req.query("status") as
    | "open"
    | "investigating"
    | "resolved"
    | "dismissed"
    | undefined;

  const allReports = await db.query.reports.findMany({
    where: status ? eq(reports.status, status) : undefined,
  });

  return c.json(allReports);
});

// PATCH /reports/:id — update report status, admin only
reportsRouter.patch(
  "/reports/:id",
  requireAdmin,
  zValidator("json", updateReportSchema),
  async (c) => {
    const reportId = c.req.param("id");
    const body = c.req.valid("json");

    const report = await db.query.reports.findFirst({
      where: eq(reports.id, reportId),
    });

    if (!report) {
      throw new HTTPException(404, { message: "Report not found" });
    }

    const [updated] = await db
      .update(reports)
      .set({
        status: body.status,
        ...(body.resolutionNotes !== undefined && {
          resolutionNotes: body.resolutionNotes,
        }),
        ...(["resolved", "dismissed"].includes(body.status) && {
          resolvedAt: new Date(),
        }),
      })
      .where(eq(reports.id, reportId))
      .returning();

    return c.json(updated);
  }
);
