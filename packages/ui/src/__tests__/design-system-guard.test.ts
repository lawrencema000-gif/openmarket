import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/**
 * Design-system regression guard.
 *
 * Two whole classes of bug reached a running browser undetected during the
 * design/dark-mode pass — they compiled clean and passed a 44-finding static
 * audit, and only a rendered page revealed them:
 *
 *   1. Tailwind v4 never scanned `packages/ui`, so classes used ONLY by a
 *      shared component (e.g. SearchInput's `pl-11`/`left-3`) were silently
 *      dropped from every app's stylesheet — the search icon overlapped its
 *      placeholder on every page. The fix is the `@source` directive in each
 *      app's globals.css pointing Tailwind at packages/ui.
 *   2. Legacy raw-chrome palette (gray/slate/blue/indigo) left in shared
 *      components can't theme for dark mode (they don't flip with the --om-*
 *      tokens), so headings/borders go invisible on dark surfaces.
 *
 * This guard fails the build if either regresses, per the "fix the class, not
 * the instance" principle: no future contributor can re-drop the @source line
 * or reintroduce untokenized chrome without CI catching it.
 */

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/ui/src/__tests__
const REPO_ROOT = join(HERE, "..", "..", "..", ".."); // -> repo root
const UI_SRC = join(HERE, ".."); // packages/ui/src

const APPS = ["market-web", "dev-portal", "admin"] as const;

/** Recursively collect .ts/.tsx files under a dir, skipping this test dir. */
function collectSource(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectSource(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Chrome neutrals + legacy brand-blue that MUST be expressed as --om-* tokens
// (they are the only palette families the token migration replaced, so they
// are the only ones that fail to flip in dark mode). Decorative / semantic
// hues — amber, emerald, red, orange, rose, sky, violet, etc. — are allowed;
// they carry explicit dark: variants where used.
const FORBIDDEN_CHROME = /(?:^|[^a-z-])(?:bg|text|border|ring|from|to|via|divide|outline|decoration|placeholder|shadow|fill|stroke|accent|caret)-(?:gray|slate|zinc|neutral|stone|blue|indigo)-\d{2,3}\b/g;
// Hardcoded hex in a Tailwind arbitrary-value class, e.g. bg-[#7c3aed]. Also
// unthemeable — colors belong in tokens.css, referenced via --om-* utilities.
const FORBIDDEN_HEX = /-\[#[0-9a-fA-F]{3,8}\]/g;

describe("design-system guard: @source directive", () => {
  it.each(APPS)("apps/%s/src/app/globals.css scans packages/ui", (app) => {
    const globals = join(REPO_ROOT, "apps", app, "src", "app", "globals.css");
    expect(existsSync(globals), `${globals} should exist`).toBe(true);
    const css = readFileSync(globals, "utf8");
    // Tailwind v4 only emits utilities for classes it can see. Shared
    // components live outside the app's own file tree, so each app must
    // @source packages/ui or their classes vanish from the build.
    expect(
      /@source\b[^;]*packages\/ui/.test(css),
      `apps/${app}/src/app/globals.css is missing an "@source ... packages/ui ..." directive — ` +
        `classes used only by shared @openmarket/ui components will be silently dropped from this app.`,
    ).toBe(true);
  });
});

describe("design-system guard: no untokenized chrome in packages/ui", () => {
  const files = collectSource(UI_SRC);

  it("scans a non-trivial number of shared components", () => {
    // Sanity: if the glob broke, an empty set would vacuously pass.
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [relative(REPO_ROOT, f), f] as const))(
    "%s uses design tokens, not raw chrome",
    (_rel, file) => {
      const src = readFileSync(file, "utf8");
      const chrome = [...src.matchAll(FORBIDDEN_CHROME)].map((m) => m[0].replace(/^[^a-z]*/, ""));
      const hex = [...src.matchAll(FORBIDDEN_HEX)].map((m) => m[0]);
      const hits = [...chrome, ...hex];
      expect(
        hits,
        `${relative(REPO_ROOT, file)} contains untokenized color(s): ${hits.join(", ")}. ` +
          `Use --om-* tokens (bg-om-surface / text-om-ink / text-om-primary / border-om-line …) ` +
          `so the component themes for dark mode. See packages/ui/src/styles/tokens.css.`,
      ).toEqual([]);
    },
  );
});
