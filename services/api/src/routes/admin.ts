import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, asc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  releases,
  developers,
  moderationActions,
  releaseArtifacts,
  scanResults,
} from "@openmarket/db/schema";
import { requireAdmin } from "../middleware/admin";
import { notifyQueue } from "../lib/queue";
import { enqueueEmail } from "../lib/email";
import type { Variables } from "../lib/types";

export const adminRouter = new Hono<{ Variables: Variables }>();

const approveRejectSchema = z.object({
  reason: z.string().optional(),
});

const suspendSchema = z.object({
  reason: z.string().min(1),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// GET /admin/risk-queue — releases in "review" status with latest scan risk score
adminRouter.get("/admin/risk-queue", requireAdmin, async (c) => {
  // Get all releases in review status
  const reviewReleases = await db.query.releases.findMany({
    where: eq(releases.status, "review"),
    with: {
      app: {
        columns: { id: true, packageName: true },
      },
      artifacts: {
        columns: { id: true },
        limit: 1,
      },
    },
  });

  // For each release, get its latest artifact's scan result
  const queue = await Promise.all(
    reviewReleases.map(async (release) => {
      const artifact = release.artifacts?.[0] as any;
      let latestScan = null;

      if (artifact) {
        latestScan = await db.query.scanResults.findFirst({
          where: eq(scanResults.artifactId, artifact.id),
          orderBy: [desc(scanResults.createdAt)],
        });
      }

      return {
        ...release,
        artifacts: undefined,
        riskScore: latestScan?.riskScore ?? null,
        scanStatus: latestScan?.status ?? null,
        scanSummary: latestScan?.summary ?? null,
      };
    })
  );

  // Sort by risk score descending (nulls last)
  queue.sort((a, b) => {
    if (a.riskScore === null && b.riskScore === null) return 0;
    if (a.riskScore === null) return 1;
    if (b.riskScore === null) return -1;
    return b.riskScore - a.riskScore;
  });

  return c.json(queue);
});

// POST /admin/releases/:id/approve — approve a release
adminRouter.post(
  "/admin/releases/:id/approve",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const releaseId = c.req.param("id");

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }

    // Find the developer record for the moderator (for reviewedBy FK)
    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(releases)
      .set({
        status: "published",
        reviewedBy: moderator?.id ?? null,
        reviewedAt: new Date(),
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(releases.id, releaseId))
      .returning();

    await notifyQueue.add("notify", {
      type: "release_approved",
      releaseId,
      appId: release.appId,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

// POST /admin/releases/:id/reject — reject a release (back to draft)
adminRouter.post(
  "/admin/releases/:id/reject",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const releaseId = c.req.param("id");
    const body = c.req.valid("json");

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(releases)
      .set({
        status: "draft",
        reviewedBy: moderator?.id ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(releases.id, releaseId))
      .returning();

    // Log moderation action if we have a moderator record
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "release",
        targetId: releaseId,
        action: "delist_release",
        reason: body.reason ?? "Release rejected during review",
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "release_rejected",
      releaseId,
      appId: release.appId,
      reason: body.reason ?? null,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

// POST /admin/developers/:id/suspend — suspend a developer
adminRouter.post(
  "/admin/developers/:id/suspend",
  requireAdmin,
  zValidator("json", suspendSchema),
  async (c) => {
    const authUser = c.get("user");
    const developerId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.id, developerId),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(developers)
      .set({
        trustLevel: "suspended",
        suspensionReason: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(developers.id, developerId))
      .returning();

    // Log moderation action
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "developer",
        targetId: developerId,
        action: "suspend_developer",
        reason: body.reason,
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "developer_suspended",
      developerId,
      reason: body.reason,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

// POST /admin/developers/:id/reinstate — reinstate a suspended developer
adminRouter.post(
  "/admin/developers/:id/reinstate",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const developerId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.id, developerId),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(developers)
      .set({
        trustLevel: "experimental",
        suspensionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(developers.id, developerId))
      .returning();

    // Log moderation action
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "developer",
        targetId: developerId,
        action: "reinstate",
        reason: body.reason ?? "Developer reinstated",
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "developer_reinstated",
      developerId,
      reason: body.reason ?? null,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

// GET /admin/audit-log — list moderation actions, paginated
adminRouter.get(
  "/admin/audit-log",
  requireAdmin,
  zValidator("query", auditLogQuerySchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const actions = await db.query.moderationActions.findMany({
      orderBy: [desc(moderationActions.createdAt)],
      limit,
      offset,
    });

    return c.json({ page, limit, data: actions });
  }
);

// POST /admin/test-email — send a test email through the queue (any template)
const testEmailSchema = z.object({
  to: z.string().email(),
  template: z.enum([
    "welcome",
    "verify-email",
    "password-reset",
    "release-published",
    "release-rejected",
    "report-resolved",
    "developer-takedown",
    "review-response",
  ]),
});

adminRouter.post(
  "/admin/test-email",
  requireAdmin,
  zValidator("json", testEmailSchema),
  async (c) => {
    const { to, template } = c.req.valid("json");

    // Default props per template, sufficient to render an exemplar email.
    const propsByTemplate = {
      welcome: { recipientName: "Test User", ctaUrl: "https://openmarket.app" },
      "verify-email": {
        verifyUrl: "https://openmarket.app/verify?token=test",
        expiryMinutes: 60,
      },
      "password-reset": {
        resetUrl: "https://openmarket.app/reset?token=test",
        expiryMinutes: 30,
        ipAddress: "127.0.0.1",
      },
      "release-published": {
        appName: "TestApp",
        versionName: "1.0.0",
        versionCode: 1,
        releaseUrl: "https://openmarket.app/apps/com.test",
        riskScore: 12,
      },
      "release-rejected": {
        appName: "TestApp",
        versionName: "1.0.0",
        versionCode: 1,
        reason: "Test rejection — declared permissions don't match the manifest.",
        findings: ["Missing data-safety entry", "Below minimum SDK"],
        fixUrl: "https://dev.openmarket.app/apps/test",
        appealUrl: "https://dev.openmarket.app/apps/test/appeal",
      },
      "report-resolved": {
        reportId: "00000000-0000-0000-0000-000000000000",
        targetType: "app",
        resolution: "delisted" as const,
        notes: "Test resolution notes.",
        transparencyUrl: "https://openmarket.app/transparency-report",
      },
      "developer-takedown": {
        appName: "TestApp",
        reason: "Test takedown — repackaged copy.",
        ruleVersion: "v2026-01",
        rulesUrl: "https://openmarket.app/content-policy",
        appealUrl: "https://dev.openmarket.app/appeals/new",
        effectiveAt: new Date().toISOString().slice(0, 10),
      },
      "review-response": {
        appName: "TestApp",
        developerName: "Acme Inc.",
        responseBody: "Thanks for the feedback!",
        reviewUrl: "https://openmarket.app/apps/com.test#reviews",
      },
    } as const;

    const props = propsByTemplate[template];
    const result = await enqueueEmail({
      template,
      to,
      props: props as never,
      tags: [{ name: "category", value: "test" }],
    });

    return c.json({ success: true, jobId: result.jobId, template, to });
  },
);
