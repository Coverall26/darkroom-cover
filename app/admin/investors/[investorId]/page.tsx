import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import InvestorProfileClient from "./page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Investor Profile | FundRoom",
};

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ investorId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { investorId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <InvestorProfileClient investorId={investorId} />
    </Suspense>
  );
}
