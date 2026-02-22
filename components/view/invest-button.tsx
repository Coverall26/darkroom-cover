"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Clock, Sparkles, Mail } from "lucide-react";

/**
 * "I Want to Invest" Button — 4-State Machine
 *
 * State 1 — No Fundroom: "Express Interest" (lead capture via email)
 * State 2 — Configured, not paid: "I Want to Invest" → "Opening soon" message
 * State 3 — LIVE: Launches LP Onboarding Wizard
 * State 4 — Preview mode: PREVIEW watermark, no real data
 */

export type InvestButtonState =
  | "NO_FUND"         // State 1: No fund configured
  | "NOT_ACTIVATED"   // State 2: Fund exists but not paid/activated
  | "LIVE"            // State 3: Fund is live and accepting investors
  | "PREVIEW";        // State 4: Preview mode (GP testing)

interface InvestButtonProps {
  state: InvestButtonState;
  fundId?: string;
  dataroomSlug?: string;
  teamId?: string;
  referralSource?: string;
  className?: string;
  onExpressInterest?: (email: string, name?: string) => Promise<void>;
}

export function InvestButton({
  state,
  fundId,
  dataroomSlug,
  teamId,
  referralSource,
  className,
  onExpressInterest,
}: InvestButtonProps) {
  const router = useRouter();
  const [showInterestDialog, setShowInterestDialog] = useState(false);
  const [showComingSoonDialog, setShowComingSoonDialog] = useState(false);
  const [interestEmail, setInterestEmail] = useState("");
  const [interestName, setInterestName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleClick = () => {
    switch (state) {
      case "NO_FUND":
        setShowInterestDialog(true);
        break;
      case "NOT_ACTIVATED":
        setShowComingSoonDialog(true);
        break;
      case "LIVE":
        // Navigate to LP onboarding with fund + team context
        if (!fundId) {
          // Safety: LIVE state should never be reached without a fundId.
          // determineInvestButtonState returns NO_FUND when fundExists is false.
          console.warn("[InvestButton] LIVE state reached without fundId — blocking navigation");
          break;
        }
        const params = new URLSearchParams();
        params.set("fundId", fundId);
        if (teamId) params.set("teamId", teamId);
        if (referralSource) params.set("ref", referralSource);
        router.push(`/lp/onboard?${params.toString()}`);
        break;
      case "PREVIEW":
        // No real action in preview mode
        break;
    }
  };

  const handleExpressInterest = async () => {
    if (!interestEmail) return;
    setIsSubmitting(true);
    try {
      if (onExpressInterest) {
        await onExpressInterest(interestEmail, interestName);
      } else {
        // Default: POST to lead capture API
        await fetch("/api/lp/express-interest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: interestEmail,
            name: interestName,
            dataroomSlug,
            teamId,
          }),
        });
      }
      setSubmitted(true);
    } catch {
      // Silently handle — better UX than an error
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonConfig = () => {
    switch (state) {
      case "NO_FUND":
        return {
          label: "Express Interest",
          icon: <Mail className="ml-2 h-4 w-4" />,
          variant: "default" as const,
        };
      case "NOT_ACTIVATED":
        return {
          label: "I Want to Invest",
          icon: <Clock className="ml-2 h-4 w-4" />,
          variant: "default" as const,
        };
      case "LIVE":
        return {
          label: "I Want to Invest",
          icon: <ArrowRight className="ml-2 h-4 w-4" />,
          variant: "default" as const,
        };
      case "PREVIEW":
        return {
          label: "I Want to Invest",
          icon: <Sparkles className="ml-2 h-4 w-4" />,
          variant: "outline" as const,
        };
    }
  };

  const config = getButtonConfig();

  return (
    <>
      <div className={`relative ${className || ""}`}>
        {state === "PREVIEW" && (
          <div className="absolute -top-2 -right-2 z-10 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            PREVIEW
          </div>
        )}
        <Button
          onClick={handleClick}
          variant={config.variant}
          className={`${
            state === "LIVE"
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : state === "PREVIEW"
                ? "border-amber-500 text-amber-600 hover:bg-amber-50"
                : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
          disabled={state === "PREVIEW"}
        >
          {config.label}
          {config.icon}
        </Button>
      </div>

      {/* State 1: Express Interest Dialog (lead capture) */}
      <Dialog open={showInterestDialog} onOpenChange={setShowInterestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Express Your Interest</DialogTitle>
            <DialogDescription>
              Leave your details and we&apos;ll notify you when this opportunity
              becomes available for investment.
            </DialogDescription>
          </DialogHeader>
          {!submitted ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="interest-name">Name (optional)</Label>
                <Input
                  id="interest-name"
                  placeholder="Your name"
                  value={interestName}
                  onChange={(e) => setInterestName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest-email">Email</Label>
                <Input
                  id="interest-email"
                  type="email"
                  placeholder="you@example.com"
                  value={interestEmail}
                  onChange={(e) => setInterestEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                onClick={handleExpressInterest}
                disabled={!interestEmail || isSubmitting}
                className="w-full bg-blue-600 text-white hover:bg-blue-700"
              >
                {isSubmitting ? "Submitting..." : "Submit Interest"}
              </Button>
            </div>
          ) : (
            <div className="py-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <p className="font-medium">Thank you for your interest!</p>
              <p className="mt-1 text-sm text-gray-500">
                We&apos;ll reach out when this fund opens for investment.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* State 2: Coming Soon Dialog */}
      <Dialog
        open={showComingSoonDialog}
        onOpenChange={setShowComingSoonDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Opening Soon</DialogTitle>
            <DialogDescription>
              This fund is being set up and will be accepting investors soon.
              Check back shortly or contact the fund manager for details.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowComingSoonDialog(false)}
            className="w-full"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Determine the invest button state based on fund configuration.
 */
export function determineInvestButtonState(params: {
  fundExists: boolean;
  fundActivated: boolean;
  isPreview: boolean;
}): InvestButtonState {
  if (params.isPreview) return "PREVIEW";
  if (!params.fundExists) return "NO_FUND";
  if (!params.fundActivated) return "NOT_ACTIVATED";
  return "LIVE";
}
