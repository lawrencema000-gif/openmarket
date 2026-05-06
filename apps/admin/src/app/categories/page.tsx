import { PageHeader, EmptyState } from "@openmarket/ui";
import { CategoriesEditor } from "./CategoriesEditor";
import { API_URL } from "@/lib/api";

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  iconUrl: string | null;
  position: number;
  sortOrder?: number;
  isFeatured: boolean;
  appCount?: number;
}

async function getCategories(): Promise<Category[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/categories`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Category[];
  } catch {
    return null;
  }
}

export default async function CategoriesAdminPage() {
  const categories = await getCategories();

  if (!categories) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Categories"
          description="Could not load categories."
        />
        <EmptyState title="API unreachable" description="Sign in or retry." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Editorial control of the storefront category list. Drag-order, feature toggle, and CRUD. Reorder + featured changes affect what users see immediately."
      />

      <CategoriesEditor initial={categories} />
    </div>
  );
}
