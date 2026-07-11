import { PageHeader, EmptyState } from "@openmarket/ui";
import { CollectionsEditor, type AdminCollection } from "./CollectionsEditor";
import { API_URL } from "@/lib/api";

async function getCollections(): Promise<AdminCollection[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/admin/collections`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminCollection[];
  } catch {
    return null;
  }
}

export default async function CollectionsAdminPage() {
  const collections = await getCollections();

  if (!collections) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Collections"
          description="Could not load collections."
        />
        <EmptyState title="API unreachable" description="Sign in or retry." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editorial collections"
        description="Hand-curated app lists with a named curator + written rationale. Publish to surface on the storefront home + /collections. This is human editorial — kept strictly separate from paid Promotions; no slot here is ever sold."
      />

      <CollectionsEditor initial={collections} />
    </div>
  );
}
