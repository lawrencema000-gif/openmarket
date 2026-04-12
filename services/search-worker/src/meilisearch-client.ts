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
  createdAt: number; // unix timestamp
}

export async function ensureIndex(): Promise<void> {
  const indexes = await client.getIndexes();
  const exists = indexes.results.some((idx) => idx.uid === APPS_INDEX);

  if (!exists) {
    await client.createIndex(APPS_INDEX, { primaryKey: "id" });
  }

  const index = client.index(APPS_INDEX);

  await index.updateSearchableAttributes([
    "title",
    "shortDescription",
    "fullDescription",
    "packageName",
    "developerName",
  ]);

  await index.updateFilterableAttributes([
    "category",
    "trustTier",
    "isExperimental",
    "isPublished",
  ]);

  await index.updateSortableAttributes(["createdAt"]);
}

export async function indexApp(doc: AppDocument): Promise<void> {
  const index = client.index(APPS_INDEX);
  await index.addDocuments([doc]);
}

export async function removeApp(id: string): Promise<void> {
  const index = client.index(APPS_INDEX);
  await index.deleteDocument(id);
}
