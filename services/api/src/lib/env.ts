import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findEnvFile(): string | undefined {
  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env"),
  ].filter((p): p is string => Boolean(p));

  return candidates.find((p) => existsSync(p));
}

const envPath = findEnvFile();
if (envPath) {
  config({ path: envPath });
}
