export interface SuspiciousCombination {
  permissions: string[];
  reason: string;
}

const DANGEROUS_PERMISSIONS = new Set([
  "CAMERA",
  "RECORD_AUDIO",
  "READ_SMS",
  "SEND_SMS",
  "RECEIVE_SMS",
  "CALL_PHONE",
  "READ_CALL_LOG",
  "READ_CONTACTS",
  "WRITE_CONTACTS",
  "ACCESS_FINE_LOCATION",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "READ_PHONE_STATE",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "BODY_SENSORS",
  "READ_CALENDAR",
  "WRITE_CALENDAR",
]);

const SENSITIVE_CAPABILITIES = new Set([
  "BIND_ACCESSIBILITY_SERVICE",
  "SYSTEM_ALERT_WINDOW",
  "BIND_DEVICE_ADMIN",
  "REQUEST_INSTALL_PACKAGES",
  "BIND_VPN_SERVICE",
]);

// Normalise: strip android.permission. prefix, uppercase
function normalise(permission: string): string {
  return permission.replace(/^android\.permission\./i, "").toUpperCase();
}

export function isDangerousPermission(permission: string): boolean {
  const p = normalise(permission);
  return DANGEROUS_PERMISSIONS.has(p) || SENSITIVE_CAPABILITIES.has(p);
}

type Combo = {
  requires: string[];
  reason: string;
};

const SUSPICIOUS_COMBOS: Combo[] = [
  { requires: ["CAMERA", "INTERNET"], reason: "Camera access combined with internet could enable covert surveillance" },
  { requires: ["READ_SMS", "INTERNET"], reason: "SMS access combined with internet could exfiltrate messages" },
  { requires: ["SEND_SMS", "INTERNET"], reason: "SMS sending combined with internet could be used for toll fraud" },
  { requires: ["RECEIVE_SMS", "INTERNET"], reason: "SMS receiving combined with internet could intercept OTPs" },
  { requires: ["BIND_ACCESSIBILITY_SERVICE", "SYSTEM_ALERT_WINDOW"], reason: "Accessibility + overlay is a known attack vector for credential theft" },
  { requires: ["BIND_ACCESSIBILITY_SERVICE", "INTERNET"], reason: "Accessibility combined with internet could exfiltrate UI data" },
  { requires: ["CALL_PHONE", "INTERNET"], reason: "Phone call access combined with internet could enable toll fraud" },
];

export function detectSuspiciousCombinations(permissions: string[]): SuspiciousCombination[] {
  const normalised = new Set(permissions.map(normalise));
  const results: SuspiciousCombination[] = [];

  for (const combo of SUSPICIOUS_COMBOS) {
    if (combo.requires.every((r) => normalised.has(r))) {
      results.push({ permissions: combo.requires, reason: combo.reason });
    }
  }

  return results;
}

export function scorePermissions(permissions: string[]): number {
  const normalised = permissions.map(normalise);
  let score = 0;

  for (const p of normalised) {
    if (DANGEROUS_PERMISSIONS.has(p)) {
      score += 2;
    } else if (SENSITIVE_CAPABILITIES.has(p)) {
      score += 5;
    }
  }

  return Math.min(score, 15);
}
