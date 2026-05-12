import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { developers, teamMembers, users } from "@openmarket/db/schema";

/**
 * Effective developer-entity context for a signed-in user.
 *
 * Resolution order:
 *   1. `developers.email` matches the user's email → role="owner".
 *      This is the original 1:1 publishing model and stays
 *      authoritative for backwards compat.
 *   2. `team_members` row where userId matches the user's id (joined
 *      via users.email) AND acceptedAt is set AND revokedAt is null.
 *      Returns the highest role across all matches (a person can be
 *      a member of multiple teams; the storefront default is the
 *      first match — multi-team navigation lands in a follow-up).
 *
 * Caller-side convention: this returns `null` when the user has no
 * publishing context. Endpoints that need a developer should
 * `throw new HTTPException(403)` on null and let the global error
 * handler render the 403 page.
 */
export interface EffectiveDeveloperContext {
  developer: typeof developers.$inferSelect;
  role: "owner" | "admin" | "developer" | "viewer";
}

const ROLE_ORDER = ["viewer", "developer", "admin", "owner"] as const;
type Role = (typeof ROLE_ORDER)[number];

export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(actual) >= ROLE_ORDER.indexOf(required);
}

export async function findEffectiveDeveloperContext(
  email: string,
): Promise<EffectiveDeveloperContext | null> {
  const normalized = email.toLowerCase();

  // Path 1: implicit owner via developers.email
  const owned = await db.query.developers.findFirst({
    where: eq(developers.email, normalized),
  });
  if (owned) return { developer: owned, role: "owner" };

  // Path 2: accepted, non-revoked team membership
  const profile = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });
  if (!profile) return null;

  const memberships = await db
    .select({
      developer: developers,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(developers, eq(developers.id, teamMembers.developerId))
    .where(
      and(
        eq(teamMembers.userId, profile.id),
        isNotNull(teamMembers.acceptedAt),
        isNull(teamMembers.revokedAt),
      ),
    );

  if (memberships.length === 0) return null;

  // Highest role wins. We don't surface the full membership list here;
  // a future /developers/me/teams endpoint will let the dashboard
  // show all teams the user belongs to.
  memberships.sort(
    (a, b) =>
      ROLE_ORDER.indexOf(b.role as Role) - ROLE_ORDER.indexOf(a.role as Role),
  );
  return {
    developer: memberships[0]!.developer,
    role: memberships[0]!.role as Role,
  };
}
