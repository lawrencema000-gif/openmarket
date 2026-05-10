#!/usr/bin/env node
import { Command } from "commander";
import { releaseUpload } from "./commands/release-upload.js";

const program = new Command();

program
  .name("openmarket")
  .description("OpenMarket developer CLI — upload + manage releases from CI")
  .version("0.0.1");

program
  .command("release")
  .description("Release management commands")
  .addCommand(
    new Command("upload")
      .description("Upload an APK as a new release")
      .requiredOption("--apk <path>", "Path to the .apk file")
      .requiredOption("--package <name>", "Android package name (must own this app)")
      .requiredOption("--version-code <n>", "Integer version code", (v) => parseInt(v, 10))
      .requiredOption("--version-name <s>", "Human-readable version name (e.g. 1.2.0)")
      .option("--channel <c>", "stable | beta | canary", "stable")
      .option("--notes <s>", "Release notes (markdown)")
      .option("--api-url <url>", "OpenMarket API base URL", process.env.OPENMARKET_API_URL ?? "https://api.openmarket.app")
      .option("--token <t>", "API token (or set OPENMARKET_TOKEN)", process.env.OPENMARKET_TOKEN)
      .action(async (opts) => {
        try {
          await releaseUpload(opts);
        } catch (err) {
          console.error("[openmarket] " + (err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
      }),
  );

program.parseAsync(process.argv);
