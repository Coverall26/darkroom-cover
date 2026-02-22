"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FolderOpen,
  Upload,
  Users,
  ArrowRight,
  Loader2,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackFunnel } from "@/lib/tracking/analytics-events";

export default function OnboardingCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const dataroomId = searchParams?.get("dataroomId") || "";
  const teamId = searchParams?.get("teamId") || "";
  const orgName = searchParams?.get("orgName") || "Your Organization";
  const linkId = searchParams?.get("linkId") || "";

  const [copied, setCopied] = useState(false);
  const [launched, setLaunched] = useState(false);

  const shareUrl = linkId
    ? `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://app.fundroom.ai"}/view/${linkId}`
    : "";

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Track completion
  useEffect(() => {
    if (dataroomId && teamId) {
      trackFunnel({
        name: "funnel_first_dataroom_created",
        properties: { teamId, dataroomId },
      });
    }
  }, [dataroomId, teamId]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleLaunch = () => {
    setLaunched(true);
    // Short delay for the animation, then redirect to dataroom
    setTimeout(() => {
      router.push(`/datarooms/${dataroomId}/documents`);
    }, 1500);
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!dataroomId) {
    // Missing required params — redirect to admin dashboard
    router.replace("/admin/dashboard");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-6 py-12">
        {/* Success header */}
        <div className="mb-8 text-center">
          <div
            className={cn(
              "mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500",
              launched
                ? "bg-green-600/20 scale-110"
                : "bg-blue-600/20",
            )}
          >
            {launched ? (
              <Rocket className="h-10 w-10 text-green-400 animate-bounce" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-blue-400" />
            )}
          </div>

          <h1 className="mb-2 text-3xl font-bold text-white">
            {launched ? "Launched!" : "Your dataroom is ready"}
          </h1>
          <p className="text-gray-400">
            {launched
              ? "Redirecting to your dataroom..."
              : `${orgName}'s dataroom has been created. Upload documents and share with investors.`}
          </p>
        </div>

        {!launched && (
          <>
            {/* Share link card */}
            {shareUrl && (
              <div className="mb-8 w-full rounded-lg border border-gray-800 bg-gray-900/50 p-6">
                <div className="mb-3 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Investor share link
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 overflow-hidden rounded-md border border-gray-700 bg-gray-800 px-4 py-2.5">
                    <p className="truncate text-sm text-gray-300">
                      {shareUrl}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="shrink-0 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    {copied ? (
                      <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="mr-1.5 h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Investors enter their email to access the dataroom. You will be
                  notified when someone views it.
                </p>
              </div>
            )}

            {/* Next steps */}
            <div className="mb-8 w-full space-y-3">
              <h2 className="mb-4 text-lg font-semibold text-white">
                Next steps
              </h2>

              <button
                onClick={() =>
                  router.push(`/datarooms/${dataroomId}/documents`)
                }
                className="flex w-full items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-left transition-colors hover:border-blue-500/50 hover:bg-gray-900"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <Upload className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Upload documents</p>
                  <p className="text-sm text-gray-400">
                    Add pitch decks, financials, legal docs to your dataroom
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-600" />
              </button>

              <button
                onClick={() =>
                  router.push(`/datarooms/${dataroomId}/groups`)
                }
                className="flex w-full items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-left transition-colors hover:border-blue-500/50 hover:bg-gray-900"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-600/20">
                  <Users className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Invite investors</p>
                  <p className="text-sm text-gray-400">
                    Create viewer groups and send access invitations
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-600" />
              </button>

              <button
                onClick={() =>
                  router.push(`/datarooms/${dataroomId}/settings`)
                }
                className="flex w-full items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-left transition-colors hover:border-blue-500/50 hover:bg-gray-900"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-600/20">
                  <FolderOpen className="h-5 w-5 text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">Dataroom settings</p>
                  <p className="text-sm text-gray-400">
                    Configure branding, permissions, and access controls
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            {/* Launch button */}
            <Button
              onClick={handleLaunch}
              size="lg"
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              <Rocket className="mr-2 h-5 w-5" />
              Go to Dataroom
            </Button>

            <p className="mt-4 text-center text-xs text-gray-500">
              You can always access your dataroom from the dashboard.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
