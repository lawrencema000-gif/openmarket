import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "./schema/moderation";

const CATEGORIES = [
  { slug: "art-design", name: "Art & Design", sortOrder: 1 },
  { slug: "books-reference", name: "Books & Reference", sortOrder: 2 },
  { slug: "business", name: "Business", sortOrder: 3 },
  { slug: "communication", name: "Communication", sortOrder: 4 },
  { slug: "education", name: "Education", sortOrder: 5 },
  { slug: "entertainment", name: "Entertainment", sortOrder: 6 },
  { slug: "finance", name: "Finance", sortOrder: 7 },
  { slug: "food-drink", name: "Food & Drink", sortOrder: 8 },
  { slug: "games-action", name: "Games: Action", sortOrder: 9 },
  { slug: "games-adventure", name: "Games: Adventure", sortOrder: 10 },
  { slug: "games-arcade", name: "Games: Arcade", sortOrder: 11 },
  { slug: "games-board", name: "Games: Board", sortOrder: 12 },
  { slug: "games-card", name: "Games: Card", sortOrder: 13 },
  { slug: "games-casino", name: "Games: Casino", sortOrder: 14 },
  { slug: "games-casual", name: "Games: Casual", sortOrder: 15 },
  { slug: "games-educational", name: "Games: Educational", sortOrder: 16 },
  { slug: "games-music", name: "Games: Music", sortOrder: 17 },
  { slug: "games-puzzle", name: "Games: Puzzle", sortOrder: 18 },
  { slug: "games-racing", name: "Games: Racing", sortOrder: 19 },
  { slug: "games-role-playing", name: "Games: Role Playing", sortOrder: 20 },
  { slug: "games-simulation", name: "Games: Simulation", sortOrder: 21 },
  { slug: "games-sports", name: "Games: Sports", sortOrder: 22 },
  { slug: "games-strategy", name: "Games: Strategy", sortOrder: 23 },
  { slug: "games-trivia", name: "Games: Trivia", sortOrder: 24 },
  { slug: "games-word", name: "Games: Word", sortOrder: 25 },
  { slug: "health-fitness", name: "Health & Fitness", sortOrder: 26 },
  { slug: "lifestyle", name: "Lifestyle", sortOrder: 27 },
  { slug: "maps-navigation", name: "Maps & Navigation", sortOrder: 28 },
  { slug: "medical", name: "Medical", sortOrder: 29 },
  { slug: "music-audio", name: "Music & Audio", sortOrder: 30 },
  { slug: "news-magazines", name: "News & Magazines", sortOrder: 31 },
  { slug: "parenting", name: "Parenting", sortOrder: 32 },
  { slug: "personalization", name: "Personalization", sortOrder: 33 },
  { slug: "photography", name: "Photography", sortOrder: 34 },
  { slug: "productivity", name: "Productivity", sortOrder: 35 },
  { slug: "shopping", name: "Shopping", sortOrder: 36 },
  { slug: "social", name: "Social", sortOrder: 37 },
  { slug: "sports", name: "Sports", sortOrder: 38 },
  { slug: "tools", name: "Tools", sortOrder: 39 },
  { slug: "travel-local", name: "Travel & Local", sortOrder: 40 },
  { slug: "video-players", name: "Video Players", sortOrder: 41 },
  { slug: "weather", name: "Weather", sortOrder: 42 },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log("Seeding categories...");
  await db
    .insert(categories)
    .values(CATEGORIES)
    .onConflictDoNothing({ target: categories.slug });

  console.log(`Seeded ${CATEGORIES.length} categories`);

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
