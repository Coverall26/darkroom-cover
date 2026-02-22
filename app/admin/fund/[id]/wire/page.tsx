import { Suspense } from "react";
import WireInstructionsClient from "./page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wire Instructions | FundRoom Admin",
};

export default async function WireInstructionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <WireInstructionsClient fundId={id} />
    </Suspense>
  );
}
