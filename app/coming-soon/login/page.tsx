import { Metadata } from "next";

const data = {
  description:
    "FundRoom.ai platform login is launching soon — secure access to your investor portal, fund dashboard, and administrative tools.",
  title: "Login Coming Soon | FundRoom AI",
  url: "/coming-soon/login",
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

export default function ComingSoonLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d1033] to-[#0a0a1a] flex flex-col items-center justify-center relative overflow-hidden" suppressHydrationWarning>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-24 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-24 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-6 text-center">
        <div className="mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/_static/fundroom-logo-white.png"
            alt="FundRoom AI"
            className="h-16 md:h-20 mx-auto object-contain"
            style={{ aspectRatio: "auto" }}
          />
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-10 shadow-2xl shadow-black/20">
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              Coming Soon
            </span>
          </div>

          <div className="mb-6">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl flex items-center justify-center border border-white/10">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight tracking-tight">
            Platform Login
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-300 bg-clip-text text-transparent">
              Launching Shortly
            </span>
          </h1>

          <p className="text-base text-gray-300 mb-6 leading-relaxed">
            We&apos;re hard at work preparing your secure login portal. The FundRoom.ai
            platform will be live soon with encrypted access to your dashboards,
            documents, and fund management tools.
          </p>

          <div className="space-y-3 mb-8 text-left">
            {[
              "Magic link & OAuth authentication",
              "AES-256 encrypted data at rest & in transit",
              "Role-based access for GPs, LPs & Admins",
              "Personalized investor dashboards",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {feature}
              </div>
            ))}
          </div>

          <a
            href="mailto:contact@fundroom.ai"
            className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-blue-500/40 text-base"
          >
            Notify Me When Live
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a
            href="https://fundroom.ai"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to FundRoom.ai
          </a>
          <span className="text-gray-600 hidden sm:inline">·</span>
          <a
            href="mailto:contact@fundroom.ai"
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            contact@fundroom.ai
          </a>
        </div>
      </div>

      <footer className="absolute bottom-6 text-center text-gray-600 text-xs">
        © 2026 FundRoom AI — Military-Grade Security Meets Effortless Fund Management
      </footer>
    </div>
  );
}
