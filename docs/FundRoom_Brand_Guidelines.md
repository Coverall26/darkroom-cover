# FundRoom AI — Brand Guidelines v1.1

**February 10, 2026 | CONFIDENTIAL**

---

## 1. Brand Overview

### Mission Statement
FundRoom AI is a secure, modular fund and investor operations platform that transforms complex fundraising, onboarding, document sharing, compliance, and money movement into simple, guided workflows. We deliver military-grade security with consumer-simple experience.

### Brand Personality
- **Trustworthy & Secure** — Military-grade encryption meets enterprise compliance.
- **Modern & Clean** — Fintech-forward, not enterprise-bloated. Generous whitespace, sharp typography, minimal UI chrome.
- **Approachable & Simple** — Wizard-first UX philosophy. One CTA per screen. Plain language over legal/finance jargon.
- **Confident & Professional** — We serve GPs, LPs, and startup founders managing serious capital.

### Brand Promise
**"Military-Grade Security Meets Effortless Fund Management."**

### Platform Tagline
**"Connecting Capital and Opportunity."**
Used under portal titles and in branding showcase panels. Defined as `PLATFORM_TAGLINE` in `lib/constants/saas-config.ts`.

---

## 2. Logo System

### Logo Files (in `public/_static/`)

| File | Format | Use Case |
|---|---|---|
| `fundroom-logo-white.png` | PNG, transparent bg | Dark backgrounds — login pages, admin portal, coming-soon pages |
| `fundroom-logo-black.png` | PNG, transparent bg | Light backgrounds — register page, light-mode sidebar, dataroom |
| `fundroom-icon.png` | PNG, ascending bar chart icon | Favicon, app icon, avatar, collapsed sidebar, showcase panels |
| `favicon.png` | PNG | Browser tab favicon |
| `fundroom-og.png` | PNG | OpenGraph social sharing card |
| `fundroom-banner.png` | PNG | Banner background images |

### Logo Description
The FundRoom AI icon features an ascending bar chart with three bars in a green-to-blue gradient, with a subtle upward arrow overlay. It represents growth, financial progress, and upward momentum.

### Icon Gradient
- Start: Vibrant Green `#2ECC71`
- Mid: Gradient Teal `#00C9A7`
- End: Accent Cyan `#00D4FF`
- Bar fills: Gradient Lime `#7ED957`

### Clear Space & Minimum Size
- **Clear space:** Height of the "F" in FundRoom on all sides
- **Minimum width (full lockup):** 120px digital / 30mm print
- **Minimum width (icon only):** 24px digital / 6mm print

### Logo Usage in Code

| Page / Component | Logo File Used | Context |
|---|---|---|
| Investor Login (`app/(auth)/login/page-client.tsx`) | `fundroom-logo-white.png` + `fundroom-icon.png` | Header logo (white, dark bg) + right panel showcase icon |
| Admin Login (`app/admin/login/page-client.tsx`) | `fundroom-logo-white.png` + `fundroom-icon.png` | Header logo (white, dark bg) + right panel showcase icon |
| Signup (`app/(saas)/signup/page-client.tsx`) | `fundroom-logo-white.png` | Header logo (white, dark bg) |
| Register (`app/(auth)/register/page-client.tsx`) | `fundroom-logo-black.png` | Header logo (black, light bg) |
| Coming Soon Login (`app/coming-soon/login/page.tsx`) | `fundroom-logo-white.png` | Centered logo (white, dark bg) |
| Coming Soon Signup (`app/coming-soon/signup/page.tsx`) | `fundroom-logo-white.png` | Centered logo (white, dark bg) |
| Viewer Portal (`app/viewer-portal/page-client.tsx`) | `fundroom-icon.png` | Header icon (28x28, rounded) |
| Admin Sidebar (`components/admin/admin-sidebar.tsx`) | `fundroom-icon.png` | Sidebar header (expanded: icon + text, collapsed: icon only) |
| App Sidebar (`components/sidebar/app-sidebar.tsx`) | `fundroom-icon.png` + `fundroom-logo-black.png` / `fundroom-logo-white.png` | Dark/light mode aware |
| Hub Page (`app/hub/page-client.tsx`) | `fundroom-logo-black.png` / `fundroom-logo-white.png` | Dark/light mode aware |
| Dataroom Nav (`components/view/dataroom/nav-dataroom.tsx`) | `fundroom-banner.png` | Default banner image |
| SaaS Config (`lib/constants/saas-config.ts`) | All assets referenced in `PLATFORM_BRANDING` | Central config |

---

## 3. Color Palette

### Primary Colors

| Color | Hex | Usage |
|---|---|---|
| **Deep Navy** | `#0A1628` | Primary background, headers, navigation bars, text on light backgrounds |
| **Electric Blue** | `#0066FF` | Primary CTAs, links, active states, accent highlights |

### Icon Gradient Colors

| Color | Hex | Usage |
|---|---|---|
| **Vibrant Green** | `#2ECC71` | Icon gradient start. Growth, prosperity |
| **Gradient Teal** | `#00C9A7` | Icon gradient midpoint |
| **Gradient Lime** | `#7ED957` | Icon bar chart fills |
| **Accent Cyan** | `#00D4FF` | Icon highlights, data visualization accent |

### Neutral Colors

| Color | Hex | Usage |
|---|---|---|
| **Dark Charcoal** | `#1A1A2E` | Body text, headings on light backgrounds |
| **Medium Gray** | `#6B7280` | Secondary text, captions, placeholders, disabled states |
| **Light Gray** | `#F3F4F6` | Page backgrounds, card surfaces, table alternating rows |
| **White** | `#FFFFFF` | Primary content background, card backgrounds, modal surfaces |

### Semantic / Status Colors

| Color | Hex | Usage |
|---|---|---|
| **Success Green** | `#10B981` | Funded status, verified badges, completed steps |
| **Warning Amber** | `#F59E0B` | Pending status, approaching deadlines |
| **Error Red** | `#EF4444` | Failed transactions, validation errors, critical alerts |

---

## 4. Typography

### Type System

| Element | Font | Size / Weight | Usage |
|---|---|---|---|
| Display / Hero | Inter | 36-48px / Bold | Landing page hero, marketing headlines |
| H1 Page Title | Inter | 28-32px / Bold | Dashboard titles, wizard headers |
| H2 Section | Inter | 22-24px / Semibold | Card titles, section headers |
| H3 Subsection | Inter | 18-20px / Semibold | Subsection headers, widget titles |
| Body | Inter | 14-16px / Regular | Primary content, descriptions, form labels |
| Body Small | Inter | 12-13px / Regular | Captions, metadata, timestamps |
| Button / CTA | Inter | 14-16px / Semibold | Buttons, links, navigation items |
| Code / Data | JetBrains Mono | 13-14px / Regular | Transaction IDs, API keys, hex values |

### Font Stack (CSS)
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
/* Monospace */
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
```

### Typography Rules
- Sentence case for all headings and buttons ("Create new fund" not "Create New Fund")
- Avoid ALL CAPS except for short status badges ("FUNDED", "PENDING")
- Maximum line width: 72 characters for body text
- Use plain language. Avoid legal and financial jargon in UI copy.

---

## 5. UI / UX Design Principles

### Core UX Philosophy
1. **Wizard-first:** Complex flows are guided multi-step wizards with progress indicators.
2. **One CTA per screen:** Single primary action. Secondary actions visually subordinate.
3. **Opinionated defaults:** Sensible defaults pre-filled. Advanced settings behind "Advanced" toggle.
4. **Mobile-responsive:** LP onboarding must work flawlessly on mobile.
5. **Progress visibility:** Step indicators, completion badges, progress bars for every multi-step flow.

### Button Hierarchy

| Level | Style | Usage |
|---|---|---|
| **Primary** | Solid Electric Blue (#0066FF), white text, rounded-lg | Main CTA: "Get Started", "Create Fund", "I Want to Invest" |
| **Secondary** | Outlined Electric Blue border, blue text, transparent bg | Alternative: "Save Draft", "Back", "Skip" |
| **Ghost/Tertiary** | Text-only, subtle hover state, no border | Cancel, dismiss, minor navigation |
| **Destructive** | Solid Error Red (#EF4444), white text | Delete actions, revoke access |

### Component Library (shadcn/ui + Tailwind CSS)
- **Cards:** White background, subtle border (#E5E7EB), 8px border-radius, light shadow on hover
- **Forms:** Light gray input backgrounds (#F3F4F6), 6px border-radius, focus ring in Electric Blue
- **Tables:** Deep Navy header row with white text. Alternating light gray / white rows. Sortable.
- **Status badges:** Pill-shaped with semantic colors. All-caps label, 11px font, 4px padding
- **Progress bars:** Rounded, gradient fill (green-to-blue)

---

## 6. In-Product Branding

### "Powered by FundRoom" Badge
Two locations by default:
- **Top-right corner:** Small icon + text badge, semi-transparent
- **Bottom-center:** Footer-style badge with FundRoom AI logo and link

Removal: $50/month per organization.

### Tenant White-Labeling
- Custom logo upload
- Brand color customization (primary and accent)
- Typography presets
- Custom domain ($10/month)
- Custom email sender identity

---

## 7. Voice & Tone

### DO vs DON'T

| DO | DON'T |
|---|---|
| "Your fund is ready to share with investors." | "Fund entity has been provisioned." |
| "Wire transfer instructions are ready." | "Initiate Plaid Link OAuth flow." |
| "3 investors completed onboarding today." | "3 InvestorProfiles transitioned to ACTIVE." |

### Writing Guidelines
- Lead with the benefit, not the feature
- Use active voice
- Keep sentences short (target 15 words for UI copy)
- Translate finance jargon: "capital call" → "funding request" in LP-facing copy
- Error messages: explain what happened AND what to do next

---

## 8. Changelog

| Date | Version | Changes |
|---|---|---|
| Feb 9, 2026 | v1.0 | Initial brand guidelines. Logo files from original source. Applied to coming-soon pages, sidebar, hub, dataroom nav, register, LP login, and SaaS config. |
| Feb 10, 2026 | v1.1 | Logo assets finalized: added `favicon.png`, `fundroom-og.png`, `fundroom-banner.png`. Replaced all placeholder Building2 icons across investor login, admin login, signup, viewer portal, and admin sidebar with actual logo PNGs. Complete logo usage reference table added. All portals now render brand-compliant logos. |
