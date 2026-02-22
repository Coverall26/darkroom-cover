/**
 * CSS Sanitizer for dangerouslySetInnerHTML style injection
 *
 * Removes potentially dangerous CSS patterns that could be used for XSS:
 * - url() functions (can load external resources)
 * - @import rules (can load external stylesheets)
 * - expression() (IE JS execution)
 * - javascript: protocol
 * - -moz-binding (Firefox XBL)
 * - behavior: (IE HTC)
 * - CSS comment injection
 */
export function sanitizeCss(css: string): string {
  if (!css || typeof css !== "string") return "";

  return css
    .replace(/url\s*\(/gi, "/* blocked-url */") // Remove url() functions
    .replace(/@import/gi, "/* blocked-import */") // Remove @import
    .replace(/expression\s*\(/gi, "/* blocked-expr */") // Remove expression() (IE)
    .replace(/javascript\s*:/gi, "/* blocked-js */") // Remove javascript: protocol
    .replace(/-moz-binding/gi, "/* blocked-moz */") // Remove -moz-binding
    .replace(/behavior\s*:/gi, "/* blocked-behavior */") // Remove behavior (IE)
    .replace(/\/\*[\s\S]*?\*\//g, "") // Strip existing comments to prevent injection
    .trim();
}
