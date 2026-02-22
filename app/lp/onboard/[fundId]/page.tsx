import { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Investor Onboarding | FundRoom",
  description: "Register as an investor with FundRoom",
};

/**
 * LP Onboarding with [fundId] dynamic route.
 * Redirects to the existing /lp/onboard page with fundId as a query parameter.
 * This provides a clean URL structure: /lp/onboard/{fundId}
 * while reusing the comprehensive existing onboarding implementation.
 */
export default async function LPOnboardFundPage({
  params,
}: {
  params: Promise<{ fundId: string }>;
}) {
  const { fundId } = await params;

  if (!fundId) {
    redirect("/lp/onboard");
  }

  redirect(`/lp/onboard?fundId=${encodeURIComponent(fundId)}`);
}
