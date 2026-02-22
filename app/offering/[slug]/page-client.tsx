"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { sanitizeCss } from "@/lib/utils/sanitize-css";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Lock,
  Mail,
  MapPin,
  Shield,
  Target,
  TrendingUp,
  Users,
  CheckCircle2,
  CircleDot,
  Circle,
  Building2,
  BarChart3,
  Briefcase,
  Award,
  Globe,
  Landmark,
  X,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OfferingData {
  slug: string;
  fundId: string;
  teamId: string;
  heroHeadline: string;
  heroSubheadline: string | null;
  heroImageUrl: string | null;
  heroBadgeText: string | null;
  fundName: string;
  fundStatus: string;
  targetRaise: string | null;
  minimumInvestment: string | null;
  currentRaise: string | null;
  totalCommitted: string;
  totalInbound: string;
  investorCount: number;
  closingDate: string | null;
  entityMode: string;
  fundSubType: string | null;
  regulationDExemption: string | null;
  currency: string;
  managementFeePct: string | null;
  carryPct: string | null;
  hurdleRate: string | null;
  termYears: number | null;
  extensionYears: number | null;
  waterfallType: string | null;
  orgName: string;
  orgLogo: string | null;
  orgDescription: string | null;
  orgSector: string | null;
  orgGeography: string | null;
  orgWebsite: string | null;
  orgFoundedYear: number | null;
  orgCity: string | null;
  orgState: string | null;
  offeringDescription: string | null;
  keyMetrics: Array<{ label: string; value: string; subtext?: string }> | null;
  highlights: Array<{ title: string; description: string; icon?: string }> | null;
  dealTerms: Array<{ label: string; value: string }> | null;
  timeline: Array<{
    date: string;
    title: string;
    description?: string;
    status: "completed" | "current" | "upcoming";
  }> | null;
  leadership: Array<{
    name: string;
    title: string;
    bio?: string;
    imageUrl?: string;
  }> | null;
  gallery: Array<{ url: string; caption?: string; type: "image" | "video" }> | null;
  dataroomDocuments: Array<{
    name: string;
    type: string;
    isGated: boolean;
    url?: string;
  }> | null;
  financialProjections: {
    sections: Array<{
      title: string;
      headers: string[];
      rows: Array<{ label: string; values: string[] }>;
    }>;
  } | null;
  advantages: Array<{ title: string; description: string; icon?: string }> | null;
  ctaText: string;
  ctaSecondary: string | null;
  emailGateEnabled: boolean;
  brandColor: string;
  accentColor: string;
  logoUrl: string | null;
  customCss: string | null;
  disclaimerText: string | null;
  removeBranding: boolean;
  metaTitle: string;
  metaDescription: string | null;
  metaImageUrl: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: string | number | null, currency = "USD"): string {
  if (!value) return "$0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0";
  if (num >= 1_000_000_000)
    return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000)
    return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000)
    return `$${(num / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatPercent(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return `${(num * 100).toFixed(1)}%`;
}

function getRegDLabel(exemption: string | null): string {
  switch (exemption) {
    case "506B": return "Rule 506(b)";
    case "506C": return "Rule 506(c)";
    case "REG_A_PLUS": return "Regulation A+";
    case "RULE_504": return "Rule 504";
    default: return "Regulation D";
  }
}

function getIconForHighlight(icon?: string) {
  const map: Record<string, typeof TrendingUp> = {
    trending: TrendingUp,
    target: Target,
    users: Users,
    shield: Shield,
    dollar: DollarSign,
    building: Building2,
    chart: BarChart3,
    briefcase: Briefcase,
    award: Award,
    globe: Globe,
    landmark: Landmark,
  };
  return map[icon || ""] || Target;
}

// ─── Animated Section ──────────────────────────────────────────────────────────

function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function OfferingPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<OfferingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [gateEmail, setGateEmail] = useState("");
  const [gateName, setGateName] = useState("");
  const [gateAccredited, setGateAccredited] = useState(false);
  const [gateSubmitted, setGateSubmitted] = useState(false);
  const [isGateSubmitting, setIsGateSubmitting] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/offering/${slug}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Offering not found");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleInvest = useCallback(() => {
    if (!data) return;
    router.push(
      `/lp/onboard?fundId=${data.fundId}&teamId=${data.teamId}&ref=offering-${slug}`
    );
  }, [data, slug, router]);

  const handleEmailGateSubmit = useCallback(async () => {
    if (!gateEmail || !gateName || !data) return;
    setIsGateSubmitting(true);
    try {
      await fetch("/api/lp/express-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: gateEmail, name: gateName, accredited: gateAccredited, source: `offering-${slug}` }),
      });
    } catch {
      // Non-blocking
    }
    setGateSubmitted(true);
    setIsGateSubmitting(false);
    setShowEmailGate(false);
  }, [gateEmail, gateName, gateAccredited, data, slug]);

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading offering...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Offering Not Found</h1>
          <p className="text-gray-400 mb-6">
            This offering page may have been removed or is not yet published.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const brandColor = data.brandColor || "#0066FF";
  const accentBg = data.accentColor || "#0A1628";
  const raisePct = data.targetRaise
    ? Math.min(
        100,
        (parseFloat(data.totalCommitted || "0") /
          parseFloat(data.targetRaise)) *
          100
      )
    : 0;

  // Build default deal terms from fund data if GP hasn't configured custom ones
  const effectiveDealTerms: Array<{ label: string; value: string }> =
    (data.dealTerms as Array<{ label: string; value: string }>) ||
    [
      data.regulationDExemption && {
        label: "SEC Exemption",
        value: getRegDLabel(data.regulationDExemption),
      },
      data.minimumInvestment && {
        label: "Minimum Investment",
        value: formatCurrency(data.minimumInvestment, data.currency),
      },
      data.managementFeePct && {
        label: "Management Fee",
        value: formatPercent(data.managementFeePct),
      },
      data.carryPct && {
        label: "Carried Interest",
        value: formatPercent(data.carryPct),
      },
      data.hurdleRate && {
        label: "Hurdle Rate",
        value: formatPercent(data.hurdleRate),
      },
      data.termYears && {
        label: "Fund Term",
        value: `${data.termYears} years${data.extensionYears ? ` + ${data.extensionYears} ext.` : ""}`,
      },
      data.waterfallType && {
        label: "Distribution Waterfall",
        value: data.waterfallType === "EUROPEAN"
          ? "European (Whole Fund)"
          : data.waterfallType === "AMERICAN"
            ? "American (Deal-by-Deal)"
            : data.waterfallType,
      },
    ].filter(Boolean) as Array<{ label: string; value: string }>;

  // Build default key metrics from fund data
  const effectiveMetrics: Array<{ label: string; value: string; subtext?: string }> =
    (data.keyMetrics as Array<{ label: string; value: string; subtext?: string }>) || [
      {
        label: "Target Raise",
        value: formatCurrency(data.targetRaise, data.currency),
      },
      {
        label: "Capital Committed",
        value: formatCurrency(data.totalCommitted, data.currency),
        subtext: `${raisePct.toFixed(0)}% of target`,
      },
      {
        label: "Minimum Investment",
        value: formatCurrency(data.minimumInvestment, data.currency),
      },
      {
        label: "Investors",
        value: `${data.investorCount}`,
        subtext: data.fundStatus === "RAISING" ? "Accepting new investors" : undefined,
      },
    ];

  return (
    <div
      className="min-h-screen"
      style={
        {
          "--brand-color": brandColor,
          "--accent-bg": accentBg,
        } as React.CSSProperties
      }
    >
      {/* Premium fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`html { scroll-behavior: smooth; }`}</style>
      {/* Inject custom CSS if provided */}
      {data.customCss && <style dangerouslySetInnerHTML={{ __html: sanitizeCss(data.customCss) }} />}

      {/* ─── Sticky Top Bar ──────────────────────────────────────────────── */}
      <StickyTopBar
        data={data}
        brandColor={brandColor}
        raisePct={raisePct}
        onInvest={handleInvest}
        scrollY={scrollY}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      {/* ─── Hero Section ────────────────────────────────────────────────── */}
      <HeroSection
        data={data}
        brandColor={brandColor}
        raisePct={raisePct}
        onInvest={handleInvest}
      />

      {/* ─── Key Metrics Bar ─────────────────────────────────────────────── */}
      <MetricsBar metrics={effectiveMetrics} brandColor={brandColor} />

      {/* ─── Offering Description ────────────────────────────────────────── */}
      {data.offeringDescription && (
        <DescriptionSection
          description={data.offeringDescription}
          orgName={data.orgName}
          orgDescription={data.orgDescription}
          orgCity={data.orgCity}
          orgState={data.orgState}
          orgSector={data.orgSector}
          orgFoundedYear={data.orgFoundedYear}
          orgLogo={data.logoUrl}
        />
      )}

      {/* ─── Investment Highlights ────────────────────────────────────────── */}
      {data.highlights && (data.highlights as Array<{ title: string; description: string }>).length > 0 && (
        <HighlightsSection
          highlights={data.highlights as Array<{ title: string; description: string; icon?: string }>}
          brandColor={brandColor}
        />
      )}

      {/* ─── Timeline / Milestones ────────────────────────────────────────── */}
      {data.timeline && (data.timeline as Array<{ date: string; title: string }>).length > 0 && (
        <TimelineSection
          timeline={
            data.timeline as Array<{
              date: string;
              title: string;
              description?: string;
              status: "completed" | "current" | "upcoming";
            }>
          }
          brandColor={brandColor}
        />
      )}

      {/* ─── Deal Structure / Terms ──────────────────────────────────────── */}
      {effectiveDealTerms.length > 0 && (
        <DealTermsSection terms={effectiveDealTerms} brandColor={brandColor} />
      )}

      {/* ─── Financial Projections ────────────────────────────────────────── */}
      {data.financialProjections && (
        <FinancialProjectionsSection
          projections={
            data.financialProjections as {
              sections: Array<{
                title: string;
                headers: string[];
                rows: Array<{ label: string; values: string[] }>;
              }>;
            }
          }
          brandColor={brandColor}
        />
      )}

      {/* ─── Competitive Advantages ──────────────────────────────────────── */}
      {data.advantages && (data.advantages as Array<{ title: string; description: string }>).length > 0 && (
        <AdvantagesSection
          advantages={data.advantages as Array<{ title: string; description: string; icon?: string }>}
          brandColor={brandColor}
        />
      )}

      {/* ─── Leadership Team ─────────────────────────────────────────────── */}
      {data.leadership && (data.leadership as Array<{ name: string; title: string }>).length > 0 && (
        <LeadershipSection
          leadership={
            data.leadership as Array<{
              name: string;
              title: string;
              bio?: string;
              imageUrl?: string;
            }>
          }
          brandColor={brandColor}
        />
      )}

      {/* ─── Gallery ─────────────────────────────────────────────────────── */}
      {data.gallery && (data.gallery as Array<{ url: string }>).length > 0 && (
        <GallerySection
          gallery={data.gallery as Array<{ url: string; caption?: string; type: "image" | "video" }>}
        />
      )}

      {/* ─── Dataroom Documents ──────────────────────────────────────────── */}
      {data.dataroomDocuments &&
        (data.dataroomDocuments as Array<{ name: string }>).length > 0 && (
          <DocumentsSection
            documents={
              data.dataroomDocuments as Array<{
                name: string;
                type: string;
                isGated: boolean;
                url?: string;
              }>
            }
            brandColor={brandColor}
            emailGateEnabled={data.emailGateEnabled}
            gateSubmitted={gateSubmitted}
            onRequestAccess={() => setShowEmailGate(true)}
          />
        )}

      {/* ─── Final CTA ───────────────────────────────────────────────────── */}
      <FinalCTA
        data={data}
        brandColor={brandColor}
        onInvest={handleInvest}
      />

      {/* ─── Compliance Footer ───────────────────────────────────────────── */}
      <ComplianceFooter
        data={data}
        brandColor={brandColor}
      />

      {/* ─── Email Gate Modal ────────────────────────────────────────────── */}
      {showEmailGate && (
        <EmailGateModal
          email={gateEmail}
          setEmail={setGateEmail}
          name={gateName}
          setName={setGateName}
          accredited={gateAccredited}
          setAccredited={setGateAccredited}
          onSubmit={handleEmailGateSubmit}
          onClose={() => setShowEmailGate(false)}
          isSubmitting={isGateSubmitting}
          brandColor={brandColor}
        />
      )}
    </div>
  );
}

// ─── Sticky Top Bar ────────────────────────────────────────────────────────────

function StickyTopBar({
  data,
  brandColor,
  raisePct,
  onInvest,
  scrollY,
  menuOpen,
  setMenuOpen,
}: {
  data: OfferingData;
  brandColor: string;
  raisePct: number;
  onInvest: () => void;
  scrollY: number;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  const navOpacity = Math.min(scrollY / 200, 1);
  const navSections = ["Overview", "Highlights", "Structure", "Team", "Documents"];

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-all duration-300"
        style={{
          height: 72,
          padding: "0 clamp(20px, 4vw, 60px)",
          background: `rgba(10,22,40,${0.6 + navOpacity * 0.35})`,
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid rgba(255,255,255,${navOpacity * 0.08})`,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div className="flex items-center gap-3">
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logoUrl} alt={data.orgName} className="h-8 w-auto flex-shrink-0" />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-sm"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}80)`, color: "#fff" }}
            >
              {data.orgName.split(" ").map(w => w[0]).join("").slice(0, 2)}
            </div>
          )}
          <span className="text-white font-semibold text-sm tracking-wide hidden sm:inline">
            {data.orgName}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-8">
          {navSections.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-white/60 hover:text-white text-xs font-medium uppercase tracking-widest transition-colors"
              style={{ letterSpacing: "0.06em" }}
            >
              {item}
            </a>
          ))}
          <button
            onClick={onInvest}
            className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white rounded-lg transition-all hover:brightness-110 hover:shadow-lg"
            style={{ backgroundColor: brandColor, letterSpacing: "0.04em" }}
          >
            {data.ctaText}
          </button>
        </div>

        <button
          className="lg:hidden text-white text-2xl"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? "\u2715" : "\u2630"}
        </button>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-7"
          style={{ top: 72, background: "rgba(10,22,40,0.97)" }}
        >
          {navSections.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
              className="text-white text-xl font-medium uppercase tracking-widest"
            >
              {item}
            </a>
          ))}
          <button
            onClick={() => { setMenuOpen(false); onInvest(); }}
            className="mt-4 px-10 py-3.5 text-base font-bold uppercase text-white rounded-lg"
            style={{ backgroundColor: brandColor }}
          >
            {data.ctaText}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Hero Section ──────────────────────────────────────────────────────────────

function HeroSection({
  data,
  brandColor,
  raisePct,
  onInvest,
}: {
  data: OfferingData;
  brandColor: string;
  raisePct: number;
  onInvest: () => void;
}) {
  return (
    <section id="overview" className="relative min-h-[85vh] flex items-center overflow-hidden bg-[#0A1628]">
      {/* Background */}
      <div className="absolute inset-0">
        {data.heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.heroImageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A1628] via-[#0A1628]/85 to-[#0A1628]/60" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628] via-[#0d1a35] to-[#0A1628]" />
            <div className="absolute top-1/4 -right-32 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ backgroundColor: brandColor }} />
            <div className="absolute bottom-1/4 -left-32 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ backgroundColor: brandColor }} />
          </>
        )}
      </div>
      {/* Parallax grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-5 gap-12 items-center">
          {/* Left — Content */}
          <div className="lg:col-span-3">
            {/* Logo + Org */}
            <div className="flex items-center gap-3 mb-6">
              {data.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.logoUrl}
                  alt={data.orgName}
                  className="h-12 w-auto"
                />
              )}
              <div>
                <p className="text-white/70 text-sm font-medium">{data.orgName}</p>
                {data.orgCity && data.orgState && (
                  <p className="text-white/40 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {data.orgCity}, {data.orgState}
                  </p>
                )}
              </div>
            </div>

            {/* Badge */}
            {data.heroBadgeText && (
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
                style={{
                  backgroundColor: `${brandColor}20`,
                  color: brandColor,
                  border: `1px solid ${brandColor}40`,
                }}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: brandColor }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: brandColor }}
                  />
                </span>
                {data.heroBadgeText}
              </span>
            )}

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-6">
              {data.heroHeadline}
            </h1>

            {/* Subheadline */}
            {data.heroSubheadline && (
              <p className="text-lg sm:text-xl text-gray-300 leading-relaxed mb-8 max-w-2xl">
                {data.heroSubheadline}
              </p>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onInvest}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-white rounded-xl shadow-lg transition-all hover:brightness-110 hover:shadow-xl"
                style={{
                  backgroundColor: brandColor,
                  boxShadow: `0 10px 30px ${brandColor}40`,
                }}
              >
                {data.ctaText}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
              {data.ctaSecondary && (
                <button
                  onClick={() => {
                    document.getElementById("documents")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-gray-300 rounded-xl border border-white/10 hover:bg-white/5 transition-all"
                >
                  {data.ctaSecondary}
                  <ChevronDown className="w-5 h-5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Right — Capital Status Card */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-semibold text-lg">Capital Status</h3>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: data.fundStatus === "RAISING" ? "#10B98120" : "#F59E0B20",
                    color: data.fundStatus === "RAISING" ? "#10B981" : "#F59E0B",
                  }}
                >
                  {data.fundStatus === "RAISING" ? "Open" : data.fundStatus}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Committed</span>
                  <span className="font-mono font-semibold text-white tabular-nums">
                    {formatCurrency(data.totalCommitted)}
                  </span>
                </div>
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out relative"
                    style={{ width: `${raisePct}%`, backgroundColor: brandColor }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                  </div>
                </div>
                <div className="flex justify-between text-xs mt-2">
                  <span className="text-gray-500">{raisePct.toFixed(0)}% raised</span>
                  <span className="text-gray-500 font-mono tabular-nums">
                    Target: {formatCurrency(data.targetRaise)}
                  </span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Min. Investment</p>
                  <p className="text-white font-mono font-semibold tabular-nums">
                    {formatCurrency(data.minimumInvestment)}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Investors</p>
                  <p className="text-white font-mono font-semibold tabular-nums">
                    {data.investorCount}
                  </p>
                </div>
                {data.closingDate && (
                  <div className="bg-white/5 rounded-xl p-3 col-span-2">
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" /> Closing Date
                    </p>
                    <p className="text-white font-medium">
                      {new Date(data.closingDate).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Reg D Badge */}
              {data.regulationDExemption && (
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">
                  <Shield className="w-4 h-4" aria-hidden="true" style={{ color: brandColor }} />
                  <span>
                    {getRegDLabel(data.regulationDExemption)} &mdash; SEC Regulation D
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Metrics Bar ───────────────────────────────────────────────────────────────

function MetricsBar({
  metrics,
  brandColor,
}: {
  metrics: Array<{ label: string; value: string; subtext?: string }>;
  brandColor: string;
}) {
  return (
    <section className="relative -mt-1 bg-[#0d1a35] border-t border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className={`grid grid-cols-2 ${metrics.length >= 4 ? "lg:grid-cols-4" : `lg:grid-cols-${metrics.length}`} gap-6`}>
          {metrics.map((metric, i) => (
            <AnimatedSection key={i} delay={i * 100}>
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white mb-1">
                  {metric.value}
                </p>
                <p className="text-sm text-gray-400 font-medium">{metric.label}</p>
                {metric.subtext && (
                  <p className="text-xs mt-1" style={{ color: brandColor }}>
                    {metric.subtext}
                  </p>
                )}
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Description Section ───────────────────────────────────────────────────────

function DescriptionSection({
  description,
  orgName,
  orgDescription,
  orgCity,
  orgState,
  orgSector,
  orgFoundedYear,
  orgLogo,
}: {
  description: string;
  orgName: string;
  orgDescription: string | null;
  orgCity: string | null;
  orgState: string | null;
  orgSector: string | null;
  orgFoundedYear: number | null;
  orgLogo: string | null;
}) {
  return (
    <section className="bg-[#0A1628] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6">
              About This Offering
            </h2>
            <div className="text-gray-300 leading-relaxed whitespace-pre-line text-base">
              {description}
            </div>
          </div>
          <div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              {orgLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogo} alt={orgName} className="h-10 mb-4" />
              )}
              <h3 className="text-white font-semibold text-lg mb-2">{orgName}</h3>
              {orgDescription && (
                <p className="text-gray-400 text-sm mb-4">{orgDescription}</p>
              )}
              <div className="space-y-2 text-sm text-gray-400">
                {orgCity && orgState && (
                  <p className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    {orgCity}, {orgState}
                  </p>
                )}
                {orgSector && (
                  <p className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    {orgSector}
                  </p>
                )}
                {orgFoundedYear && (
                  <p className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    Founded {orgFoundedYear}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Highlights Section ────────────────────────────────────────────────────────

function HighlightsSection({
  highlights,
  brandColor,
}: {
  highlights: Array<{ title: string; description: string; icon?: string }>;
  brandColor: string;
}) {
  return (
    <section id="highlights" className="bg-[#0d1a35] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Investment Highlights
        </h2>
        <div className={`grid sm:grid-cols-2 ${highlights.length >= 3 ? "lg:grid-cols-3" : ""} gap-6`}>
          {highlights.map((h, i) => {
            const Icon = getIconForHighlight(h.icon);
            return (
              <AnimatedSection key={i} delay={i * 100}>
                <div
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group hover:-translate-y-1 hover:shadow-lg hover:shadow-white/5"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${brandColor}15` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: brandColor }} aria-hidden="true" />
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">{h.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{h.description}</p>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Timeline Section ──────────────────────────────────────────────────────────

function TimelineSection({
  timeline,
  brandColor,
}: {
  timeline: Array<{
    date: string;
    title: string;
    description?: string;
    status: "completed" | "current" | "upcoming";
  }>;
  brandColor: string;
}) {
  return (
    <section className="bg-[#0A1628] py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Timeline & Milestones
        </h2>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-px bg-white/10" />

          <div className="space-y-8">
            {timeline.map((item, i) => (
              <div key={i} className="relative flex gap-4 sm:gap-6">
                <div className="flex-shrink-0 w-12 sm:w-16 flex items-start justify-center pt-1 z-10">
                  {item.status === "completed" ? (
                    <CheckCircle2
                      className="w-6 h-6"
                      style={{ color: brandColor }}
                      aria-hidden="true"
                    />
                  ) : item.status === "current" ? (
                    <CircleDot
                      className="w-6 h-6 text-amber-400 animate-pulse"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="w-6 h-6 text-gray-600"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <p
                    className="text-xs font-medium uppercase tracking-wider mb-1"
                    style={{
                      color:
                        item.status === "completed"
                          ? brandColor
                          : item.status === "current"
                            ? "#F59E0B"
                            : "#6B7280",
                    }}
                  >
                    {item.date}
                  </p>
                  <h3
                    className={`text-lg font-semibold mb-1 ${
                      item.status === "upcoming" ? "text-gray-500" : "text-white"
                    }`}
                  >
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-gray-400 text-sm">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Deal Terms Section ────────────────────────────────────────────────────────

function DealTermsSection({
  terms,
  brandColor,
}: {
  terms: Array<{ label: string; value: string }>;
  brandColor: string;
}) {
  return (
    <section id="structure" className="bg-[#0d1a35] py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Deal Structure & Terms
        </h2>
        <AnimatedSection>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {terms.map((term, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-6 py-4 ${
                  i < terms.length - 1 ? "border-b border-white/5" : ""
                }`}
              >
                <span className="text-gray-400 text-sm">{term.label}</span>
                <span className="text-white font-mono font-semibold text-sm tabular-nums">
                  {term.value}
                </span>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}

// ─── Financial Projections Section ─────────────────────────────────────────────

function FinancialProjectionsSection({
  projections,
  brandColor,
}: {
  projections: {
    sections: Array<{
      title: string;
      headers: string[];
      rows: Array<{ label: string; values: string[] }>;
    }>;
  };
  brandColor: string;
}) {
  return (
    <section className="bg-[#0A1628] py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Financial Projections
        </h2>
        <div className="space-y-8">
          {projections.sections.map((section, si) => (
            <div key={si}>
              <h3 className="text-lg font-semibold text-white mb-4">{section.title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-gray-400 font-medium py-3 pr-4">
                        &nbsp;
                      </th>
                      {section.headers.map((h, hi) => (
                        <th
                          key={hi}
                          className="text-right font-mono font-semibold py-3 px-3 tabular-nums"
                          style={{ color: brandColor }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="text-gray-300 py-3 pr-4 whitespace-nowrap">
                          {row.label}
                        </td>
                        {row.values.map((v, vi) => (
                          <td
                            key={vi}
                            className="text-right text-white font-mono py-3 px-3 tabular-nums"
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Advantages Section ────────────────────────────────────────────────────────

function AdvantagesSection({
  advantages,
  brandColor,
}: {
  advantages: Array<{ title: string; description: string; icon?: string }>;
  brandColor: string;
}) {
  return (
    <section className="bg-[#0d1a35] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Competitive Advantages
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {advantages.map((a, i) => {
            const Icon = getIconForHighlight(a.icon);
            return (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all"
              >
                <Icon
                  className="w-5 h-5 mb-3"
                  style={{ color: brandColor }}
                  aria-hidden="true"
                />
                <h3 className="text-white font-semibold text-sm mb-1.5">{a.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{a.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Leadership Section ────────────────────────────────────────────────────────

function LeadershipSection({
  leadership,
  brandColor,
}: {
  leadership: Array<{
    name: string;
    title: string;
    bio?: string;
    imageUrl?: string;
  }>;
  brandColor: string;
}) {
  return (
    <section id="team" className="bg-[#0A1628] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Leadership Team
        </h2>
        <div className={`grid sm:grid-cols-2 ${leadership.length >= 3 ? "lg:grid-cols-3" : ""} gap-6 max-w-4xl mx-auto`}>
          {leadership.map((person, i) => (
            <AnimatedSection key={i} delay={i * 150}>
            <div
              className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:-translate-y-1 hover:shadow-lg hover:shadow-white/5 transition-all"
            >
              {person.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={person.imageUrl}
                  alt={person.name}
                  className="w-20 h-20 rounded-full mx-auto mb-4 object-cover"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white"
                  style={{ backgroundColor: `${brandColor}30` }}
                >
                  {person.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
              <h3 className="text-white font-semibold text-lg">{person.name}</h3>
              <p className="text-sm mb-3" style={{ color: brandColor }}>
                {person.title}
              </p>
              {person.bio && (
                <p className="text-gray-400 text-sm leading-relaxed">{person.bio}</p>
              )}
            </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Gallery Section ───────────────────────────────────────────────────────────

function GallerySection({
  gallery,
}: {
  gallery: Array<{ url: string; caption?: string; type: "image" | "video" }>;
}) {
  return (
    <section className="bg-[#0d1a35] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Gallery
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gallery.map((item, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden">
              {item.type === "video" ? (
                <video
                  src={item.url}
                  className="w-full aspect-video object-cover"
                  controls
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.caption || "Gallery image"}
                  className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <p className="text-white text-sm">{item.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Documents Section ─────────────────────────────────────────────────────────

function DocumentsSection({
  documents,
  brandColor,
  emailGateEnabled,
  gateSubmitted,
  onRequestAccess,
}: {
  documents: Array<{
    name: string;
    type: string;
    isGated: boolean;
    url?: string;
  }>;
  brandColor: string;
  emailGateEnabled: boolean;
  gateSubmitted: boolean;
  onRequestAccess: () => void;
}) {
  return (
    <section id="documents" className="bg-[#0A1628] py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">
          Documents & Dataroom
        </h2>
        <div className="space-y-3">
          {documents.map((doc, i) => (
            <AnimatedSection key={i} delay={i * 80}>
            <div
              className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: doc.type === "PDF" ? "rgba(239,68,68,0.1)" : doc.type === "XLSX" ? "rgba(46,204,113,0.1)" : `${brandColor}15`,
                    color: doc.type === "PDF" ? "#EF4444" : doc.type === "XLSX" ? "#2ECC71" : brandColor,
                  }}
                >
                  {doc.type}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{doc.name}</p>
                </div>
              </div>
              {doc.isGated ? (
                emailGateEnabled && !gateSubmitted ? (
                  <button
                    onClick={onRequestAccess}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors flex items-center gap-1.5"
                  >
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    Request Access
                  </button>
                ) : gateSubmitted ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Access Requested
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    Gated
                  </span>
                )
              ) : doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-white hover:brightness-110"
                  style={{ backgroundColor: brandColor }}
                  aria-label={`View ${doc.name} (opens in new tab)`}
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  View
                </a>
              ) : (
                <span className="text-xs text-gray-500">Available</span>
              )}
            </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA({
  data,
  brandColor,
  onInvest,
}: {
  data: OfferingData;
  brandColor: string;
  onInvest: () => void;
}) {
  return (
    <section className="bg-[#0d1a35] py-20 sm:py-24">
      <AnimatedSection>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Invest?
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
            Join {data.investorCount > 0 ? `${data.investorCount} investors` : "other investors"} in{" "}
            {data.fundName}. Minimum investment of{" "}
            <span className="text-white font-mono font-semibold tabular-nums">
              {formatCurrency(data.minimumInvestment)}
            </span>
            .
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onInvest}
              className="inline-flex items-center justify-center gap-2 px-10 py-4 text-lg font-semibold text-white rounded-xl shadow-lg transition-all hover:brightness-110"
              style={{
                backgroundColor: brandColor,
                boxShadow: `0 10px 30px ${brandColor}40`,
              }}
            >
              {data.ctaText}
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {data.regulationDExemption && (
            <p className="text-xs text-gray-500 mt-6">
              This offering is available under{" "}
              {getRegDLabel(data.regulationDExemption)}{" "}
              {data.regulationDExemption === "506C"
                ? "to verified accredited investors only"
                : ""}
            </p>
          )}
        </div>
      </AnimatedSection>
    </section>
  );
}

// ─── Compliance Footer ─────────────────────────────────────────────────────────

function ComplianceFooter({
  data,
  brandColor,
}: {
  data: OfferingData;
  brandColor: string;
}) {
  return (
    <footer className="bg-[#060d1a] border-t border-white/5 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-xs text-gray-500 leading-relaxed space-y-4">
          <p>
            <strong className="text-gray-400">Important Disclaimer:</strong> This
            page is for informational purposes only and does not constitute an
            offer to sell or a solicitation of an offer to buy any securities.
            Securities offerings are made only through official offering documents
            provided to qualified investors. Past performance is not indicative of
            future results. All investments involve risk, including the possible
            loss of principal.
          </p>
          {data.regulationDExemption === "506C" && (
            <p>
              This offering is made pursuant to Rule 506(c) of Regulation D under
              the Securities Act of 1933, as amended. Only verified accredited
              investors may participate. The issuer will take reasonable steps to
              verify accredited investor status as required by SEC regulations.
            </p>
          )}
          {data.regulationDExemption === "506B" && (
            <p>
              This offering is made pursuant to Rule 506(b) of Regulation D under
              the Securities Act of 1933, as amended. Securities are offered
              privately and have not been registered under the Securities Act.
            </p>
          )}
          {data.disclaimerText && <p>{data.disclaimerText}</p>}
          <div className="pt-4 flex items-center justify-between">
            <p className="text-gray-600">
              &copy; {new Date().getFullYear()} {data.orgName}. All rights
              reserved.
            </p>
            {!data.removeBranding && (
              <a
                href="https://fundroom.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-400 transition-colors"
                aria-label="Powered by FundRoom AI (opens in new tab)"
              >
                Powered by{" "}
                <span className="font-semibold" style={{ color: brandColor }}>
                  FundRoom AI
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Email Gate Modal ──────────────────────────────────────────────────────────

function EmailGateModal({
  email,
  setEmail,
  name,
  setName,
  accredited,
  setAccredited,
  onSubmit,
  onClose,
  isSubmitting,
  brandColor,
}: {
  email: string;
  setEmail: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  accredited: boolean;
  setAccredited: (v: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
  isSubmitting: boolean;
  brandColor: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-8 sm:p-10 max-w-md w-full relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-2xl font-semibold text-gray-900 mb-1" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
          Express Interest
        </h3>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Complete below to access the full dataroom and connect with our investment team.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent text-base transition-all"
              style={{ focusRingColor: brandColor } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent text-base transition-all"
              style={{ focusRingColor: brandColor } as React.CSSProperties}
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-600 leading-relaxed pt-1">
            <input
              type="checkbox"
              checked={accredited}
              onChange={(e) => setAccredited(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded"
              style={{ accentColor: brandColor }}
            />
            I confirm that I am an accredited investor as defined under SEC Regulation D, Rule 501.
          </label>
          <button
            type="submit"
            disabled={isSubmitting || !email || !name || !accredited}
            className="w-full py-3.5 rounded-lg text-white font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: email && name && accredited ? brandColor : "#cbd5e1" }}
          >
            {isSubmitting ? "Submitting..." : "REQUEST ACCESS \u2192"}
          </button>
        </form>
      </div>
    </div>
  );
}
