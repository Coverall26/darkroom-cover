"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, PenTool, ExternalLink } from "lucide-react";
import DashboardSectionWrapper, {
  SigningSkeleton,
} from "@/components/lp/dashboard-section-wrapper";

interface PendingSignature {
  id: string;
  documentId: string;
  documentTitle: string;
  teamName: string;
  signingToken: string;
  status: string;
  sentAt: string | null;
}

interface LPPendingSignaturesProps {
  signatures: PendingSignature[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * LPPendingSignatures — Pending e-signature documents section.
 * Shows actionable cards for documents awaiting LP signature.
 */
export function LPPendingSignatures({
  signatures,
  loading,
  error,
  onRetry,
}: LPPendingSignaturesProps) {
  if (!loading && !error && signatures.length === 0) return null;

  return (
    <div className="mb-6">
      <DashboardSectionWrapper
        title="Pending Signatures"
        isLoading={loading}
        error={error}
        onRetry={onRetry}
        skeleton={<SigningSkeleton />}
      >
        {signatures.length > 0 && (
          <Card className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-amber-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <PenTool className="h-5 w-5 mr-2 text-amber-400" />
                Action Required: Documents to Sign
              </CardTitle>
              <CardDescription className="text-amber-200/70">
                You have{" "}
                <span className="font-mono tabular-nums">{signatures.length}</span>{" "}
                document{signatures.length > 1 ? "s" : ""} awaiting your signature
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-800/70 rounded-lg border border-amber-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/20 rounded-lg">
                        <FileText className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{sig.documentTitle}</p>
                        <p className="text-gray-400 text-sm">
                          From {sig.teamName}{" "}
                          {sig.sentAt &&
                            `• Sent ${new Date(sig.sentAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`/view/sign/${sig.signingToken}`}
                      className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                    >
                      <PenTool className="h-4 w-4" />
                      Sign Now
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </DashboardSectionWrapper>
    </div>
  );
}
