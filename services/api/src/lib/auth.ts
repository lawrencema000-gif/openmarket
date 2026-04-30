import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { enqueueEmail } from "./email";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({
        template: "password-reset",
        to: user.email,
        props: {
          resetUrl: url,
          expiryMinutes: 30,
        },
        idempotencyKey: `password-reset:${user.id}:${url}`,
        tags: [{ name: "category", value: "auth" }],
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueEmail({
        template: "verify-email",
        to: user.email,
        props: {
          verifyUrl: url,
          expiryMinutes: 60,
        },
        idempotencyKey: `verify-email:${user.id}:${url}`,
        tags: [{ name: "category", value: "auth" }],
      });
    },
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      enabled: !!process.env.GITHUB_CLIENT_ID,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [WEB_BASE_URL],
});
