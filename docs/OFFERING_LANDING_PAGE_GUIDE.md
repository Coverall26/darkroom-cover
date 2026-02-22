# Offering Landing Page — Implementation Guide

## Overview

FundRoom has two offering landing page implementations. This guide explains what each brings to the table and how to combine the best of both for the final premium product.

## File Locations

| File | Purpose |
|------|---------|
| `app/offering/[slug]/page-client.tsx` | **Production component** — live, API-driven, TypeScript |
| `docs/offering-landing-page-template.jsx` | **Premium design template** — visual reference, inline styles, sample data |

---

## Comparison Matrix

### Existing `page-client.tsx` (Production — 1,549 lines)

**Strengths (KEEP):**
- Full TypeScript with `OfferingData` interface (40+ typed fields)
- API-driven: fetches from `/api/offering/[slug]` with loading/error states
- Uses Tailwind CSS + Lucide icons (consistent with rest of platform)
- 15+ modular sub-components (StickyTopBar, HeroSection, MetricsBar, etc.)
- Dynamic brand color application from org settings
- Real email gate with API submission (`POST /api/offering/[slug]`)
- Progress bar showing raise completion percentage
- Computed fallback data (auto-generates deal terms from fund config if none set)
- Additional sections: Timeline/Milestones, Financial Projections, Gallery, Competitive Advantages
- SEO meta tags via parent `page.tsx`
- "Powered by FundRoom" removable branding
- Responsive with Tailwind breakpoints

**What it lacks:**
- No scroll-based animations
- No parallax background effects
- No premium serif fonts (EB Garamond / DM Sans)
- Nav is functional but not as visually refined
- No mobile hamburger menu overlay
- Metrics cards are basic compared to the template

### New Template `offering-landing-page-template.jsx` (Design Reference — 1,647 lines)

**Strengths (ADOPT INTO PRODUCTION):**
- Premium visual design: EB Garamond serif + DM Sans sans-serif font pairing
- IntersectionObserver scroll animations (`AnimatedSection` component)
- Parallax background grid on hero section
- Dynamic sticky nav with scroll-opacity effect
- Mobile hamburger menu with full-screen overlay
- Animated radial glow backgrounds
- Hover micro-interactions on cards (translateY, boxShadow)
- Gold accent color (#C9A84C) design language
- Accredited investor checkbox in email gate
- "Powered by FundRoom AI" footer badge
- Document type badges (PDF = red, XLSX = green)
- Gated vs open document indicators

**What it lacks:**
- Not TypeScript (no type safety)
- Hardcoded sample data (Three Lions Capital / Ipswich Town)
- Inline styles instead of Tailwind (inconsistent with codebase)
- No API integration
- No loading/error states
- Missing sections: Timeline, Financial Projections, Gallery, Advantages
- No fund progress tracking
- No computed fallback data

---

## Integration Plan: Best of Both

When building the final offering landing page, use `page-client.tsx` as the base and adopt these features from the template:

### Priority 1 — High-Impact Visual Upgrades
1. **Add Google Fonts** — EB Garamond for headings, DM Sans for body text
2. **Scroll animations** — Port `AnimatedSection` using IntersectionObserver
3. **Hero parallax grid** — Subtle animated background pattern
4. **Sticky nav opacity** — Dynamic background opacity on scroll
5. **Hover micro-interactions** — translateY + boxShadow on highlight/team cards

### Priority 2 — UX Enhancements
6. **Mobile hamburger menu** — Full-screen nav overlay for mobile
7. **Accredited investor checkbox** — Add to email gate modal
8. **Document type badges** — Color-coded (PDF red, XLSX green) with gated/open indicators
9. **Section anchors** — Smooth scroll navigation between sections
10. **"Powered by FundRoom AI" badge** — In footer (respect `removeBranding` flag)

### Priority 3 — Polish
11. **Radial glow backgrounds** — Subtle gradient orbs on dark sections
12. **Gold accent color** — Use as default `accentColor` when org hasn't set one
13. **Team member initials avatar** — Fallback when no photo provided
14. **Animated "Now Accepting" badge** — Hero section status indicator

---

## Data Mapping

The template uses hardcoded `OFFERING_DATA`. Here's how each field maps to the existing API:

| Template Field | API/DB Source |
|---|---|
| `gpName` | `data.orgName` |
| `gpTagline` | `data.orgDescription` |
| `gpLogo` | `data.orgLogo` |
| `brandColor` | `data.brandColor` |
| `accentColor` | `data.accentColor` |
| `offeringName` | `data.fundName` |
| `heroDescription` | `data.offeringDescription` or `data.heroSubheadline` |
| `metrics[]` | `data.keyMetrics[]` or computed from fund fields |
| `highlights[]` | `data.highlights[]` |
| `structure.details[]` | `data.dealTerms[]` or computed `effectiveDealTerms` |
| `structure.minInvestment` | `data.minimumInvestment` |
| `team[]` | `data.leadership[]` |
| `documents[]` | `data.dataroomDocuments[]` |
| `disclaimer` | `data.disclaimerText` |

---

## Key Design Tokens (from Template)

```css
/* Colors */
--brand-dark: #0A1628
--accent-gold: #C9A84C
--accent-gold-light: #E8D5A0
--bg-warm: #FAFAF8
--bg-section-alt: #F4F3F0
--text-muted: #64748b
--text-subtle: #94a3b8

/* Fonts */
--font-heading: 'EB Garamond', Georgia, serif
--font-body: 'DM Sans', 'Helvetica Neue', sans-serif

/* Spacing (from template sections) */
--section-padding: 100px clamp(20px, 5vw, 60px)
--max-content-width: 1100px
--card-radius: 14px
--nav-height: 72px
```

---

## Usage Notes

- The template JSX is a **reference only** — do not import it directly into the app
- All production code should remain in `app/offering/[slug]/page-client.tsx`
- The template demonstrates the premium visual tier that GP customers pay for
- When implementing, convert inline styles to Tailwind classes to stay consistent
- The `AnimatedSection` component can be extracted to `components/ui/animated-section.tsx` for reuse
