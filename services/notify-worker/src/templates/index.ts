/**
 * Template registry — single typed entry point for every transactional email.
 *
 * Adding a new email:
 *   1. Add its props interface to packages/contracts/src/email.ts
 *   2. Create `templates/<name>.tsx` exporting a React component + `.subject` fn.
 *   3. Add it to TEMPLATES below.
 *   4. The API enqueues `{ template: "<name>", to, props }` and the worker renders.
 */
import type {
  EmailTemplate,
  EmailTemplateMap,
} from "@openmarket/contracts";
import * as React from "react";
import { Welcome } from "./welcome.js";
import { VerifyEmail } from "./verify-email.js";
import { PasswordReset } from "./password-reset.js";
import { ReleasePublished } from "./release-published.js";
import { ReleaseRejected } from "./release-rejected.js";
import { ReportResolved } from "./report-resolved.js";
import { DeveloperTakedown } from "./developer-takedown.js";
import { ReviewResponse } from "./review-response.js";

export type { EmailTemplate, EmailTemplateMap };

interface TemplateModule<P> {
  (props: P): React.ReactNode;
  subject: (props: P) => string;
}

export const TEMPLATES: { [K in EmailTemplate]: TemplateModule<EmailTemplateMap[K]> } = {
  welcome: Welcome,
  "verify-email": VerifyEmail,
  "password-reset": PasswordReset,
  "release-published": ReleasePublished,
  "release-rejected": ReleaseRejected,
  "report-resolved": ReportResolved,
  "developer-takedown": DeveloperTakedown,
  "review-response": ReviewResponse,
};

export function getTemplate<K extends EmailTemplate>(
  name: K,
): TemplateModule<EmailTemplateMap[K]> {
  const tpl = TEMPLATES[name];
  if (!tpl) {
    throw new Error(`Unknown email template: ${name}`);
  }
  return tpl;
}
