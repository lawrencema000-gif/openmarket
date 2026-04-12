import { Hono } from "hono";
import { asc } from "drizzle-orm";
import { db } from "../lib/db";
import { categories } from "@openmarket/db/schema";
import type { Variables } from "../lib/types";

export const categoriesRouter = new Hono<{ Variables: Variables }>();

categoriesRouter.get("/categories", async (c) => {
  const allCategories = await db.query.categories.findMany({
    orderBy: [asc(categories.sortOrder)],
  });
  return c.json(allCategories);
});
