import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription } from "@openmarket/ui";

interface Category {
  id: string;
  name: string;
  slug: string;
  appCount?: number;
}

async function getCategories(): Promise<Category[]> {
  try {
    return await apiFetch<Category[]>("/api/categories");
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const categories = await getCategories();

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-12 space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          The Open Android Marketplace
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover apps with full transparency — verified developers, security reviews, and honest trust ratings.
        </p>
        <form action="/search" method="GET" className="flex gap-2 max-w-lg mx-auto">
          <input
            type="search"
            name="q"
            placeholder="Search for apps..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </form>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-6">Browse by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <Link key={cat.id} href={`/search?category=${cat.slug}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="text-base">{cat.name}</CardTitle>
                    {cat.appCount !== undefined && (
                      <CardDescription>{cat.appCount} apps</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Apps placeholder */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Featured Apps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="opacity-40">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                  <div className="space-y-1">
                    <CardTitle className="text-base">App Name</CardTitle>
                    <CardDescription>Short description goes here</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Featured apps will appear here once the API is connected.
        </p>
      </section>

      {/* New Arrivals placeholder */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">New Arrivals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="opacity-40">
              <CardHeader>
                <div className="w-10 h-10 bg-gray-200 rounded-lg mb-2" />
                <CardTitle className="text-sm">New App {i}</CardTitle>
                <CardDescription>Developer Name</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="text-sm text-gray-400 mt-2">
          New arrivals will appear here once the API is connected.
        </p>
      </section>
    </div>
  );
}
