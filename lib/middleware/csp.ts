import { NextRequest, NextResponse } from "next/server";

const isDev = process.env.NODE_ENV === "development";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const posthogAssetsHost = process.env.NEXT_PUBLIC_POSTHOG_ASSETS_HOST;
const posthogUiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;

const posthogScriptDomains = [
  posthogHost ? `https://${posthogHost}` : null,
  posthogAssetsHost ? `https://${posthogAssetsHost}` : null,
  posthogUiHost ? posthogUiHost : null,
].filter(Boolean) as string[];

const trustedScriptDomains = [
  "https://fundroom.ai",
  "https://*.fundroom.ai",
  ...posthogScriptDomains,
  "https://api.rollbar.com",
  "https://*.rollbar.com",
  "https://unpkg.com",
  "https://js.stripe.com",
  "https://*.persona.com",
  "https://vercel.live",
  "https://*.vercel.live",
].join(" ");

const dynamicConnectHosts = [
  process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST,
  process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST,
  process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST_US,
  process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST_US,
].filter(Boolean).map(host => `https://${host}`);

const posthogConnectDomains = [
  posthogHost ? `https://${posthogHost}` : null,
  posthogAssetsHost ? `https://${posthogAssetsHost}` : null,
  posthogUiHost ? posthogUiHost : null,
].filter(Boolean) as string[];

const trustedConnectDomains = [
  ...posthogConnectDomains,
  "https://api.rollbar.com",
  "https://*.rollbar.com",
  "https://*.replit.app",
  "https://objectstorage.replit.app",
  "https://*.fundroom.ai",
  "https://fundroom.ai",
  "https://api.stripe.com",
  "https://*.persona.com",
  "https://api.tinybird.co",
  "https://*.cal.com",
  "https://cal.com",
  "https://*.public.blob.vercel-storage.com",
  "https://yoywvlh29jppecbh.public.blob.vercel-storage.com",
  "https://36so9a8uzykxknsu.public.blob.vercel-storage.com",
  "https://blob.vercel-storage.com",
  "https://*.vercel-storage.com",
  // S3 / R2 storage for document downloads and thumbnails
  "https://*.amazonaws.com",
  "https://*.r2.cloudflarestorage.com",
  // WebSocket support (SSE, live updates)
  "wss:",
  // Vercel Bot ID — challenge/classification endpoint
  "https://api.vercel.com",
  // Vercel Live toolbar (feedback/comments widget)
  "https://vercel.live",
  "https://*.vercel.live",
  ...dynamicConnectHosts,
].join(" ");

const dynamicImageHosts = [
  process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST,
  process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST,
  process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST_US,
  process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST_US,
].filter(Boolean).map(host => `https://${host}`);

const trustedImageDomains = [
  "https://*.fundroom.ai",
  "https://fundroom.ai",
  "https://pbs.twimg.com",
  "https://media.licdn.com",
  "https://lh3.googleusercontent.com",
  "https://faisalman.github.io",
  "https://*.replit.app",
  "https://objectstorage.replit.app",
  "https://*.public.blob.vercel-storage.com",
  "https://yoywvlh29jppecbh.public.blob.vercel-storage.com",
  "https://36so9a8uzykxknsu.public.blob.vercel-storage.com",
  "https://blob.vercel-storage.com",
  // S3 / R2 document thumbnails and images
  "https://*.amazonaws.com",
  "https://*.r2.cloudflarestorage.com",
  ...dynamicImageHosts,
].join(" ");

const trustedStyleDomains = "https://fonts.googleapis.com https://fundroom.ai https://*.fundroom.ai";
const trustedFontDomains = "https://fonts.gstatic.com https://fundroom.ai https://*.fundroom.ai";

export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64");
}

export function getFrameAncestors(path: string): string {
  const embedAllowedOrigins = process.env.CSP_EMBED_ALLOWED_ORIGINS || "";
  const allowAllEmbeds = process.env.CSP_EMBED_ALLOW_ALL === "true";
  const isDev = process.env.NODE_ENV === "development";

  // In development, allow all origins for easier testing (Replit webview uses iframes)
  if (isDev) {
    return "'self' https: http:";
  }

  if (path.includes("/embed")) {
    return embedAllowedOrigins
      ? `'self' ${embedAllowedOrigins}`
      : allowAllEmbeds
        ? "'self' https:"
        : "'self'";
  }

  if (path.startsWith("/view/")) {
    return "'self'";
  }

  // For login/verify pages, allow self (no iframe embedding needed)
  if (path.startsWith("/login") || path.startsWith("/verify") || path.startsWith("/admin/login")) {
    return "'self'";
  }

  return "'none'";
}

export function buildCSP(nonce: string, path: string): string {
  const frameAncestors = getFrameAncestors(path);

  // Note: Using 'unsafe-inline' in production due to Next.js 16 Turbopack nonce propagation issues.
  // Nonce-based CSP blocked by upstream: https://github.com/vercel/next.js/issues/64830
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${trustedScriptDomains} http:;`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' wasm-unsafe-eval blob: data: ${trustedScriptDomains};`;

  const styleSrc = isDev
    ? `style-src 'self' 'unsafe-inline' ${trustedStyleDomains} http:;`
    : `style-src 'self' 'unsafe-inline' ${trustedStyleDomains};`;

  const connectSrc = isDev
    ? `connect-src 'self' ${trustedConnectDomains} http: ws: wss:;`
    : `connect-src 'self' ${trustedConnectDomains};`;

  const imgSrc = isDev
    ? `img-src 'self' data: blob: ${trustedImageDomains} http:;`
    : `img-src 'self' data: blob: ${trustedImageDomains};`;

  const fontSrc = `font-src 'self' data: ${trustedFontDomains}${isDev ? " http:" : ""};`;

  const workerSrc = "worker-src 'self' blob: https://unpkg.com;";

  // Allow Vercel Live toolbar, Stripe payment, and Persona KYC iframes
  const frameSrc = "frame-src 'self' https://vercel.live https://*.vercel.live https://js.stripe.com https://*.persona.com;";

  return [
    `default-src 'self';`,
    scriptSrc,
    styleSrc,
    imgSrc,
    fontSrc,
    workerSrc,
    connectSrc,
    frameSrc,
    `object-src 'none';`,
    `base-uri 'self';`,
    `form-action 'self';`,
    isDev ? "" : "upgrade-insecure-requests;",
    `frame-ancestors ${frameAncestors};`,
    "report-uri /api/csp-report;",
  ].filter(Boolean).join(" ");
}

// CSP enforcement mode:
// - ENFORCE_CSP=true → Content-Security-Policy (enforced, blocks violations)
// - ENFORCE_CSP unset/false → Content-Security-Policy-Report-Only (logs violations only)
const enforceCSP = process.env.ENFORCE_CSP === "true";

export function applyCSPHeaders(
  response: NextResponse,
  nonce: string,
  path: string
): NextResponse {
  const csp = buildCSP(nonce, path);

  // Use enforced or report-only header based on ENFORCE_CSP env var
  const cspHeader = enforceCSP
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
  response.headers.set(cspHeader, csp);
  // Remove the other header to avoid conflicts
  const otherHeader = enforceCSP
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
  response.headers.delete(otherHeader);
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // camera=(self) allows LP mobile document capture (photo upload for wire proof)
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  const isDev = process.env.NODE_ENV === "development";
  
  // X-Frame-Options should be consistent with frame-ancestors
  // In dev mode, allow framing for Replit webview
  if (isDev) {
    // Don't set X-Frame-Options in dev - let CSP frame-ancestors handle it
  } else if (!path.startsWith("/view/")) {
    response.headers.set("X-Frame-Options", "DENY");
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  return response;
}

export function createCSPResponse(req: NextRequest): NextResponse {
  const nonce = generateNonce();
  const path = req.nextUrl.pathname;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applyCSPHeaders(response, nonce, path);
}

export function wrapResponseWithCSP(
  req: NextRequest,
  existingResponse: NextResponse
): NextResponse {
  const nonce = generateNonce();
  const path = req.nextUrl.pathname;

  existingResponse.headers.set("x-nonce", nonce);

  return applyCSPHeaders(existingResponse, nonce, path);
}
