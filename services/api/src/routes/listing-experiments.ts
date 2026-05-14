import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  listingExperiments,
  listingExperimentVariants,
} from "@openmarket/db/schema";
import {
  experimentEventSchema,
  experimentInputSchema,
} from "@openmarket/contracts/listing-experiments";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import { recordExperimentEvent } from "../lib/listing-experiments";
import type { Variables } from "../lib/types";

export const listingExperimentsRouter = new Hono<{ Variables: Variables }>();

/**
 * Listing experiment endpoints (P3-B).
 *
 *   POST   /apps/:id/experiments                  — developer+ create draft
 *   GET    /apps/:id/experiments                  — viewer+ list
 *   GET    /apps/:id/experiments/:expId           — viewer+ detail (with variants)
 *   POST   /apps/:id/experiments/:expId/start     — developer+ promote draft → running
 *   POST   /apps/:id/experiments/:expId/conclude  — developer+ pick winner, stop
 *
 *   POST   /apps/:id/experiments/events           — PUBLIC; record view/install event
 */

async function ensureOwnership(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
  });
  if (!app) {
    throw new HTTPException(404, {
      message: "App not found or not owned by this publisher",
    });
  }
  return { ctx, app };
}

listingExperimentsRouter.post(
  "/apps/:id/experiments",
  requireAuth,
  zValidator("json", experimentInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Creating experiments requires developer role; you have ${ctx.role}`,
      });
    }

    // Sum-to-100 validation. We accept any split where the weights
    // sum to exactly 100 so the bucket math works without a fallback.
    const totalWeight = body.variants.reduce(
      (acc, v) => acc + v.trafficWeight,
      0,
    );
    if (totalWeight !== 100) {
      throw new HTTPException(400, {
        message: `Variant trafficWeights must sum to 100 (got ${totalWeight})`,
      });
    }
    if (body.variants.filter((v) => v.isControl).length > 1) {
      throw new HTTPException(400, {
        message: "At most one variant can be marked isControl",
      });
    }

    const [experiment] = await db
      .insert(listingExperiments)
      .values({
        appId,
        name: body.name,
        hypothesis: body.hypothesis ?? null,
        createdBy: ctx.developer.id,
      })
      .returning();

    // Insert variants serially so createdAt order matches the input
    // order — the deterministic split walker depends on it.
    for (const v of body.variants) {
      await db.insert(listingExperimentVariants).values({
        experimentId: experiment!.id,
        label: v.label,
        isControl: v.isControl,
        trafficWeight: v.trafficWeight,
        title: v.title ?? null,
        shortDescription: v.shortDescription ?? null,
        fullDescription: v.fullDescription ?? null,
        iconUrl: v.iconUrl ?? null,
        screenshots: v.screenshots ?? null,
      });
    }

    return c.json(experiment, 201);
  },
);

listingExperimentsRouter.get(
  "/apps/:id/experiments",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "viewer")) {
      throw new HTTPException(403, {
        message: "Listing experiments requires at least viewer role",
      });
    }

    const rows = await db
      .select()
      .from(listingExperiments)
      .where(eq(listingExperiments.appId, appId))
      .orderBy(desc(listingExperiments.createdAt));

    return c.json({ appId, experiments: rows });
  },
);

listingExperimentsRouter.get(
  "/apps/:id/experiments/:expId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const expId = c.req.param("expId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "viewer")) {
      throw new HTTPException(403, {
        message: "Reading experiments requires at least viewer role",
      });
    }

    const experiment = await db.query.listingExperiments.findFirst({
      where: and(
        eq(listingExperiments.id, expId),
        eq(listingExperiments.appId, appId),
      ),
    });
    if (!experiment) {
      throw new HTTPException(404, { message: "Experiment not found" });
    }
    const variants = await db
      .select()
      .from(listingExperimentVariants)
      .where(eq(listingExperimentVariants.experimentId, expId))
      .orderBy(asc(listingExperimentVariants.createdAt));

    return c.json({ experiment, variants });
  },
);

listingExperimentsRouter.post(
  "/apps/:id/experiments/:expId/start",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const expId = c.req.param("expId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Starting experiments requires developer role; you have ${ctx.role}`,
      });
    }

    const experiment = await db.query.listingExperiments.findFirst({
      where: and(
        eq(listingExperiments.id, expId),
        eq(listingExperiments.appId, appId),
      ),
    });
    if (!experiment) {
      throw new HTTPException(404, { message: "Experiment not found" });
    }
    if (experiment.status !== "draft") {
      throw new HTTPException(409, {
        message: `Only draft experiments can be started; this one is ${experiment.status}`,
      });
    }

    // At-most-one running experiment per app. Enforced here because
    // schema-level partial unique indexes aren't expressible via
    // Drizzle's current builder.
    const otherRunning = await db.query.listingExperiments.findFirst({
      where: and(
        eq(listingExperiments.appId, appId),
        eq(listingExperiments.status, "running"),
      ),
    });
    if (otherRunning) {
      throw new HTTPException(409, {
        message:
          "Another experiment is already running for this app — conclude it first",
      });
    }

    await db
      .update(listingExperiments)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(listingExperiments.id, expId));

    return c.json({ success: true, status: "running" });
  },
);

const concludeSchema = z.object({
  winnerVariantId: z.string().uuid().optional(),
});

listingExperimentsRouter.post(
  "/apps/:id/experiments/:expId/conclude",
  requireAuth,
  zValidator("json", concludeSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const expId = c.req.param("expId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Concluding experiments requires developer role; you have ${ctx.role}`,
      });
    }

    const experiment = await db.query.listingExperiments.findFirst({
      where: and(
        eq(listingExperiments.id, expId),
        eq(listingExperiments.appId, appId),
      ),
    });
    if (!experiment) {
      throw new HTTPException(404, { message: "Experiment not found" });
    }
    if (experiment.status === "concluded") {
      throw new HTTPException(409, { message: "Already concluded" });
    }

    if (body.winnerVariantId) {
      // Make sure the winner actually belongs to this experiment.
      const winner = await db.query.listingExperimentVariants.findFirst({
        where: and(
          eq(listingExperimentVariants.id, body.winnerVariantId),
          eq(listingExperimentVariants.experimentId, expId),
        ),
      });
      if (!winner) {
        throw new HTTPException(400, {
          message: "winnerVariantId doesn't belong to this experiment",
        });
      }
    }

    await db
      .update(listingExperiments)
      .set({
        status: "concluded",
        concludedAt: new Date(),
        winnerVariantId: body.winnerVariantId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(listingExperiments.id, expId));

    return c.json({ success: true, status: "concluded" });
  },
);

/**
 * Public event recorder. Storefront calls this on:
 *   - page render → type=view
 *   - install button click → type=install
 *
 * Rate limiting is delegated to the global per-IP rate limiter.
 * Spoofed events shift the conversion-rate numerator/denominator
 * but can't escalate privileges; the helper double-checks that the
 * variantId belongs to the experimentId before bumping.
 */
listingExperimentsRouter.post(
  "/apps/:id/experiments/events",
  zValidator("json", experimentEventSchema),
  async (c) => {
    const body = c.req.valid("json");
    await recordExperimentEvent(body.experimentId, body.variantId, body.type);
    return c.json({ success: true });
  },
);
