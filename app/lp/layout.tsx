import { LPHeader } from "@/components/lp/lp-header";
import { LPBottomTabBar } from "@/components/lp/bottom-tab-bar";

/**
 * LP Portal Layout — Dark theme is an intentional V1 design decision.
 * The dark gradient provides a premium fintech aesthetic consistent with
 * the FundRoom brand (Deep Navy #0A1628 backgrounds per Brand Guidelines).
 * All text uses white/gray-300 on gray-900 backgrounds meeting WCAG AA 4.5:1 contrast.
 * V2: Consider adding theme toggle in LP Settings tab or respecting prefers-color-scheme.
 */
export default function LPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-x-hidden">
      <LPHeader />
      <main className="pb-20 md:pb-0">{children}</main>
      <LPBottomTabBar />
    </div>
  );
}
