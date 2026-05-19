import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { createHash, randomBytes } from "node:crypto";
import {
  appListings,
  apps,
  enterpriseCohorts,
  enterpriseCohortMembers,
  enterpriseCohortPins,
  enterpriseEnrollmentTokens,
  enterpriseOrgAllowlist,
  enterpriseOrgBlocklist,
  enterpriseOrgMembers,
  enterpriseOrgs,
  users,
} from "@openmarket/db/schema";
import {
  enterpriseAllowlistAddSchema,
  enterpriseCohortCreateSchema,
  enterpriseCohortPinSchema,
  enterpriseEnrollmentConsumeSchema,
  enterpriseEnrollmentTokenCreateSchema,
  enterpriseMemberInviteSchema,
  enterpriseOrgCreateSchema,
  enterpriseOrgPatchSchema,
  type OrgRole,
} from "@openmarket/contracts/enterprise";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import type { Variables } from "../lib/types";

export const enterpriseRouter = new Hono<{ Variables: Variables }>();

/**
 * Enterprise / private store (P4-I).
 *
 *   POST   /admin/enterprise/orgs                 (platform admin)
 *                                                 mint a new org
 *   PATCH  /enterprise/orgs/:id                   (org owner) update
 *                                                 branding + policy
 *   GET    /enterprise/orgs/:id                   (member) basic info
 *
 *   POST   /enterprise/orgs/:id/members           (org admin) invite
 *   DELETE /enterprise/orgs/:id/members/:userId   (org admin) remove
 *
 *   POST   /enterprise/orgs/:id/allowlist         (org admin) pin app
 *   DELETE /enterprise/orgs/:id/allowlist/:appId  (org admin) unpin
 *
 *   POST   /enterprise/orgs/:id/cohorts           (org admin) create
 *   POST   /enterprise/cohorts/:id/pins           (org admin) pin app
 *   POST   /enterprise/cohorts/:id/members        (org admin) add user
 *
 *   POST   /enterprise/orgs/:id/enrollment-tokens (org admin) mint
 *   POST   /enterprise/enroll                     (device) consume
 *
 *   GET    /enterprise/orgs/by-slug/:slug/catalog (member, white-label
 *                                                 catalog feed)
 */

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  member: 0,
  approver: 1,
  admin: 2,
  owner: 3,
};

function roleAtLeast(actual: OrgRole, required: OrgRole) {
  return ORG_ROLE_RANK[actual] >= ORG_ROLE_RANK[required];
}

async function findOrgMember(orgId: string, userEmail: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, userEmail.toLowerCase()),
  });
  if (!user) return null;
  const membership = await db.query.enterpriseOrgMembers.findFirst({
    where: and(
      eq(enterpriseOrgMembers.orgId, orgId),
      eq(enterpriseOrgMembers.userId, user.id),
    ),
  });
  if (!membership) return null;
  return { user, membership };
}

async function requireOrgRole(
  orgId: string,
  userEmail: string,
  required: OrgRole,
) {
  const ctx = await findOrgMember(orgId, userEmail);
  if (!ctx) {
    throw new HTTPException(403, { message: "Not a member of this org" });
  }
  if (!roleAtLeast(ctx.membership.role as OrgRole, required)) {
    throw new HTTPException(403, {
      message: `Required role ${required}; you have ${ctx.membership.role}`,
    });
  }
  return ctx;
}

/* -------------------------------------------------------------------------
 *  ORG LIFECYCLE — platform admin
 * ----------------------------------------------------------------------- */

enterpriseRouter.post(
  "/admin/enterprise/orgs",
  requireAuth,
  requireAdmin,
  zValidator("json", enterpriseOrgCreateSchema),
  async (c) => {
    const input = c.req.valid("json");

    const existing = await db.query.enterpriseOrgs.findFirst({
      where: eq(enterpriseOrgs.slug, input.slug),
    });
    if (existing) {
      throw new HTTPException(409, { message: "Slug already in use" });
    }

    const [org] = await db
      .insert(enterpriseOrgs)
      .values({
        slug: input.slug,
        displayName: input.displayName,
        logoUrl: input.logoUrl ?? null,
        primaryColor: input.primaryColor ?? "#0F172A",
        supportEmail: input.supportEmail ?? null,
        policyMode: input.policyMode,
        requirePrivateNetwork: input.requirePrivateNetwork,
      })
      .returning();
    return c.json({ org }, 201);
  },
);

enterpriseRouter.patch(
  "/enterprise/orgs/:id",
  requireAuth,
  zValidator("json", enterpriseOrgPatchSchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    await requireOrgRole(id, user.email, "owner");
    const input = c.req.valid("json");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl ?? null;
    if (input.primaryColor !== undefined)
      patch.primaryColor = input.primaryColor;
    if (input.supportEmail !== undefined)
      patch.supportEmail = input.supportEmail ?? null;
    if (input.policyMode !== undefined) patch.policyMode = input.policyMode;
    if (input.requirePrivateNetwork !== undefined)
      patch.requirePrivateNetwork = input.requirePrivateNetwork;

    const [updated] = await db
      .update(enterpriseOrgs)
      .set(patch)
      .where(eq(enterpriseOrgs.id, id))
      .returning();
    return c.json({ org: updated });
  },
);

enterpriseRouter.get(
  "/enterprise/orgs/:id",
  requireAuth,
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    const ctx = await findOrgMember(id, user.email);
    if (!ctx) {
      throw new HTTPException(403, { message: "Not a member of this org" });
    }
    const org = await db.query.enterpriseOrgs.findFirst({
      where: eq(enterpriseOrgs.id, id),
    });
    if (!org) throw new HTTPException(404, { message: "Org not found" });
    return c.json({ org, role: ctx.membership.role });
  },
);

/* -------------------------------------------------------------------------
 *  MEMBERSHIP
 * ----------------------------------------------------------------------- */

enterpriseRouter.post(
  "/enterprise/orgs/:id/members",
  requireAuth,
  zValidator("json", enterpriseMemberInviteSchema),
  async (c) => {
    const orgId = c.req.param("id") as string;
    const user = c.get("user");
    await requireOrgRole(orgId, user.email, "admin");
    const input = c.req.valid("json");

    const targetUser = await db.query.users.findFirst({
      where: eq(users.email, input.userEmail.toLowerCase()),
    });
    if (!targetUser) {
      throw new HTTPException(404, {
        message: "User must have an OpenMarket account before being invited",
      });
    }

    const existing = await db.query.enterpriseOrgMembers.findFirst({
      where: and(
        eq(enterpriseOrgMembers.orgId, orgId),
        eq(enterpriseOrgMembers.userId, targetUser.id),
      ),
    });
    if (existing) {
      return c.json({ member: existing });
    }

    const [member] = await db
      .insert(enterpriseOrgMembers)
      .values({
        orgId,
        userId: targetUser.id,
        role: input.role,
        externalId: input.externalId ?? null,
      })
      .returning();
    return c.json({ member }, 201);
  },
);

/* -------------------------------------------------------------------------
 *  ALLOW / BLOCK LIST
 * ----------------------------------------------------------------------- */

enterpriseRouter.post(
  "/enterprise/orgs/:id/allowlist",
  requireAuth,
  zValidator("json", enterpriseAllowlistAddSchema),
  async (c) => {
    const orgId = c.req.param("id") as string;
    const user = c.get("user");
    const ctx = await requireOrgRole(orgId, user.email, "admin");
    const input = c.req.valid("json");

    // App must exist + not be delisted at the platform level. Orgs can
    // pin experimental-tier apps for their internal users; we only
    // refuse the truly-removed ones.
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, input.appId),
    });
    if (!app) throw new HTTPException(404, { message: "App not found" });
    if (app.isDelisted) {
      throw new HTTPException(409, {
        message: "Delisted apps cannot be added to a private catalog",
      });
    }

    const existing = await db.query.enterpriseOrgAllowlist.findFirst({
      where: and(
        eq(enterpriseOrgAllowlist.orgId, orgId),
        eq(enterpriseOrgAllowlist.appId, input.appId),
      ),
    });
    if (existing) {
      const [updated] = await db
        .update(enterpriseOrgAllowlist)
        .set({ autoApprove: input.autoApprove })
        .where(eq(enterpriseOrgAllowlist.id, existing.id))
        .returning();
      return c.json({ entry: updated });
    }

    const [entry] = await db
      .insert(enterpriseOrgAllowlist)
      .values({
        orgId,
        appId: input.appId,
        pinnedBy: ctx.user.id,
        autoApprove: input.autoApprove,
      })
      .returning();
    return c.json({ entry }, 201);
  },
);

enterpriseRouter.delete(
  "/enterprise/orgs/:id/allowlist/:appId",
  requireAuth,
  async (c) => {
    const orgId = c.req.param("id") as string;
    const appId = c.req.param("appId") as string;
    const user = c.get("user");
    await requireOrgRole(orgId, user.email, "admin");

    await db
      .delete(enterpriseOrgAllowlist)
      .where(
        and(
          eq(enterpriseOrgAllowlist.orgId, orgId),
          eq(enterpriseOrgAllowlist.appId, appId),
        ),
      );
    return c.json({ deleted: true });
  },
);

/* -------------------------------------------------------------------------
 *  COHORTS
 * ----------------------------------------------------------------------- */

enterpriseRouter.post(
  "/enterprise/orgs/:id/cohorts",
  requireAuth,
  zValidator("json", enterpriseCohortCreateSchema),
  async (c) => {
    const orgId = c.req.param("id") as string;
    const user = c.get("user");
    await requireOrgRole(orgId, user.email, "admin");
    const input = c.req.valid("json");

    const existing = await db.query.enterpriseCohorts.findFirst({
      where: and(
        eq(enterpriseCohorts.orgId, orgId),
        eq(enterpriseCohorts.name, input.name),
      ),
    });
    if (existing) {
      throw new HTTPException(409, { message: "Cohort name already in use" });
    }

    const [cohort] = await db
      .insert(enterpriseCohorts)
      .values({
        orgId,
        name: input.name,
        description: input.description ?? null,
        selfServe: input.selfServe,
      })
      .returning();
    return c.json({ cohort }, 201);
  },
);

enterpriseRouter.post(
  "/enterprise/cohorts/:id/pins",
  requireAuth,
  zValidator("json", enterpriseCohortPinSchema),
  async (c) => {
    const cohortId = c.req.param("id") as string;
    const user = c.get("user");
    const cohort = await db.query.enterpriseCohorts.findFirst({
      where: eq(enterpriseCohorts.id, cohortId),
    });
    if (!cohort) throw new HTTPException(404, { message: "Cohort not found" });
    await requireOrgRole(cohort.orgId, user.email, "admin");

    const input = c.req.valid("json");

    // Pinned app must be in the org's allow-list — keeps cohort pins
    // coherent with the org policy.
    const allowed = await db.query.enterpriseOrgAllowlist.findFirst({
      where: and(
        eq(enterpriseOrgAllowlist.orgId, cohort.orgId),
        eq(enterpriseOrgAllowlist.appId, input.appId),
      ),
    });
    if (!allowed) {
      throw new HTTPException(409, {
        message:
          "Pin the app to the org's allow-list before pinning it to a cohort",
      });
    }

    const [pin] = await db
      .insert(enterpriseCohortPins)
      .values({
        cohortId,
        appId: input.appId,
        required: input.required,
      })
      .onConflictDoUpdate({
        target: [enterpriseCohortPins.cohortId, enterpriseCohortPins.appId],
        set: { required: input.required },
      })
      .returning();
    return c.json({ pin }, 201);
  },
);

enterpriseRouter.post(
  "/enterprise/cohorts/:id/members",
  requireAuth,
  zValidator(
    "json",
    enterpriseMemberInviteSchema.pick({ userEmail: true }),
  ),
  async (c) => {
    const cohortId = c.req.param("id") as string;
    const user = c.get("user");
    const input = c.req.valid("json");

    const cohort = await db.query.enterpriseCohorts.findFirst({
      where: eq(enterpriseCohorts.id, cohortId),
    });
    if (!cohort) throw new HTTPException(404, { message: "Cohort not found" });
    await requireOrgRole(cohort.orgId, user.email, "admin");

    const target = await db.query.users.findFirst({
      where: eq(users.email, input.userEmail.toLowerCase()),
    });
    if (!target) throw new HTTPException(404, { message: "User not found" });

    const member = await db.query.enterpriseOrgMembers.findFirst({
      where: and(
        eq(enterpriseOrgMembers.orgId, cohort.orgId),
        eq(enterpriseOrgMembers.userId, target.id),
      ),
    });
    if (!member) {
      throw new HTTPException(409, {
        message: "User must be an org member before joining a cohort",
      });
    }

    const [row] = await db
      .insert(enterpriseCohortMembers)
      .values({ cohortId, userId: target.id })
      .onConflictDoNothing()
      .returning();
    return c.json({ member: row ?? { cohortId, userId: target.id } }, 201);
  },
);

/* -------------------------------------------------------------------------
 *  ENROLLMENT TOKENS (MDM bootstrap)
 * ----------------------------------------------------------------------- */

function hashToken(plain: string) {
  return createHash("sha256").update(plain).digest("hex");
}

enterpriseRouter.post(
  "/enterprise/orgs/:id/enrollment-tokens",
  requireAuth,
  zValidator("json", enterpriseEnrollmentTokenCreateSchema),
  async (c) => {
    const orgId = c.req.param("id") as string;
    const user = c.get("user");
    const ctx = await requireOrgRole(orgId, user.email, "admin");
    const input = c.req.valid("json");

    if (input.cohortId) {
      const cohort = await db.query.enterpriseCohorts.findFirst({
        where: and(
          eq(enterpriseCohorts.id, input.cohortId),
          eq(enterpriseCohorts.orgId, orgId),
        ),
      });
      if (!cohort) {
        throw new HTTPException(404, {
          message: "Cohort not found in this org",
        });
      }
    }

    const plain = randomBytes(24).toString("base64url");
    const expiresAt = new Date(
      Date.now() + input.expiresInHours * 60 * 60 * 1000,
    );
    const [token] = await db
      .insert(enterpriseEnrollmentTokens)
      .values({
        orgId,
        tokenHash: hashToken(plain),
        cohortId: input.cohortId ?? null,
        expiresAt,
        maxUses: input.maxUses ?? null,
        createdBy: ctx.user.id,
      })
      .returning();
    // Return the plaintext exactly once. Subsequent reads can only see
    // the hash, by design.
    return c.json({ token: plain, expiresAt, id: token?.id }, 201);
  },
);

enterpriseRouter.post(
  "/enterprise/enroll",
  zValidator("json", enterpriseEnrollmentConsumeSchema),
  async (c) => {
    const input = c.req.valid("json");
    const hash = hashToken(input.token);

    const token = await db.query.enterpriseEnrollmentTokens.findFirst({
      where: eq(enterpriseEnrollmentTokens.tokenHash, hash),
    });
    if (!token) {
      throw new HTTPException(401, { message: "Unknown enrollment token" });
    }
    if (token.expiresAt < new Date()) {
      throw new HTTPException(401, { message: "Enrollment token expired" });
    }
    const maxUses = token.maxUses ?? 1;
    if (token.usesCount >= maxUses) {
      throw new HTTPException(401, {
        message: "Enrollment token has reached its use limit",
      });
    }

    const org = await db.query.enterpriseOrgs.findFirst({
      where: eq(enterpriseOrgs.id, token.orgId),
    });
    if (!org) {
      throw new HTTPException(500, { message: "Token org no longer exists" });
    }

    await db
      .update(enterpriseEnrollmentTokens)
      .set({
        usesCount: sql`${enterpriseEnrollmentTokens.usesCount} + 1`,
        consumedAt: token.usesCount + 1 >= maxUses ? new Date() : null,
      })
      .where(eq(enterpriseEnrollmentTokens.id, token.id));

    return c.json({
      org: {
        id: org.id,
        slug: org.slug,
        displayName: org.displayName,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
      },
      cohortId: token.cohortId,
      deviceId: input.deviceId,
    });
  },
);

/* -------------------------------------------------------------------------
 *  PUBLIC-ish — white-label catalog feed
 * ----------------------------------------------------------------------- */

enterpriseRouter.get(
  "/enterprise/orgs/by-slug/:slug/catalog",
  requireAuth,
  async (c) => {
    const slug = c.req.param("slug") as string;
    const user = c.get("user");

    const org = await db.query.enterpriseOrgs.findFirst({
      where: eq(enterpriseOrgs.slug, slug),
    });
    if (!org) throw new HTTPException(404, { message: "Org not found" });

    const ctx = await findOrgMember(org.id, user.email);
    if (!ctx) {
      throw new HTTPException(403, { message: "Not a member of this org" });
    }

    // v1 catalog assembly: allow-list joined to app + current listing.
    // Blocklist + trusted-publishers policy modes still serve from the
    // allow-list in v1 — the storefront layer will additionally filter
    // the public catalog through the blocklist when those modes ship.
    const rows = await db
      .select({
        app: apps,
        listing: appListings,
        allowlist: enterpriseOrgAllowlist,
      })
      .from(enterpriseOrgAllowlist)
      .innerJoin(apps, eq(apps.id, enterpriseOrgAllowlist.appId))
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(
        and(
          eq(enterpriseOrgAllowlist.orgId, org.id),
          eq(apps.isDelisted, false),
        ),
      )
      .orderBy(desc(enterpriseOrgAllowlist.pinnedAt))
      .limit(500);

    // Surface required-pins for the user's cohorts so the storefront
    // can render them as "Required by your org".
    const myCohorts = await db
      .select({ cohortId: enterpriseCohortMembers.cohortId })
      .from(enterpriseCohortMembers)
      .where(eq(enterpriseCohortMembers.userId, ctx.user.id));
    const cohortIds = myCohorts.map((r) => r.cohortId);
    let requiredAppIds = new Set<string>();
    if (cohortIds.length > 0) {
      const pins = await db
        .select({ appId: enterpriseCohortPins.appId })
        .from(enterpriseCohortPins)
        .where(
          and(
            inArray(enterpriseCohortPins.cohortId, cohortIds),
            eq(enterpriseCohortPins.required, true),
          ),
        );
      requiredAppIds = new Set(pins.map((p) => p.appId));
    }

    return c.json({
      org: {
        id: org.id,
        slug: org.slug,
        displayName: org.displayName,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        supportEmail: org.supportEmail,
      },
      apps: rows.map(({ app, listing, allowlist }) => ({
        id: app.id,
        title: listing.title,
        iconUrl: listing.iconUrl,
        shortDescription: listing.shortDescription,
        category: listing.category,
        autoApprove: allowlist.autoApprove,
        required: requiredAppIds.has(app.id),
      })),
    });
  },
);

// Touch the blocklist import so future blocklist-mode endpoints have it
// at hand without re-importing.
export const _enterpriseBlocklistRef = enterpriseOrgBlocklist;
