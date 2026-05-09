import { MeiliSearch } from "meilisearch";

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key";

export const client = new MeiliSearch({
  host: MEILI_URL,
  apiKey: MEILI_MASTER_KEY,
});

export const APPS_INDEX = "apps";

export interface AppDocument {
  id: string;
  packageName: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  iconUrl: string;
  developerName: string;
  developerId: string;
  trustTier: string;
  isExperimental: boolean;
  isPublished: boolean;
  /** Anti-features taxonomy slugs. Indexed as a filterable array. */
  antiFeatures: string[];
  /** Tracked install count — used as the popularity boost signal in ranking. */
  installCount: number;
  /** Average review rating × 100 (so we can sort it as an integer). */
  ratingScore: number;
  createdAt: number; // unix timestamp
  /** Most recent published-stable release time, unix seconds. Drives recency boost. */
  latestReleaseAt: number;
}

/**
 * Synonyms tuned for the Android-app domain. Bidirectional (Meili
 * applies both directions automatically). Bias is toward reducing the
 * "I typed the obvious word and got nothing" failure mode without
 * over-broadening: short colloquials → full names; common abbreviations
 * → expansions; ID-card-style queries that should hit a single category.
 */
const SYNONYMS: Record<string, string[]> = {
  calc: ["calculator"],
  calculator: ["calc"],
  sms: ["messaging", "text", "messenger"],
  messaging: ["sms", "messenger", "chat"],
  messenger: ["messaging", "sms", "chat"],
  email: ["mail"],
  mail: ["email"],
  pdf: ["document", "reader"],
  todo: ["to-do", "tasks", "task"],
  "to-do": ["todo", "tasks", "task"],
  tasks: ["todo", "to-do"],
  music: ["audio", "player"],
  audio: ["music"],
  video: ["player", "media"],
  vpn: ["proxy", "privacy"],
  password: ["pwd", "manager", "vault"],
  vault: ["password", "manager"],
  weather: ["forecast"],
  ide: ["editor", "code"],
  editor: ["ide", "code"],
};

/**
 * Ranking rules order — Meili applies them top-to-bottom. The first
 * three are Meili defaults that produce sane base behavior; the four
 * after that are our tuning:
 *
 *   - typo: typo tolerance (1 typo allowed for words ≥5 chars by default)
 *   - words: most search terms matched wins
 *   - exactness: exact-match wins over fuzzy
 *   - installCount:desc — popularity boost (the "everyone uses Calculator"
 *     signal — without this, a fresh app with the word "calculator" in
 *     its description ranks above the 10M-install Google Calculator)
 *   - ratingScore:desc — quality boost (5-star app > 1-star app on tie)
 *   - latestReleaseAt:desc — recency boost (an actively-maintained app
 *     beats an abandoned one with the same name match)
 *   - createdAt:desc — final tiebreak so two seed-data apps aren't
 *     non-deterministic
 *
 * `attribute` is intentionally OMITTED from this list. Title-match-over-
 * description-match comes for free from Meili's word-position scoring
 * within the searchableAttributes ordering — and adding `attribute`
 * back interacts with `words` in counter-intuitive ways. We list
 * searchableAttributes title-first to get the same effect.
 */
const RANKING_RULES = [
  "words",
  "typo",
  "proximity",
  "exactness",
  "installCount:desc",
  "ratingScore:desc",
  "latestReleaseAt:desc",
  "createdAt:desc",
];

export async function ensureIndex(): Promise<void> {
  const indexes = await client.getIndexes();
  const exists = indexes.results.some((idx) => idx.uid === APPS_INDEX);

  if (!exists) {
    await client.createIndex(APPS_INDEX, { primaryKey: "id" });
  }

  const index = client.index(APPS_INDEX);

  // Ordered title-first so name-match ranks higher than description-match.
  await index.updateSearchableAttributes([
    "title",
    "packageName",
    "developerName",
    "shortDescription",
    "fullDescription",
  ]);

  await index.updateFilterableAttributes([
    "category",
    "trustTier",
    "isExperimental",
    "isPublished",
    "antiFeatures",
  ]);

  await index.updateSortableAttributes([
    "createdAt",
    "installCount",
    "ratingScore",
    "latestReleaseAt",
  ]);

  await index.updateRankingRules(RANKING_RULES);
  await index.updateSynonyms(SYNONYMS);
}

export async function indexApp(doc: AppDocument): Promise<void> {
  const index = client.index(APPS_INDEX);
  await index.addDocuments([doc]);
}

export async function removeApp(id: string): Promise<void> {
  const index = client.index(APPS_INDEX);
  await index.deleteDocument(id);
}
