import { z } from "zod";

/**
 * Data-safety taxonomy. Modeled on Play Store's data-safety section
 * + Apple's privacy nutrition labels. Each label covers one
 * machine-checkable category of user data; per-category developer
 * attestations cover collected/shared/optional/purposes.
 *
 * Versioned via DATA_SAFETY_TAXONOMY_VERSION — bumping is a code
 * change paired with a transparency-event entry so historical
 * declarations remain auditable against the version they were made
 * against.
 *
 * Scope: this is the load-bearing "what data does this app collect?"
 * panel + dev-portal form + the scanner discrepancy hook. We DO NOT
 * try to encode every Play taxonomy node — we cover the categories
 * that map cleanly to dangerous Android permissions (so we can
 * cross-check) plus the canonical privacy-relevant ones (analytics,
 * crash logs, identifiers) that don't map to a permission but are
 * common.
 */

export const DATA_SAFETY_TAXONOMY_VERSION = "v2026.05.12";

/** Each label is one categorical user-data type. */
export const DATA_TYPE_SLUGS = [
  "location_precise",
  "location_approx",
  "contacts",
  "email",
  "photos",
  "camera",
  "microphone",
  "storage",
  "sms",
  "phone",
  "calendar",
  "health",
  "device_id",
  "analytics",
  "crash_logs",
  "purchase_history",
] as const;

export type DataTypeSlug = (typeof DATA_TYPE_SLUGS)[number];

export interface DataTypeMeta {
  slug: DataTypeSlug;
  label: string;
  description: string;
}

export const DATA_TYPE_META: Record<DataTypeSlug, DataTypeMeta> = {
  location_precise: {
    slug: "location_precise",
    label: "Precise location",
    description: "GPS-grade location data accurate to a few meters.",
  },
  location_approx: {
    slug: "location_approx",
    label: "Approximate location",
    description: "Coarse location, typically city- or area-level.",
  },
  contacts: {
    slug: "contacts",
    label: "Contacts",
    description: "Names, phone numbers, or email addresses from your address book.",
  },
  email: {
    slug: "email",
    label: "Email address",
    description: "Email addresses (yours, or harvested from on-device sources).",
  },
  photos: {
    slug: "photos",
    label: "Photos & videos",
    description: "Files in your photo or video library.",
  },
  camera: {
    slug: "camera",
    label: "Camera",
    description: "Live camera feed.",
  },
  microphone: {
    slug: "microphone",
    label: "Microphone",
    description: "Live audio capture.",
  },
  storage: {
    slug: "storage",
    label: "Files & documents",
    description: "Files outside the app's own sandbox.",
  },
  sms: {
    slug: "sms",
    label: "SMS messages",
    description: "Text messages stored on the device.",
  },
  phone: {
    slug: "phone",
    label: "Phone numbers",
    description: "The phone number associated with the device.",
  },
  calendar: {
    slug: "calendar",
    label: "Calendar events",
    description: "Calendar entries from system or 3rd-party providers.",
  },
  health: {
    slug: "health",
    label: "Health & fitness",
    description: "Health, body, or activity data via Health Connect or sensors.",
  },
  device_id: {
    slug: "device_id",
    label: "Device or other IDs",
    description: "Advertising ID, hardware identifiers, or installation IDs.",
  },
  analytics: {
    slug: "analytics",
    label: "App activity / analytics",
    description: "What you tap, view, or how long you use the app.",
  },
  crash_logs: {
    slug: "crash_logs",
    label: "Crash logs",
    description: "Stack traces + device context captured on crash.",
  },
  purchase_history: {
    slug: "purchase_history",
    label: "Purchase history",
    description: "In-app or external purchases the user has made.",
  },
};

export const PURPOSES = [
  "app_functionality",
  "analytics",
  "developer_communication",
  "advertising",
  "fraud_prevention",
  "compliance",
  "personalization",
] as const;

export type Purpose = (typeof PURPOSES)[number];

/**
 * Per-category attestation:
 *   - collected:  the app collects this data type at all
 *   - shared:     the app shares this data type with third parties
 *   - optional:   collection is optional (user can opt out and the
 *                 app still works)
 *   - purposes:   why the app collects it (subset of PURPOSES)
 */
export const dataTypeEntrySchema = z.object({
  collected: z.boolean(),
  shared: z.boolean().default(false),
  optional: z.boolean().default(false),
  purposes: z.array(z.enum(PURPOSES)).default([]),
});

export type DataTypeEntry = z.infer<typeof dataTypeEntrySchema>;

/**
 * Full data-safety declaration. The schema accepts a partial map —
 * only the categories the developer explicitly opts into are stored.
 * Missing categories are treated as "not collected" on the storefront
 * UI (Play Store semantics).
 */
export const dataSafetyDeclarationSchema = z.object({
  /** Master flag — if false, every other field is moot and the storefront shows "no data collected". */
  collectsData: z.boolean(),
  /** Are any of the declared types shared with third parties? */
  sharesData: z.boolean().default(false),
  /** App encrypts data in transit (TLS for every network call). */
  dataEncryptedInTransit: z.boolean().default(false),
  /** Public URL where users can request data deletion. */
  dataDeletionRequestUrl: z.string().url().optional(),
  /** Public privacy policy URL — Play Store requires this for any app collecting personal data. */
  privacyPolicyUrl: z.string().url().optional(),
  /**
   * Per-category attestations. Object keyed by DataTypeSlug. Only
   * include categories the developer wants to declare positively;
   * absence = "not collected".
   */
  dataTypes: z.record(z.enum(DATA_TYPE_SLUGS), dataTypeEntrySchema).default({}),
});

export type DataSafetyDeclaration = z.infer<typeof dataSafetyDeclarationSchema>;

/**
 * Permission → data-type mapping used by the scanner discrepancy
 * check. If the app declares a permission AND the corresponding data
 * type is marked NOT collected (or not declared at all), the admin
 * dashboard surfaces a discrepancy row.
 *
 * Bidirectional: one Android permission can hint at multiple data
 * types (e.g., RECORD_AUDIO → microphone), and one data type can be
 * served by multiple permissions (location_precise hits both
 * ACCESS_FINE_LOCATION + ACCESS_BACKGROUND_LOCATION).
 */
export const PERMISSION_TO_DATA_TYPE: Record<string, DataTypeSlug[]> = {
  "android.permission.ACCESS_FINE_LOCATION": ["location_precise"],
  "android.permission.ACCESS_COARSE_LOCATION": ["location_approx"],
  "android.permission.ACCESS_BACKGROUND_LOCATION": ["location_precise"],
  "android.permission.READ_CONTACTS": ["contacts"],
  "android.permission.WRITE_CONTACTS": ["contacts"],
  "android.permission.GET_ACCOUNTS": ["email"],
  "android.permission.READ_EXTERNAL_STORAGE": ["storage", "photos"],
  "android.permission.READ_MEDIA_IMAGES": ["photos"],
  "android.permission.READ_MEDIA_VIDEO": ["photos"],
  "android.permission.CAMERA": ["camera"],
  "android.permission.RECORD_AUDIO": ["microphone"],
  "android.permission.READ_SMS": ["sms"],
  "android.permission.SEND_SMS": ["sms"],
  "android.permission.RECEIVE_SMS": ["sms"],
  "android.permission.READ_PHONE_STATE": ["phone", "device_id"],
  "android.permission.READ_PHONE_NUMBERS": ["phone"],
  "android.permission.READ_CALENDAR": ["calendar"],
  "android.permission.WRITE_CALENDAR": ["calendar"],
  "android.permission.BODY_SENSORS": ["health"],
  "android.permission.ACTIVITY_RECOGNITION": ["health"],
};

export interface DataSafetyDiscrepancy {
  /** The permission the APK declares. */
  permission: string;
  /** Data type slugs implied by the permission. */
  expectedDataTypes: DataTypeSlug[];
  /** Subset of expected types that the developer's declaration marks "not collected". */
  missingFromDeclaration: DataTypeSlug[];
}

/**
 * Compute the discrepancy set given a permission list (from the
 * APK) and the developer's data-safety declaration. Returns one
 * entry per permission that fails the check — empty array means
 * the declaration matches the binary.
 *
 * Behavior:
 *   - if collectsData=false in the declaration but the APK has any
 *     dangerous permission, every mapped permission surfaces as a
 *     discrepancy
 *   - if collectsData=true but a specific category is missing /
 *     marked collected=false while the permission is present,
 *     that's a discrepancy
 *   - permissions with no taxonomy mapping are skipped (we don't
 *     try to flag categories we haven't modeled)
 */
export function computeDataSafetyDiscrepancies(
  permissions: string[],
  declaration: DataSafetyDeclaration | null,
): DataSafetyDiscrepancy[] {
  const discrepancies: DataSafetyDiscrepancy[] = [];

  for (const perm of permissions) {
    const mapped = PERMISSION_TO_DATA_TYPE[perm];
    if (!mapped) continue;

    if (!declaration || !declaration.collectsData) {
      // No declaration OR declaration says "no data collected" →
      // every permission with a mapped type is a discrepancy.
      discrepancies.push({
        permission: perm,
        expectedDataTypes: mapped,
        missingFromDeclaration: mapped,
      });
      continue;
    }

    const missing: DataTypeSlug[] = [];
    for (const slug of mapped) {
      const entry = declaration.dataTypes[slug];
      if (!entry || !entry.collected) missing.push(slug);
    }
    if (missing.length > 0) {
      discrepancies.push({
        permission: perm,
        expectedDataTypes: mapped,
        missingFromDeclaration: missing,
      });
    }
  }
  return discrepancies;
}
