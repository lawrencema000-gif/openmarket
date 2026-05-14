/**
 * Run the Lighthouse CI budget across all three frontends sequentially.
 *
 * Usage: `pnpm perf:budget` (from repo root)
 *
 * Why sequential, not parallel: each app boots its own Next.js
 * production server on a unique port; running three at once works
 * but the dev workstation grinds — Lighthouse is CPU-heavy
 * (Chrome headless) and the throttle math gets noisy when machines
 * are loaded.
 *
 * Exit code is the worst of the three runs — any single budget bust
 * fails the whole script so it integrates cleanly into pre-push
 * hooks.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const APPS = [
  { name: "market-web", config: "apps/market-web/lighthouserc.json" },
  { name: "dev-portal", config: "apps/dev-portal/lighthouserc.json" },
  { name: "admin", config: "apps/admin/lighthouserc.json" },
] as const;

function run(name: string, configPath: string): Promise<number> {
  const fullConfigPath = resolve(repoRoot, configPath);
  if (!existsSync(fullConfigPath)) {
    console.error(`[perf:budget] config missing for ${name}: ${configPath}`);
    return Promise.resolve(2);
  }
  console.log(`\n[perf:budget] ─── ${name} ─────────────────────`);
  return new Promise((res) => {
    const child = spawn(
      "npx",
      ["--yes", "@lhci/cli@0.13", "autorun", `--config=${fullConfigPath}`],
      {
        cwd: repoRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    child.on("close", (code) => res(code ?? 1));
    child.on("error", (err) => {
      console.error(`[perf:budget] spawn failed for ${name}:`, err);
      res(1);
    });
  });
}

async function main() {
  const codes: Array<{ name: string; code: number }> = [];
  for (const app of APPS) {
    const code = await run(app.name, app.config);
    codes.push({ name: app.name, code });
  }

  console.log("\n[perf:budget] summary");
  for (const { name, code } of codes) {
    console.log(`  ${name.padEnd(12)} exit=${code} ${code === 0 ? "✓" : "✗"}`);
  }

  const worst = Math.max(...codes.map((c) => c.code));
  process.exit(worst);
}

void main();
