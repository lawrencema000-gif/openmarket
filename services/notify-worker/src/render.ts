import { render as renderEmail } from "@react-email/render";
import * as React from "react";
import { type EmailTemplate, type EmailTemplateMap, getTemplate } from "./templates/index.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a typed email template to HTML + plain text + subject.
 *
 * The plain text fallback is required (a) for accessibility, (b) for spam
 * scoring (text/plain alternative), (c) for clients that don't render HTML.
 */
export async function renderTemplate<K extends EmailTemplate>(
  template: K,
  props: EmailTemplateMap[K],
): Promise<RenderedEmail> {
  const Tpl = getTemplate(template);
  const element = React.createElement(Tpl, props);
  const [html, text] = await Promise.all([
    renderEmail(element),
    renderEmail(element, { plainText: true }),
  ]);
  return {
    subject: Tpl.subject(props),
    html,
    text,
  };
}
