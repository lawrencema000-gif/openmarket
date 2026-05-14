import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  apps,
  familyMembers,
  libraryEntries,
} from "@openmarket/db/schema";
import { db } from "./db";

export function generateFamilyInviteToken(): string {
  return `om_fam_${randomBytes(24).toString("hex")}`;
}

/**
 * Fan an installed app out to the family-group members when:
 *   - the installing user is the owner of a family group
 *   - the app has `familySharingEnabled = true`
 *
 * Creates one library_entries row per active member who doesn't yet
 * have one. Idempotent: a second call with the same args is a no-op
 * because of the existing-row check.
 *
 * Members who installed the app independently keep their original
 * row untouched — we DO NOT mark their entry as "shared", since
 * they own it on their own merits.
 */
export async function fanOutFamilyShareToMembers(
  ownerUserId: string,
  appId: string,
): Promise<{ shared: number }> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true, familySharingEnabled: true },
  });
  if (!app?.familySharingEnabled) return { shared: 0 };

  // Find owner's family group (if any).
  const ownerMembership = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.userId, ownerUserId),
      eq(familyMembers.role, "owner"),
      isNull(familyMembers.removedAt),
    ),
  });
  if (!ownerMembership) return { shared: 0 };

  // Find every other active accepted member.
  const otherMembers = await db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyGroupId, ownerMembership.familyGroupId),
        isNull(familyMembers.removedAt),
      ),
    );

  let shared = 0;
  for (const m of otherMembers) {
    if (!m.userId || m.userId === ownerUserId) continue;
    const existing = await db.query.libraryEntries.findFirst({
      where: and(
        eq(libraryEntries.userId, m.userId),
        eq(libraryEntries.appId, appId),
      ),
    });
    if (existing) {
      // Clear an uninstalled flag if the member previously had + dropped
      // the app — they get to see it again as a shared entry.
      if (existing.uninstalledAt) {
        await db
          .update(libraryEntries)
          .set({ uninstalledAt: null, updatedAt: new Date() })
          .where(eq(libraryEntries.id, existing.id));
        shared += 1;
      }
      continue;
    }
    await db.insert(libraryEntries).values({
      userId: m.userId,
      appId,
      source: "store_app",
    });
    shared += 1;
  }

  return { shared };
}
