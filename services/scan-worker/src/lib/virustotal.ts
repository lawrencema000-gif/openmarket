/**
 * VirusTotal hash-lookup escalation (API v3).
 *
 * We only look up the artifact's SHA-256 — we never upload developer
 * APKs to VT (their ToS forbids VT as a sole commercial gate and
 * uploading shares the file with all VT partners; hash lookup leaks
 * nothing that isn't already public).
 *
 * VT is the ESCALATION layer, not the hard gate (that's ClamAV):
 * lookup errors and rate limits degrade to an "unavailable" outcome
 * that surfaces as a low-weight finding instead of failing the scan.
 *
 * Config: VIRUSTOTAL_API_KEY (unset → unconfigured, scanner notes it).
 */

export type VtOutcome =
  | { status: "unconfigured" }
  | { status: "unknown" } // hash never seen by VT
  | { status: "error"; message: string }
  | {
      status: "known";
      malicious: number;
      suspicious: number;
      harmless: number;
      undetected: number;
    };

export function isVtConfigured(): boolean {
  const key = process.env.VIRUSTOTAL_API_KEY;
  return typeof key === "string" && key.length > 0;
}

export async function vtLookupHash(sha256: string): Promise<VtOutcome> {
  if (!isVtConfigured()) return { status: "unconfigured" };

  try {
    const res = await fetch(
      `https://www.virustotal.com/api/v3/files/${sha256.toLowerCase()}`,
      {
        headers: { "x-apikey": process.env.VIRUSTOTAL_API_KEY as string },
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (res.status === 404) return { status: "unknown" };
    if (!res.ok) {
      return { status: "error", message: `VirusTotal HTTP ${res.status}` };
    }

    const body = (await res.json()) as {
      data?: {
        attributes?: {
          last_analysis_stats?: {
            malicious?: number;
            suspicious?: number;
            harmless?: number;
            undetected?: number;
          };
        };
      };
    };
    const stats = body.data?.attributes?.last_analysis_stats;
    if (!stats) {
      return { status: "error", message: "VirusTotal response missing stats" };
    }
    return {
      status: "known",
      malicious: stats.malicious ?? 0,
      suspicious: stats.suspicious ?? 0,
      harmless: stats.harmless ?? 0,
      undetected: stats.undetected ?? 0,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "VirusTotal lookup failed",
    };
  }
}
