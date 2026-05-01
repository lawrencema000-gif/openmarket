"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders release notes (developer-supplied text) as markdown with a tight
 * allowlist. Per the implementation plan §5 P1-E:
 *   - paragraphs, lists, links allowed
 *   - no images (XSS surface, also style/layout creep)
 *   - no scripts, no raw HTML
 *
 * react-markdown disables raw HTML by default (skipHtml: true). We further
 * gate the element set to be explicit: any element not in `allowedElements`
 * is dropped silently.
 */
const ALLOWED = [
  "p",
  "br",
  "strong",
  "em",
  "code",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "hr",
  "h3",
  "h4",
];

export function ReleaseNotes({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <div className="prose prose-sm prose-gray max-w-none prose-a:text-blue-600 hover:prose-a:text-blue-800 prose-strong:text-gray-900 prose-headings:font-semibold">
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          // Force every link to open in a new tab with rel=noopener noreferrer
          // so a malicious release-notes URL can't tabnab the host page.
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
