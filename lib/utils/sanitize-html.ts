import sanitizeHtml from "sanitize-html";

export function validateContent(html: string, length: number = 1000) {
  if (html.length > length) {
    throw new Error(`Content cannot be longer than ${length} characters`);
  }
  const sanitized = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });

  if (sanitized.length === 0 || sanitized === "") {
    throw new Error("Content cannot be empty");
  }

  return sanitized.trim();
}

/**
 * Sanitize HTML for safe rendering via dangerouslySetInnerHTML.
 * Allows only safe formatting tags (b, i, em, strong, a, code, br, p, span).
 * Strips all other tags and attributes except href on anchors.
 */
export function sanitizeForRender(html: string): string {
  if (!html || typeof html !== "string") return "";

  return sanitizeHtml(html, {
    allowedTags: ["b", "i", "em", "strong", "a", "code", "br", "p", "span", "ul", "ol", "li"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["class"],
    },
    allowedSchemes: ["https", "mailto"],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
