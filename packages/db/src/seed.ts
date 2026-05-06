import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "./schema/moderation";
import { developers } from "./schema/developers";

/**
 * Category seed. The 12 highest-traffic categories are featured (rendered
 * on the home page). The long tail still lives in /search filters.
 *
 * `position` = order within the featured set (1-based, lowest first).
 * Non-featured categories use position=0.
 */
const CATEGORIES = [
  // Featured.
  { slug: "productivity",   name: "Productivity",    icon: "⚡",  position: 1,  sortOrder: 35, isFeatured: true,  description: "Tasks, notes, calendars, and tools that help you get things done." },
  { slug: "tools",          name: "Tools",           icon: "🔧",  position: 2,  sortOrder: 39, isFeatured: true,  description: "Utilities, file managers, terminals, automation." },
  { slug: "communication",  name: "Communication",   icon: "💬",  position: 3,  sortOrder: 4,  isFeatured: true,  description: "Messaging, email, voice, and chat — including federated and end-to-end encrypted apps." },
  { slug: "social",         name: "Social",          icon: "👥",  position: 4,  sortOrder: 37, isFeatured: true,  description: "Federated and decentralized social, plus traditional networks." },
  { slug: "music-audio",    name: "Music & Audio",   icon: "🎵",  position: 5,  sortOrder: 30, isFeatured: true,  description: "Players, podcasts, streaming, and audio production." },
  { slug: "video-players",  name: "Video & Players", icon: "🎬",  position: 6,  sortOrder: 41, isFeatured: true,  description: "Video players, streaming clients, and media tooling." },
  { slug: "games-action",   name: "Games",           icon: "🎮",  position: 7,  sortOrder: 9,  isFeatured: true,  description: "Action, puzzle, board, RPG, simulation — every genre." },
  { slug: "photography",    name: "Photography",     icon: "📷",  position: 8,  sortOrder: 34, isFeatured: true,  description: "Cameras, editors, raw processors, and image organizers." },
  { slug: "finance",        name: "Finance",         icon: "💰",  position: 9,  sortOrder: 7,  isFeatured: true,  description: "Banking, budgeting, crypto wallets, and investing." },
  { slug: "education",      name: "Education",       icon: "📚",  position: 10, sortOrder: 5,  isFeatured: true,  description: "Learning, languages, references, and academic tools." },
  { slug: "health-fitness", name: "Health & Fitness",icon: "❤️",  position: 11, sortOrder: 26, isFeatured: true,  description: "Workout trackers, meditation, sleep, nutrition." },
  { slug: "maps-navigation",name: "Maps & Travel",   icon: "✈️",  position: 12, sortOrder: 28, isFeatured: true,  description: "Offline maps, transit, navigation, and travel planning." },

  // Long tail.
  { slug: "art-design",         name: "Art & Design",         icon: "🎨", sortOrder: 1,  isFeatured: false },
  { slug: "books-reference",    name: "Books & Reference",    icon: "📖", sortOrder: 2,  isFeatured: false },
  { slug: "business",           name: "Business",             icon: "💼", sortOrder: 3,  isFeatured: false },
  { slug: "entertainment",      name: "Entertainment",        icon: "🎉", sortOrder: 6,  isFeatured: false },
  { slug: "food-drink",         name: "Food & Drink",         icon: "🍽️", sortOrder: 8,  isFeatured: false },
  { slug: "games-adventure",    name: "Games: Adventure",     sortOrder: 10, isFeatured: false },
  { slug: "games-arcade",       name: "Games: Arcade",        sortOrder: 11, isFeatured: false },
  { slug: "games-board",        name: "Games: Board",         sortOrder: 12, isFeatured: false },
  { slug: "games-card",         name: "Games: Card",          sortOrder: 13, isFeatured: false },
  { slug: "games-casino",       name: "Games: Casino",        sortOrder: 14, isFeatured: false },
  { slug: "games-casual",       name: "Games: Casual",        sortOrder: 15, isFeatured: false },
  { slug: "games-educational",  name: "Games: Educational",   sortOrder: 16, isFeatured: false },
  { slug: "games-music",        name: "Games: Music",         sortOrder: 17, isFeatured: false },
  { slug: "games-puzzle",       name: "Games: Puzzle",        sortOrder: 18, isFeatured: false },
  { slug: "games-racing",       name: "Games: Racing",        sortOrder: 19, isFeatured: false },
  { slug: "games-role-playing", name: "Games: Role Playing",  sortOrder: 20, isFeatured: false },
  { slug: "games-simulation",   name: "Games: Simulation",    sortOrder: 21, isFeatured: false },
  { slug: "games-sports",       name: "Games: Sports",        sortOrder: 22, isFeatured: false },
  { slug: "games-strategy",     name: "Games: Strategy",      sortOrder: 23, isFeatured: false },
  { slug: "games-trivia",       name: "Games: Trivia",        sortOrder: 24, isFeatured: false },
  { slug: "games-word",         name: "Games: Word",          sortOrder: 25, isFeatured: false },
  { slug: "lifestyle",          name: "Lifestyle",            sortOrder: 27, isFeatured: false },
  { slug: "medical",            name: "Medical",              sortOrder: 29, isFeatured: false },
  { slug: "news-magazines",     name: "News & Magazines",     icon: "📰", sortOrder: 31, isFeatured: false },
  { slug: "parenting",          name: "Parenting",            sortOrder: 32, isFeatured: false },
  { slug: "personalization",    name: "Personalization",      sortOrder: 33, isFeatured: false },
  { slug: "shopping",           name: "Shopping",             sortOrder: 36, isFeatured: false },
  { slug: "sports",             name: "Sports",               sortOrder: 38, isFeatured: false },
  { slug: "travel-local",       name: "Travel & Local",       sortOrder: 40, isFeatured: false },
  { slug: "weather",            name: "Weather",              icon: "☀️",  sortOrder: 42, isFeatured: false },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log("Seeding categories...");
  // Upsert: insert if missing, update editorial fields (icon, position,
  // featured flag, description) on conflict so re-runs apply changes.
  for (const cat of CATEGORIES) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          name: cat.name,
          icon: cat.icon,
          position: (cat as { position?: number }).position ?? 0,
          sortOrder: cat.sortOrder,
          isFeatured: cat.isFeatured,
          description: (cat as { description?: string }).description ?? null,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);

  console.log("Seeding default admin developer...");
  await db
    .insert(developers)
    .values({
      email: "admin@openmarket.dev",
      displayName: "OpenMarket Admin",
      trustLevel: "audited",
      isAdmin: true,
      authProvider: "email",
    })
    .onConflictDoNothing({ target: developers.email });
  console.log("Seeded default admin");

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
