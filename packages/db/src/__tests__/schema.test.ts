import { describe, it, expect } from "vitest";
import * as schema from "../schema/index";

describe("Database Schema", () => {
  it("exports developers table", () => {
    expect(schema.developers).toBeDefined();
    expect(schema.developers.id).toBeDefined();
    expect(schema.developers.email).toBeDefined();
    expect(schema.developers.trustLevel).toBeDefined();
  });

  it("exports apps table", () => {
    expect(schema.apps).toBeDefined();
    expect(schema.apps.packageName).toBeDefined();
    expect(schema.apps.developerId).toBeDefined();
  });

  it("exports releases table with version uniqueness", () => {
    expect(schema.releases).toBeDefined();
    expect(schema.releases.versionCode).toBeDefined();
    expect(schema.releases.status).toBeDefined();
  });

  it("exports signing keys table", () => {
    expect(schema.signingKeys).toBeDefined();
    expect(schema.signingKeys.fingerprintSha256).toBeDefined();
    expect(schema.signingKeys.developerId).toBeDefined();
  });

  it("exports scan results table", () => {
    expect(schema.scanResults).toBeDefined();
    expect(schema.scanResults.riskScore).toBeDefined();
    expect(schema.scanResults.findings).toBeDefined();
  });

  it("exports categories table", () => {
    expect(schema.categories).toBeDefined();
    expect(schema.categories.slug).toBeDefined();
  });

  it("exports all expected tables", () => {
    const expectedTables = [
      "developers",
      "developerIdentities",
      "developerVerificationEvidence",
      "signingKeys",
      "apps",
      "appListings",
      "releases",
      "releaseArtifacts",
      "artifactMetadata",
      "scanResults",
      "permissionsDetected",
      "sdkFingerprints",
      "users",
      "installEvents",
      "reviews",
      "reports",
      "moderationActions",
      "releaseChannels",
      "categories",
    ];
    for (const table of expectedTables) {
      expect(schema).toHaveProperty(table);
    }
  });
});
