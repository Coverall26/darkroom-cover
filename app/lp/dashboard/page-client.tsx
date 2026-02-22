"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Building2,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { KycVerification } from "@/components/lp/kyc-verification";
import { ActivityTimeline } from "@/components/lp/activity-timeline";
import { FundCard } from "@/components/lp/fund-card";
import { DocumentsVault } from "@/components/lp/documents-vault";
import { ManualInvestmentsCard } from "@/components/lp/manual-investments-card";
import { NotesCard } from "@/components/lp/notes-card";
import { DashboardSummary } from "@/components/lp/dashboard-summary";
import { DashboardSkeleton } from "@/components/lp/dashboard-skeleton";
import { WelcomeBanner } from "@/components/lp/welcome-banner";
import { EmptyState } from "@/components/lp/empty-state";
import { SubscriptionModal } from "@/components/lp/subscription-modal";
import { SubscriptionBanner } from "@/components/lp/subscription-banner";
import { StagedCommitmentWizard, type StagedCommitmentData } from "@/components/lp/staged-commitment-wizard";
import { UploadDocumentModal } from "@/components/lp/upload-document-modal";
import { NdaAccreditationDialog } from "@/components/lp/nda-accreditation-dialog";
import { LPCapitalCallsSection } from "@/components/lp/capital-calls-section";
import DashboardSectionWrapper, {
  DocumentsSkeleton,
  CapitalCallsSkeleton,
} from "@/components/lp/dashboard-section-wrapper";
import {
  LPNotificationPanel,
  LPQuickActions,
  LPStatusTracker,
  LPPendingSignatures,
  LPTransactionTimeline,
} from "@/components/lp/dashboard";
import { CelebrationConfetti } from "@/components/lp/celebration-confetti";

interface InvestorDocument {
  id: string;
  title: string;
  documentType: string;
  signedAt: string | null;
  createdAt: string;
}

interface PendingSignature {
  id: string;
  documentId: string;
  documentTitle: string;
  teamName: string;
  signingToken: string;
  status: string;
  sentAt: string | null;
}

interface InvestorData {
  id: string;
  entityName: string | null;
  ndaSigned: boolean;
  accreditationStatus: string;
  fundData: any;
  signedDocs: any[];
  documents: InvestorDocument[];
  kycStatus?: string;
  kycVerifiedAt?: string | null;
  totalCommitment?: number;
  totalFunded?: number;
}

interface CapitalCall {
  id: string;
  callNumber: number;
  amount: string;
  dueDate: string;
  status: string;
  fundName: string;
}

interface FundAggregate {
  id: string;
  name: string;
  targetRaise: string;
  currentRaise: string;
  status: string;
  investorCount: number;
}

interface SignedDocument {
  id: string;
  title: string;
  documentType: string;
  fileUrl: string | null;
  signedAt: string | null;
  createdAt: string;
}

interface LPVisibility {
  showCapitalCalls: boolean;
  showDistributions: boolean;
  showNAV: boolean;
  showDocuments: boolean;
  showTransactions: boolean;
  showReports: boolean;
}

interface FundDetailsData {
  summary: {
    totalCommitment: number;
    totalFunded: number;
    totalDistributions: number;
    activeFunds: number;
    pendingCapitalCallsCount: number;
    pendingCapitalCallsTotal: number;
  };
  funds: any[];
  pendingCapitalCalls: any[];
  recentTransactions: any[];
  documents: any[];
  notes: any[];
  lpVisibility?: LPVisibility;
  lastUpdated: string;
}

export default function LPDashboardClient() {
  const router = useRouter();
  const sessionData = useSession();
  const session = sessionData?.data;
  const sessionStatus = sessionData?.status ?? "loading";
  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [capitalCalls, setCapitalCalls] = useState<CapitalCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Per-section loading and error states
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [signaturesLoading, setSignaturesLoading] = useState(true);
  const [signaturesError, setSignaturesError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [showNdaModal, setShowNdaModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [ndaSignature, setNdaSignature] = useState<string | null>(null);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [accreditationData, setAccreditationData] = useState({
    confirmIncome: false,
    confirmNetWorth: false,
    confirmAccredited: false,
    confirmRiskAware: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteSending, setNoteSending] = useState(false);
  const [pendingSignatures, setPendingSignatures] = useState<PendingSignature[]>([]);
  const [bankStatus, setBankStatus] = useState<{
    hasBankLink: boolean;
    configured: boolean;
    bankLink: {
      institutionName: string | null;
      accountName: string | null;
      accountMask: string | null;
      accountType: string | null;
    } | null;
  } | null>(null);
  const [gateProgress, setGateProgress] = useState({
    ndaCompleted: false,
    accreditationCompleted: false,
    completionPercentage: 0,
  });
  const [fundAggregates, setFundAggregates] = useState<FundAggregate[]>([]);
  const [signedDocs, setSignedDocs] = useState<SignedDocument[]>([]);
  const [noteSent, setNoteSent] = useState(false);
  const [fundDetails, setFundDetails] = useState<FundDetailsData | null>(null);
  const [fundDetailsError, setFundDetailsError] = useState<string | null>(null);
  const [fundDetailsLoaded, setFundDetailsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [offeringDocuments, setOfferingDocuments] = useState<{
    id: string;
    name: string;
    description: string;
    url: string;
    version: string;
    required: boolean;
    order: number;
  }[]>([]);
  const POLL_INTERVAL = 30000; // 30 seconds for real-time updates

  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    hasSubscription: boolean;
    canSubscribe: boolean;
    fund: any;
    pendingSubscription: any;
    signedSubscription: any;
    processingSubscription: any;
    hasBankAccount: boolean;
    entityName: string | null;
  } | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lpFundInfo, setLpFundInfo] = useState<{ id: string; name: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showStagedWizard, setShowStagedWizard] = useState(false);
  const [stagedCommitmentInfo, setStagedCommitmentInfo] = useState<{
    enabled: boolean;
    fundId: string;
    fundName: string;
    minimumInvestment: number;
    totalCommitted: number;
  } | null>(null);

  const fetchFundDetails = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
      setTransactionsLoading(true);
    }
    setTransactionsError(null);
    try {
      const res = await fetch("/api/lp/fund-details");
      if (res.ok) {
        const data = await res.json();
        setFundDetails(data);
        setFundDetailsError(null);
        if (data.funds?.[0] && !lpFundInfo) {
          setLpFundInfo({ id: data.funds[0].id, name: data.funds[0].name });
        }
      } else if (res.status === 404) {
        setFundDetails(null);
        setFundDetailsError(null);
      } else {
        setFundDetailsError("Unable to load fund details. Please try again.");
        setTransactionsError("Please try again.");
      }
    } catch (error) {
      console.error("Error fetching fund details:", error);
      if (!silent) {
        setFundDetailsError("Connection error. Please check your internet.");
        setTransactionsError("Connection error. Please check your internet.");
      }
    } finally {
      setFundDetailsLoaded(true);
      setTransactionsLoading(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/lp/subscription-status");
      if (res.ok) {
        const data = await res.json();
        setSubscriptionStatus(data);
        if (data.canSubscribe && !data.hasSubscription && investor?.ndaSigned) {
          setShowSubscriptionModal(true);
        }
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error);
    }
  }, [investor?.ndaSigned]);

  const handleSubscribe = async (data: { units?: number; amount: number; tierId?: string }) => {
    if (!subscriptionStatus?.fund) return;

    const res = await fetch("/api/lp/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: subscriptionStatus.fund.id,
        units: data.units,
        amount: data.amount,
        tierId: data.tierId,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Subscription failed");
    }

    const result = await res.json();
    setShowSubscriptionModal(false);
    if (result.signingUrl) {
      window.location.href = result.signingUrl;
    } else {
      fetchSubscriptionStatus();
      fetchFundDetails();
    }
  };

  const handleProcessPayment = async () => {
    if (!subscriptionStatus?.signedSubscription) return;
    
    setIsProcessingPayment(true);
    try {
      const res = await fetch("/api/lp/subscription/process-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: subscriptionStatus.signedSubscription.id,
        }),
      });

      const result = await res.json();
      
      if (!res.ok) {
        if (result.code === "NO_BANK_ACCOUNT") {
          router.push("/lp/bank-connect");
          return;
        }
        throw new Error(result.error || "Payment processing failed");
      }

      toast.success("Payment initiated successfully! Funds will be debited within 1-3 business days.");
      fetchSubscriptionStatus();
      fetchFundDetails();
    } catch (error: any) {
      console.error("Payment error:", error);
      toast.error(error.message || "Failed to process payment");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Fetch staged commitment info
  useEffect(() => {
    if (investor?.ndaSigned && investor?.accreditationStatus !== "PENDING") {
      fetch("/api/lp/staged-commitment")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.stagedCommitmentsEnabled) {
            setStagedCommitmentInfo({
              enabled: true,
              fundId: data.fundId,
              fundName: data.fundName,
              minimumInvestment: data.minimumInvestment,
              totalCommitted: data.totalCommitted,
            });
          }
        })
        .catch(console.error);
    }
  }, [investor?.ndaSigned, investor?.accreditationStatus]);

  const handleStagedCommitment = async (data: StagedCommitmentData) => {
    const res = await fetch("/api/lp/staged-commitment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to create staged commitment");
    }

    setShowStagedWizard(false);
    toast.success("Staged commitment created successfully!");
    fetchFundDetails();
    fetchSubscriptionStatus();
  };

  // Fetch subscription status and offering documents after NDA is signed
  useEffect(() => {
    if (investor?.ndaSigned && investor?.accreditationStatus !== "PENDING") {
      fetchSubscriptionStatus();
    }
    if (investor?.ndaSigned && investor?.accreditationStatus === "VERIFIED") {
      fetch("/api/lp/offering-documents")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.documents) {
            setOfferingDocuments(data.documents);
          }
        })
        .catch(console.error);
    }
  }, [investor?.ndaSigned, investor?.accreditationStatus, fetchSubscriptionStatus]);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const meResponse = await fetch("/api/lp/me");
      if (!meResponse.ok) {
        if (meResponse.status === 404) {
          router.push("/lp/onboard");
          return;
        }
        throw new Error("Please try again.");
      }
      const data = await meResponse.json();
      setInvestor(data.investor);
      setCapitalCalls(data.capitalCalls || []);
      setFundAggregates(data.fundAggregates || []);

      if (data.gateProgress) {
        setGateProgress(data.gateProgress);
      }

      // Bank status fetch (non-critical)
      try {
        const bankRes = await fetch("/api/lp/bank/status");
        if (bankRes.ok) {
          const bankData = await bankRes.json();
          setBankStatus(bankData);
        }
      } catch (e) {
        console.error("Error fetching bank status:", e);
      }

      const ndaGateEnabled = data.ndaGateEnabled !== false;
      const gateIncomplete = data.gateProgress
        ? data.gateProgress.completionPercentage < 100
        : (!data.investor.ndaSigned || data.investor.accreditationStatus === "PENDING");

      if (ndaGateEnabled && gateIncomplete) {
        setShowNdaModal(true);
      }
    } catch (error) {
      console.error("Error fetching investor profile:", error);
      setProfileError("Please try again.");
    } finally {
      setProfileLoading(false);
      setIsLoading(false);
    }
  }, [router]);

  const fetchSignatures = useCallback(async () => {
    setSignaturesLoading(true);
    setSignaturesError(null);
    try {
      const res = await fetch("/api/lp/pending-signatures");
      if (!res.ok) throw new Error("Please try again.");
      const sigData = await res.json();
      setPendingSignatures(sigData.pendingSignatures || []);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      setSignaturesError("Please try again.");
    } finally {
      setSignaturesLoading(false);
    }
  }, []);

  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/lp/docs");
      if (!res.ok) throw new Error("Please try again.");
      const docsData = await res.json();
      setSignedDocs(docsData.documents || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      setDocsError("Please try again.");
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const fetchInvestorData = useCallback(async () => {
    fetchProfile();
    fetchSignatures();
    fetchDocs();
  }, [fetchProfile, fetchSignatures, fetchDocs]);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (sessionStatus === "unauthenticated") {
      router.push("/lp/onboard");
      return;
    }

    fetchInvestorData();
    fetchFundDetails();
  }, [sessionStatus, router, fetchFundDetails, fetchInvestorData]);

  // Confetti celebration when investment becomes FUNDED
  useEffect(() => {
    if (!fundDetails?.funds?.length) return;
    const hasFunded = fundDetails.funds.some(
      (f: any) => f.investment?.status === "FUNDED"
    );
    if (hasFunded) {
      const key = "lp_funded_celebrated";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "true");
        setShowConfetti(true);
      }
    }
  }, [fundDetails]);

  // Real-time polling for dashboard updates
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !investor) return;

    const pollInterval = setInterval(() => {
      fetchFundDetails(true);
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [sessionStatus, investor, fetchFundDetails]);

  const canProceedToStep2 = ndaAccepted && !!ndaSignature;
  const canSubmit = 
    accreditationData.confirmAccredited && 
    accreditationData.confirmRiskAware &&
    (accreditationData.confirmIncome || accreditationData.confirmNetWorth);

  const handleNdaSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/lp/complete-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ndaAccepted,
          ndaSignature,
          accreditationType: accreditationData.confirmIncome && accreditationData.confirmNetWorth 
            ? "INCOME_AND_NET_WORTH" 
            : accreditationData.confirmIncome 
              ? "INCOME" 
              : "NET_WORTH",
          confirmIncome: accreditationData.confirmIncome,
          confirmNetWorth: accreditationData.confirmNetWorth,
          confirmAccredited: accreditationData.confirmAccredited,
          confirmRiskAware: accreditationData.confirmRiskAware,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to complete verification");
      }

      setShowResendConfirmation(true);
      setTimeout(() => {
        setShowResendConfirmation(false);
        setShowNdaModal(false);
        setWizardStep(1);
        fetchInvestorData();
      }, 3000);
    } catch (error) {
      console.error("Error completing gate:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendNote = async () => {
    if (!noteContent.trim()) return;

    setNoteSending(true);
    try {
      const res = await fetch("/api/lp/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent }),
      });
      if (res.ok) {
        setNoteContent("");
        setNoteSent(true);
        setTimeout(() => setNoteSent(false), 3000);
        fetchFundDetails(true);
      }
    } catch (error) {
      console.error("Error sending note:", error);
    } finally {
      setNoteSending(false);
    }
  };

  const handleSendNoteFromCard = async (content: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/lp/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        fetchFundDetails(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error sending note:", error);
      return false;
    }
  };

  const handleRefresh = () => {
    fetchInvestorData();
    fetchFundDetails();
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
  };

  // Determine LP status for main banner — 6 distinct lifecycle states
  const lpStatus = useMemo(() => {
    if (!investor) return "loading";
    if (!investor.ndaSigned) return "nda_required";
    if (investor.accreditationStatus === "PENDING") return "accreditation_needed";
    if (pendingSignatures.length > 0) return "pending_signatures";
    const invStatus = fundDetails?.funds?.[0]?.investment?.status;
    if (invStatus === "FUNDED") return "active";
    if (invStatus === "DOCS_APPROVED" || invStatus === "APPROVED") return "wire_pending";
    if (invStatus === "COMMITTED") return "committed";
    if (subscriptionStatus?.canSubscribe && !subscriptionStatus.hasSubscription) return "nda_required";
    return "committed";
  }, [investor, pendingSignatures, fundDetails, subscriptionStatus]);

  // LP visibility flags — controls which sections are rendered in the DOM
  // When a GP toggles a section off, it is REMOVED from DOM entirely (not CSS-hidden)
  const lpVisibility: LPVisibility = useMemo(() => {
    const vis = fundDetails?.lpVisibility;
    return {
      showCapitalCalls: vis?.showCapitalCalls !== false,
      showDistributions: vis?.showDistributions !== false,
      showNAV: vis?.showNAV !== false,
      showDocuments: vis?.showDocuments !== false,
      showTransactions: vis?.showTransactions !== false,
      showReports: vis?.showReports !== false,
    };
  }, [fundDetails?.lpVisibility]);

  if (sessionStatus === "loading" || isLoading) {
    return (
      <main className="max-w-[800px] mx-auto px-4 py-6 sm:py-8">
        <DashboardSkeleton />
      </main>
    );
  }

  const primaryFund = fundAggregates[0];
  const fundRaiseProgress = primaryFund && parseFloat(primaryFund.targetRaise) > 0
    ? Math.min(100, Math.round((parseFloat(primaryFund.currentRaise) / parseFloat(primaryFund.targetRaise)) * 100))
    : 0;
  const currentRaise = primaryFund ? parseFloat(primaryFund.currentRaise) : 0;
  const targetRaise = primaryFund ? parseFloat(primaryFund.targetRaise) : 0;
  const totalCommitment = investor?.totalCommitment || 0;
  const totalFunded = investor?.totalFunded || 0;

  return (
    <>
      <CelebrationConfetti show={showConfetti} />
      <div>

        {/* Subscription Banner - Sticky after NDA gate */}
        {!bannerDismissed && subscriptionStatus && (
          <SubscriptionBanner
            status={
              subscriptionStatus.processingSubscription?.status === "COMPLETED"
                ? "completed"
                : subscriptionStatus.processingSubscription?.status === "PAYMENT_PROCESSING"
                ? "processing"
                : subscriptionStatus.signedSubscription
                ? "signed"
                : subscriptionStatus.pendingSubscription
                ? "pending"
                : subscriptionStatus.canSubscribe
                ? "available"
                : "none"
            }
            fundName={
              subscriptionStatus.processingSubscription?.fundName ||
              subscriptionStatus.signedSubscription?.fundName ||
              subscriptionStatus.fund?.name ||
              subscriptionStatus.pendingSubscription?.fundName
            }
            pendingAmount={
              subscriptionStatus.processingSubscription
                ? parseFloat(subscriptionStatus.processingSubscription.amount)
                : subscriptionStatus.signedSubscription
                ? parseFloat(subscriptionStatus.signedSubscription.amount)
                : subscriptionStatus.pendingSubscription
                ? parseFloat(subscriptionStatus.pendingSubscription.amount)
                : undefined
            }
            hasBankAccount={subscriptionStatus.hasBankAccount}
            onSubscribe={() => setShowSubscriptionModal(true)}
            onSignPending={() => {
              if (subscriptionStatus.pendingSubscription?.signingToken) {
                window.location.href = `/view/sign/${subscriptionStatus.pendingSubscription.signingToken}`;
              }
            }}
            onCompletePayment={handleProcessPayment}
            onConnectBank={() => router.push("/lp/bank-connect")}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}

        <main className="max-w-[800px] mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                Welcome, {investor?.entityName || session?.user?.name || "Investor"}
              </h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">
                Your personalized investor portal
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-gray-400 hover:text-white"
              aria-label={isRefreshing ? "Refreshing dashboard data" : "Refresh dashboard data"}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {/* Main Status Banner */}
          {investor && (
            <LPNotificationPanel
              status={lpStatus as "nda_required" | "accreditation_needed" | "pending_signatures" | "committed" | "wire_pending" | "active" | "loading"}
              ndaSigned={investor.ndaSigned}
              accreditationStatus={investor.accreditationStatus}
              pendingSignatureCount={pendingSignatures.length}
            />
          )}

          {fundDetailsError && (
            <div className="mb-6">
              <DashboardSectionWrapper
                title="Fund Details"
                isLoading={false}
                error={fundDetailsError}
                onRetry={() => fetchFundDetails()}
              >
                <></>
              </DashboardSectionWrapper>
            </div>
          )}

          {investor && (!investor.ndaSigned || investor.accreditationStatus === "PENDING" || !bankStatus?.hasBankLink) && (
            <div className="mb-6">
              <WelcomeBanner
                investorName={investor.entityName || session?.user?.name || "Investor"}
                ndaSigned={investor.ndaSigned}
                accreditationStatus={investor.accreditationStatus}
                hasBankLink={bankStatus?.hasBankLink || false}
                hasInvestments={(fundDetails?.funds?.length || 0) > 0}
                onStartNda={() => setShowNdaModal(true)}
                onStartAccreditation={() => setWizardStep(1)}
                onConnectBank={() => router.push("/lp/bank-connect")}
              />
            </div>
          )}

          {!fundDetailsLoaded && !fundDetailsError && (
            <div className="mb-6 sm:mb-8">
              <DashboardSkeleton />
            </div>
          )}

          {fundDetailsLoaded && !fundDetails && !fundDetailsError && (
            <div className="mb-6 sm:mb-8">
              <EmptyState
                title="No investments yet"
                description="You haven't made any investments yet. Complete your onboarding to get started with available fund opportunities."
                icon="chart"
                showRefresh
                onRefresh={handleRefresh}
              />
            </div>
          )}

          {fundDetails && (
            <div className="mb-6 sm:mb-8">
              <DashboardSummary
                summary={fundDetails.summary}
                documentsCount={fundDetails.documents.length}
                ndaSigned={investor?.ndaSigned || false}
                accreditationStatus={investor?.accreditationStatus || "PENDING"}
                formatCurrency={formatCurrency}
                lastUpdated={fundDetails.lastUpdated}
                lpVisibility={lpVisibility}
              />
            </div>
          )}

          {/* Quick Actions CTAs */}
          {investor && (
            <LPQuickActions
              canSubscribe={subscriptionStatus?.canSubscribe || false}
              hasSubscription={subscriptionStatus?.hasSubscription || false}
              stagedEnabled={stagedCommitmentInfo?.enabled || false}
              ndaSigned={investor.ndaSigned}
              accreditationStatus={investor.accreditationStatus}
              hasBankLink={bankStatus?.hasBankLink || false}
              bankConfigured={bankStatus?.configured || false}
              pendingSignatures={pendingSignatures}
              hasLpFundInfo={!!lpFundInfo}
              onSubscribe={() => setShowSubscriptionModal(true)}
              onStagedCommit={() => setShowStagedWizard(true)}
              onNda={() => setShowNdaModal(true)}
              onBankConnect={() => router.push("/lp/bank-connect")}
              onWireTransfer={() => router.push("/lp/wire")}
              onDocuments={() => router.push("/lp/docs")}
              onUpload={() => setShowUploadModal(true)}
            />
          )}

          {/* Investment Status Progression Tracker */}
          {fundDetails && fundDetails.funds.length > 0 && (
            <LPStatusTracker
              funds={fundDetails.funds}
              ndaSigned={investor?.ndaSigned || false}
              accreditationStatus={investor?.accreditationStatus || "PENDING"}
              multipleShown={fundDetails.funds.length > 1}
            />
          )}

          {fundDetails && fundDetails.funds.length > 0 && (
            <div className="mb-6 sm:mb-8">
              <h2 className="text-lg font-semibold text-white mb-4">Your Fund Investments</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {fundDetails.funds.map((fund) => (
                  <FundCard key={fund.id} fund={fund} formatCurrency={formatCurrency} />
                ))}
              </div>
            </div>
          )}

          {investor?.ndaSigned && investor?.accreditationStatus === "VERIFIED" && offeringDocuments.length > 0 && (
            <Card className="bg-gray-800/50 border-gray-700 mb-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-blue-400" aria-hidden="true" />
                  Required Offering Documents
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Review these documents before making your investment decision
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid grid-cols-1 ${offeringDocuments.length === 2 ? 'sm:grid-cols-2' : offeringDocuments.length >= 3 ? 'sm:grid-cols-3' : ''} gap-4`}>
                  {offeringDocuments.map((doc, index) => {
                    const colorStyles = [
                      { bg: 'bg-blue-500/20', text: 'text-blue-400', hover: 'group-hover:text-blue-300' },
                      { bg: 'bg-purple-500/20', text: 'text-purple-400', hover: 'group-hover:text-purple-300' },
                      { bg: 'bg-emerald-500/20', text: 'text-emerald-400', hover: 'group-hover:text-emerald-300' },
                      { bg: 'bg-amber-500/20', text: 'text-amber-400', hover: 'group-hover:text-amber-300' },
                      { bg: 'bg-rose-500/20', text: 'text-rose-400', hover: 'group-hover:text-rose-300' },
                      { bg: 'bg-cyan-500/20', text: 'text-cyan-400', hover: 'group-hover:text-cyan-300' },
                    ];
                    const style = colorStyles[index % colorStyles.length];
                    return (
                      <a
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors group"
                        aria-label={`View ${doc.name}${doc.version ? ` v${doc.version}` : ""} (opens in new tab)`}
                      >
                        <div className={`p-2 ${style.bg} rounded-lg`}>
                          <FileText className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-white font-medium ${style.hover} transition-colors`}>
                            {doc.name} {doc.version && `v${doc.version}`}
                          </p>
                          <p className="text-gray-400 text-sm">{doc.description}</p>
                        </div>
                        <ExternalLink className={`h-4 w-4 text-gray-500 ${style.text}`} aria-hidden="true" />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <LPPendingSignatures
            signatures={pendingSignatures}
            loading={signaturesLoading}
            error={signaturesError}
            onRetry={fetchSignatures}
          />

          {/* KYC Verification - Only show after NDA is signed */}
          {investor?.ndaSigned && (
            <div className="mb-6">
              <KycVerification />
            </div>
          )}

          {bankStatus?.configured && (
            <Card className={`mb-6 ${bankStatus.hasBankLink ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-blue-900/20 border-blue-700/50'}`}>
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  {bankStatus.hasBankLink ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 mr-2 text-emerald-400" aria-hidden="true" />
                      Bank Account Connected
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5 mr-2 text-blue-400" aria-hidden="true" />
                      Connect Your Bank Account
                    </>
                  )}
                </CardTitle>
                <CardDescription className={bankStatus.hasBankLink ? "text-emerald-200/70" : "text-blue-200/70"}>
                  {bankStatus.hasBankLink
                    ? "Your bank is linked for capital calls and distributions"
                    : "Link your bank for easy capital call payments and distributions"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bankStatus.hasBankLink && bankStatus.bankLink ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <Building2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{bankStatus.bankLink.institutionName || "Bank Account"}</p>
                        <p className="text-gray-400 text-sm">
                          {bankStatus.bankLink.accountName} ••••{bankStatus.bankLink.accountMask}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => router.push("/lp/bank-connect")}
                    >
                      Manage
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => router.push("/lp/bank-connect")}
                  >
                    <Building2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Connect Bank Account
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Capital Calls — removed from DOM when showCapitalCalls is false */}
              {lpVisibility.showCapitalCalls && (
                <LPCapitalCallsSection />
              )}

              {/* Documents — removed from DOM when showDocuments is false */}
              {lpVisibility.showDocuments && (
                <DashboardSectionWrapper
                  title="Documents"
                  isLoading={docsLoading && !fundDetailsLoaded}
                  error={docsError}
                  onRetry={fetchDocs}
                  skeleton={
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center">
                          <FileText className="h-5 w-5 mr-2 text-blue-500" aria-hidden="true" />
                          Documents
                        </CardTitle>
                      </CardHeader>
                      <CardContent><DocumentsSkeleton /></CardContent>
                    </Card>
                  }
                >
                  <DocumentsVault
                    documents={fundDetails?.documents || signedDocs.map(d => ({
                      id: d.id,
                      title: d.title,
                      documentType: d.documentType,
                      fileUrl: d.fileUrl,
                      signedAt: d.signedAt,
                      createdAt: d.createdAt,
                    }))}
                    ndaSigned={investor?.ndaSigned || false}
                    accreditationStatus={investor?.accreditationStatus || "PENDING"}
                    onViewAll={() => router.push("/lp/docs")}
                  />
                </DashboardSectionWrapper>
              )}

              <ManualInvestmentsCard />
            </div>

            <div className="space-y-6">
              <NotesCard
                notes={fundDetails?.notes || []}
                onSendNote={handleSendNoteFromCard}
              />
            </div>
          </div>

          {/* Transaction History — removed from DOM when showTransactions is false */}
          {lpVisibility.showTransactions && (
            <LPTransactionTimeline
              transactions={fundDetails?.recentTransactions || []}
              loading={transactionsLoading}
              error={transactionsError}
              onRetry={() => fetchFundDetails()}
            />
          )}

          <div className="mt-6">
            <ActivityTimeline />
          </div>
        </main>

        <NdaAccreditationDialog
          open={showNdaModal}
          wizardStep={wizardStep}
          setWizardStep={setWizardStep}
          ndaAccepted={ndaAccepted}
          setNdaAccepted={setNdaAccepted}
          ndaSignature={ndaSignature}
          setNdaSignature={setNdaSignature}
          accreditationData={accreditationData}
          setAccreditationData={setAccreditationData}
          canProceedToStep2={canProceedToStep2}
          canSubmit={canSubmit}
          isSubmitting={isSubmitting}
          showResendConfirmation={showResendConfirmation}
          onSubmit={handleNdaSubmit}
        />
      </div>

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        entityName={subscriptionStatus?.entityName || investor?.entityName || null}
        fund={subscriptionStatus?.fund}
        onSubscribe={handleSubscribe}
      />

      {/* Staged Commitment Wizard */}
      {stagedCommitmentInfo && (
        <StagedCommitmentWizard
          isOpen={showStagedWizard}
          onClose={() => setShowStagedWizard(false)}
          onSubmit={handleStagedCommitment}
          fundName={stagedCommitmentInfo.fundName}
          fundId={stagedCommitmentInfo.fundId}
          minimumInvestment={stagedCommitmentInfo.minimumInvestment}
          entityName={investor?.entityName || null}
          existingCommitment={stagedCommitmentInfo.totalCommitted}
        />
      )}

      {/* Upload Document Modal */}
      {lpFundInfo && (
        <UploadDocumentModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          fundId={lpFundInfo.id}
          fundName={lpFundInfo.name}
          onSuccess={() => {
            setShowUploadModal(false);
            handleRefresh();
          }}
        />
      )}
    </>
  );
}
