import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  notificationLog,
  pushSubscriptions,
  users,
} from "@openmarket/db/schema";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesPatchSchema,
  pushSubscriptionInputSchema,
  type NotificationPreferences,
} from "@openmarket/contracts/push";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { revokeSubscriptions } from "../lib/push";
import type { Variables } from "../lib/types";

export const pushRouter = new Hono<{ Variables: Variables }>();

/**
 * Storefront-facing push notification endpoints (P2-P).
 *
 *   POST   /users/me/push-subscriptions       — register a new subscription
 *   GET    /users/me/push-subscriptions       — list active subscriptions
 *   DELETE /users/me/push-subscriptions/:id   — revoke a single subscription
 *   GET    /users/me/notification-preferences — read prefs (with defaults)
 *   PATCH  /users/me/notification-preferences — update prefs
 *   GET    /users/me/notifications            — recent in-app log
 */

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

pushRouter.post(
  "/users/me/push-subscriptions",
  requireAuth,
  zValidator("json", pushSubscriptionInputSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    // Endpoint is unique — re-registering reuses (and reactivates) the row.
    const existing = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.endpoint, body.endpoint),
    });
    if (existing) {
      if (existing.userId !== profile.id) {
        throw new HTTPException(409, {
          message: "This subscription is registered to a different account",
        });
      }
      await db
        .update(pushSubscriptions)
        .set({
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: c.req.header("user-agent") ?? null,
          lastSeenAt: new Date(),
          revokedAt: null,
        })
        .where(eq(pushSubscriptions.id, existing.id));
      return c.json({ success: true, id: existing.id, status: "reactivated" });
    }

    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId: profile.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: c.req.header("user-agent") ?? null,
      })
      .returning({ id: pushSubscriptions.id });
    return c.json({ success: true, id: row!.id, status: "created" }, 201);
  },
);

pushRouter.get("/users/me/push-subscriptions", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const rows = await db
    .select({
      id: pushSubscriptions.id,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
      lastSeenAt: pushSubscriptions.lastSeenAt,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, profile.id),
        isNull(pushSubscriptions.revokedAt),
      ),
    )
    .orderBy(desc(pushSubscriptions.lastSeenAt));

  return c.json({ subscriptions: rows });
});

pushRouter.delete(
  "/users/me/push-subscriptions/:id",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const subId = c.req.param("id") as string;
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const revoked = await revokeSubscriptions(profile.id, [subId]);
    if (revoked === 0) {
      throw new HTTPException(404, {
        message: "Subscription not found or already revoked",
      });
    }
    return c.json({ success: true });
  },
);

pushRouter.get("/users/me/notification-preferences", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const prefs = (profile.notificationPreferences ??
    DEFAULT_NOTIFICATION_PREFERENCES) as NotificationPreferences;

  return c.json(prefs);
});

pushRouter.patch(
  "/users/me/notification-preferences",
  requireAuth,
  zValidator("json", notificationPreferencesPatchSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const current = (profile.notificationPreferences ??
      DEFAULT_NOTIFICATION_PREFERENCES) as NotificationPreferences;

    const next: NotificationPreferences = {
      email: { ...current.email, ...(body.email ?? {}) },
      push: { ...current.push, ...(body.push ?? {}) },
    };

    await db
      .update(users)
      .set({ notificationPreferences: next, updatedAt: new Date() })
      .where(eq(users.id, profile.id));

    return c.json(next);
  },
);

pushRouter.get("/users/me/notifications", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const rows = await db
    .select({
      id: notificationLog.id,
      type: notificationLog.type,
      status: notificationLog.status,
      payload: notificationLog.payload,
      sentAt: notificationLog.sentAt,
    })
    .from(notificationLog)
    .where(eq(notificationLog.userId, profile.id))
    .orderBy(desc(notificationLog.sentAt))
    .limit(50);

  return c.json({ notifications: rows });
});
