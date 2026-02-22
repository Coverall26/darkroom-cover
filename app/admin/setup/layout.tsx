import { Suspense } from "react";

export const metadata = {
  title: "Organization Setup — FundRoom",
};

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
        {children}
      </Suspense>
    </div>
  );
}
