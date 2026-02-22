import { Metadata } from "next";

const data = {
  description:
    "FundRoom.ai is launching soon — a comprehensive GP + Startup platform for fundraising, investor onboarding, and fund management.",
  title: "Launching Soon | FundRoom AI",
  url: "/coming-soon/signup",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://fundroom.ai"),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "FundRoom AI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    creator: "@fundroomai",
  },
};

export default function ComingSoonSignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d1033] to-[#0a0a1a] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        <div className="mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/_static/fundroom-logo-white.png"
            alt="FundRoom AI"
            className="h-16 md:h-20 mx-auto object-contain"
            style={{ aspectRatio: "auto" }}
          />
        </div>

        <div className="mb-4">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-medium tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            Platform Launching Soon
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
          We&apos;re Building
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-300 bg-clip-text text-transparent">
            Something Great
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-300 mb-4 leading-relaxed max-w-xl mx-auto">
          Military-grade security meets effortless fund management. Our comprehensive
          GP + Startup platform is almost ready for you.
        </p>

        <p className="text-base text-gray-400 mb-10 max-w-lg mx-auto">
          Secure investor portals, datarooms, compliance infrastructure, and
          capital management — all in one place. We&apos;re putting the finishing
          touches on your fundraising command center.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Secure Datarooms", icon: "🔒" },
            { label: "Investor Portals", icon: "👤" },
            { label: "Compliance Built-In", icon: "✓" },
            { label: "Capital Tracking", icon: "📊" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-4 text-center"
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-sm text-gray-300 font-medium">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <a
            href="mailto:contact@fundroom.ai"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-blue-500/40 text-base"
          >
            Get Notified at Launch
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
          <a
            href="https://fundroom.ai"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 text-base"
          >
            Learn More
          </a>
        </div>

        <p className="text-gray-500 text-sm">
          Questions? Reach us at{" "}
          <a href="mailto:contact@fundroom.ai" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            contact@fundroom.ai
          </a>
        </p>
      </div>

      <footer className="absolute bottom-6 text-center text-gray-600 text-xs">
        © 2026 FundRoom AI — Military-Grade Security Meets Effortless Fund Management
      </footer>
    </div>
  );
}
