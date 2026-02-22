"use client";

import { AlertCircle, Clock, CheckCircle2, FileSignature, Send, BadgeCheck } from "lucide-react";

type LPStatus =
  | "nda_required"
  | "accreditation_needed"
  | "pending_signatures"
  | "committed"
  | "wire_pending"
  | "active"
  | "loading";

interface LPNotificationPanelProps {
  status: LPStatus;
  ndaSigned: boolean;
  accreditationStatus: string;
  pendingSignatureCount: number;
}

/**
 * LPNotificationPanel — Status banner shown at top of LP dashboard.
 * 6 distinct states covering the full LP investment lifecycle.
 */
export function LPNotificationPanel({
  status,
  pendingSignatureCount,
}: LPNotificationPanelProps) {
  if (status === "nda_required") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-amber-700/50 bg-amber-900/20" role="alert">
        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">NDA Required</p>
          <p className="text-xs text-amber-300/70">
            Sign the Non-Disclosure Agreement to continue your onboarding.
          </p>
        </div>
      </div>
    );
  }

  if (status === "accreditation_needed") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-amber-700/50 bg-amber-900/20" role="alert">
        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <BadgeCheck className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">Accreditation Needed</p>
          <p className="text-xs text-amber-300/70">
            Complete your accreditation verification to proceed with your investment.
          </p>
        </div>
      </div>
    );
  }

  if (status === "pending_signatures") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-amber-700/50 bg-amber-900/20" role="alert">
        <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <FileSignature className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">Documents Pending Signature</p>
          <p className="text-xs text-amber-300/70">
            {pendingSignatureCount} document{pendingSignatureCount !== 1 ? "s" : ""} awaiting your signature.
          </p>
        </div>
      </div>
    );
  }

  if (status === "committed") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-blue-700/50 bg-blue-900/20">
        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Clock className="h-5 w-5 text-blue-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-200">Commitment Under Review</p>
          <p className="text-xs text-blue-300/70">
            Your commitment is being reviewed by the fund manager. You&apos;ll be notified once approved.
          </p>
        </div>
      </div>
    );
  }

  if (status === "wire_pending") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-purple-700/50 bg-purple-900/20">
        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Send className="h-5 w-5 text-purple-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-purple-200">Wire Transfer Pending</p>
          <p className="text-xs text-purple-300/70">
            Your commitment is approved. Send your wire transfer to complete funding.
          </p>
        </div>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-emerald-700/50 bg-emerald-900/20">
        <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-200">Investment Active</p>
          <p className="text-xs text-emerald-300/70">
            Your investment is fully funded. View your documents and track
            distributions below.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
