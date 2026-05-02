import { relations } from "drizzle-orm";
import { developers, developerIdentities, developerVerificationEvidence, signingKeys } from "./developers";
import {
  apps,
  appListings,
  releases,
  releaseArtifacts,
  artifactMetadata,
  releaseEvents,
} from "./apps";
import { scanResults, permissionsDetected, sdkFingerprints } from "./security";
import { users, installEvents, reviews, reports } from "./users";
import { appeals, moderationActions, releaseChannels, categories } from "./moderation";

export const developersRelations = relations(developers, ({ many }) => ({
  apps: many(apps),
  signingKeys: many(signingKeys),
  identities: many(developerIdentities),
  verificationEvidence: many(developerVerificationEvidence),
}));

export const developerIdentitiesRelations = relations(developerIdentities, ({ one }) => ({
  developer: one(developers, {
    fields: [developerIdentities.developerId],
    references: [developers.id],
  }),
}));

export const developerVerificationEvidenceRelations = relations(developerVerificationEvidence, ({ one }) => ({
  developer: one(developers, {
    fields: [developerVerificationEvidence.developerId],
    references: [developers.id],
  }),
}));

export const signingKeysRelations = relations(signingKeys, ({ one }) => ({
  developer: one(developers, {
    fields: [signingKeys.developerId],
    references: [developers.id],
  }),
}));

export const appsRelations = relations(apps, ({ one, many }) => ({
  developer: one(developers, {
    fields: [apps.developerId],
    references: [developers.id],
  }),
  currentListing: one(appListings, {
    fields: [apps.currentListingId],
    references: [appListings.id],
  }),
  listings: many(appListings),
  releases: many(releases),
  reviews: many(reviews),
  installEvents: many(installEvents),
  releaseChannels: many(releaseChannels),
}));

export const appListingsRelations = relations(appListings, ({ one }) => ({
  app: one(apps, {
    fields: [appListings.appId],
    references: [apps.id],
  }),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  app: one(apps, {
    fields: [releases.appId],
    references: [apps.id],
  }),
  artifacts: many(releaseArtifacts),
  events: many(releaseEvents),
}));

export const releaseEventsRelations = relations(releaseEvents, ({ one }) => ({
  release: one(releases, {
    fields: [releaseEvents.releaseId],
    references: [releases.id],
  }),
}));

export const releaseArtifactsRelations = relations(releaseArtifacts, ({ one, many }) => ({
  release: one(releases, {
    fields: [releaseArtifacts.releaseId],
    references: [releases.id],
  }),
  metadata: one(artifactMetadata),
  scanResults: many(scanResults),
  permissions: many(permissionsDetected),
  sdkFingerprints: many(sdkFingerprints),
}));

export const artifactMetadataRelations = relations(artifactMetadata, ({ one }) => ({
  artifact: one(releaseArtifacts, {
    fields: [artifactMetadata.artifactId],
    references: [releaseArtifacts.id],
  }),
}));

export const scanResultsRelations = relations(scanResults, ({ one }) => ({
  artifact: one(releaseArtifacts, {
    fields: [scanResults.artifactId],
    references: [releaseArtifacts.id],
  }),
}));

export const permissionsDetectedRelations = relations(permissionsDetected, ({ one }) => ({
  artifact: one(releaseArtifacts, {
    fields: [permissionsDetected.artifactId],
    references: [releaseArtifacts.id],
  }),
}));

export const sdkFingerprintsRelations = relations(sdkFingerprints, ({ one }) => ({
  artifact: one(releaseArtifacts, {
    fields: [sdkFingerprints.artifactId],
    references: [releaseArtifacts.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  reviews: many(reviews),
  reports: many(reports),
  installEvents: many(installEvents),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  app: one(apps, {
    fields: [reviews.appId],
    references: [apps.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
}));

export const installEventsRelations = relations(installEvents, ({ one }) => ({
  app: one(apps, {
    fields: [installEvents.appId],
    references: [apps.id],
  }),
}));

export const moderationActionsRelations = relations(moderationActions, ({ one }) => ({
  moderator: one(developers, {
    fields: [moderationActions.moderatorId],
    references: [developers.id],
  }),
}));

export const releaseChannelsRelations = relations(releaseChannels, ({ one }) => ({
  app: one(apps, {
    fields: [releaseChannels.appId],
    references: [apps.id],
  }),
}));

export const appealsRelations = relations(appeals, ({ one }) => ({
  developer: one(developers, {
    fields: [appeals.developerId],
    references: [developers.id],
  }),
}));
