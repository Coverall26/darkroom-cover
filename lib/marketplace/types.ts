import type {
  DealStage,
  DealType,
  DealVisibility,
  InterestStatus,
} from "@prisma/client";

// ============================================================================
// Pipeline Configuration
// ============================================================================

/** Ordered pipeline stages with metadata */
export const DEAL_STAGE_CONFIG: Record<
  DealStage,
  {
    label: string;
    description: string;
    order: number;
    color: string;
    terminal: boolean;
  }
> = {
  SOURCED: {
    label: "Sourced",
    description: "Raw opportunity identified",
    order: 0,
    color: "#6B7280",
    terminal: false,
  },
  SCREENING: {
    label: "Screening",
    description: "Preliminary screening in progress",
    order: 1,
    color: "#8B5CF6",
    terminal: false,
  },
  DUE_DILIGENCE: {
    label: "Due Diligence",
    description: "Active due diligence",
    order: 2,
    color: "#3B82F6",
    terminal: false,
  },
  TERM_SHEET: {
    label: "Term Sheet",
    description: "Negotiating terms",
    order: 3,
    color: "#F59E0B",
    terminal: false,
  },
  COMMITMENT: {
    label: "Commitment",
    description: "LPs committing capital",
    order: 4,
    color: "#10B981",
    terminal: false,
  },
  CLOSING: {
    label: "Closing",
    description: "Finalizing legal documents",
    order: 5,
    color: "#14B8A6",
    terminal: false,
  },
  FUNDED: {
    label: "Funded",
    description: "Capital deployed",
    order: 6,
    color: "#22C55E",
    terminal: false,
  },
  MONITORING: {
    label: "Monitoring",
    description: "Active portfolio monitoring",
    order: 7,
    color: "#0EA5E9",
    terminal: false,
  },
  EXIT: {
    label: "Exit",
    description: "Exit event completed",
    order: 8,
    color: "#EAB308",
    terminal: true,
  },
  PASSED: {
    label: "Passed",
    description: "GP declined opportunity",
    order: 9,
    color: "#EF4444",
    terminal: true,
  },
  WITHDRAWN: {
    label: "Withdrawn",
    description: "Deal withdrawn by sponsor",
    order: 10,
    color: "#9CA3AF",
    terminal: true,
  },
};

/** Valid stage transitions: key = current stage, value = allowed next stages */
export const STAGE_TRANSITIONS: Record<DealStage, DealStage[]> = {
  SOURCED: ["SCREENING", "PASSED", "WITHDRAWN"],
  SCREENING: ["DUE_DILIGENCE", "PASSED", "WITHDRAWN"],
  DUE_DILIGENCE: ["TERM_SHEET", "PASSED", "WITHDRAWN"],
  TERM_SHEET: ["COMMITMENT", "DUE_DILIGENCE", "PASSED", "WITHDRAWN"],
  COMMITMENT: ["CLOSING", "TERM_SHEET", "PASSED", "WITHDRAWN"],
  CLOSING: ["FUNDED", "COMMITMENT", "WITHDRAWN"],
  FUNDED: ["MONITORING", "EXIT"],
  MONITORING: ["EXIT"],
  EXIT: [],
  PASSED: ["SOURCED"], // Can reopen a passed deal
  WITHDRAWN: [],
};

// ============================================================================
// Deal Type Config
// ============================================================================

export const DEAL_TYPE_CONFIG: Record<
  DealType,
  { label: string; description: string }
> = {
  EQUITY: { label: "Equity", description: "Direct equity investment" },
  DEBT: { label: "Debt", description: "Debt or note investment" },
  CONVERTIBLE: {
    label: "Convertible",
    description: "Convertible note or SAFE",
  },
  FUND_OF_FUNDS: {
    label: "Fund of Funds",
    description: "Investment into another fund",
  },
  SECONDARY: {
    label: "Secondary",
    description: "Secondary market transaction",
  },
  CO_INVESTMENT: {
    label: "Co-Investment",
    description: "Co-invest alongside lead GP",
  },
  SPV: {
    label: "SPV",
    description: "Special purpose vehicle",
  },
};

// ============================================================================
// Visibility Config
// ============================================================================

export const DEAL_VISIBILITY_CONFIG: Record<
  DealVisibility,
  { label: string; description: string; icon: string }
> = {
  PRIVATE: {
    label: "Private",
    description: "Only visible to team members",
    icon: "Lock",
  },
  INVITE_ONLY: {
    label: "Invite Only",
    description: "Visible to explicitly invited LPs",
    icon: "UserCheck",
  },
  QUALIFIED: {
    label: "Qualified Investors",
    description: "Visible to accredited/qualified investors",
    icon: "ShieldCheck",
  },
  PUBLIC: {
    label: "Public Listing",
    description: "Listed on marketplace (auth required)",
    icon: "Globe",
  },
};

// ============================================================================
// Interest Status Config
// ============================================================================

export const INTEREST_STATUS_CONFIG: Record<
  InterestStatus,
  { label: string; color: string }
> = {
  EXPRESSED: { label: "Interested", color: "#8B5CF6" },
  REVIEWING: { label: "Reviewing", color: "#3B82F6" },
  COMMITTED: { label: "Committed", color: "#10B981" },
  ALLOCATED: { label: "Allocated", color: "#14B8A6" },
  CONFIRMED: { label: "Confirmed", color: "#22C55E" },
  DECLINED: { label: "Declined", color: "#EF4444" },
  WAITLISTED: { label: "Waitlisted", color: "#F59E0B" },
};

// ============================================================================
// API Types
// ============================================================================

export interface CreateDealInput {
  title: string;
  description?: string;
  thesis?: string;
  dealType?: DealType;
  visibility?: DealVisibility;
  targetName?: string;
  targetSector?: string;
  targetSubSector?: string;
  targetGeography?: string;
  targetWebsite?: string;
  targetRaise?: number;
  minimumTicket?: number;
  maximumTicket?: number;
  preMoneyValuation?: number;
  expectedReturn?: string;
  holdPeriod?: string;
  managementFee?: number;
  carriedInterest?: number;
  preferredReturn?: number;
  closingDate?: string;
  deadlineAt?: string;
  fundId?: string;
  leadSponsor?: string;
  isLeadDeal?: boolean;
  tags?: string[];
  confidential?: boolean;
}

export interface UpdateDealInput extends Partial<CreateDealInput> {
  stage?: DealStage;
  riskScore?: number;
  customFields?: Record<string, unknown>;
}

export interface TransitionStageInput {
  toStage: DealStage;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ExpressInterestInput {
  dealId: string;
  indicativeAmount?: number;
  notes?: string;
  conditionsOrTerms?: string;
}

export interface AllocateInput {
  dealId: string;
  investorId: string;
  allocatedAmount: number;
  allocationNotes?: string;
}

export interface CreateListingInput {
  dealId: string;
  headline: string;
  summary: string;
  highlights?: string[];
  category?: string;
  coverImageUrl?: string;
  searchTags?: string[];
}

export interface DealFilters {
  stage?: DealStage | DealStage[];
  dealType?: DealType | DealType[];
  visibility?: DealVisibility;
  sector?: string;
  geography?: string;
  minRaise?: number;
  maxRaise?: number;
  search?: string;
  tags?: string[];
  fundId?: string;
  includeDeleted?: boolean;
}

export interface MarketplaceFilters {
  category?: string;
  sector?: string;
  geography?: string;
  dealType?: DealType | DealType[];
  minTicket?: number;
  maxTicket?: number;
  search?: string;
  tags?: string[];
  featured?: boolean;
}

export interface PipelineStats {
  totalDeals: number;
  byStage: Record<DealStage, number>;
  totalTargetRaise: number;
  totalCommitted: number;
  totalAllocated: number;
  avgTimeInStage: Record<DealStage, number>; // days
  conversionRate: number; // sourced → funded %
  passRate: number; // sourced → passed %
}

export interface DealKPIs {
  dealId: string;
  commitmentProgress: number; // % of target raise
  investorCount: number;
  interestCount: number;
  allocationCount: number;
  avgTicketSize: number;
  daysInCurrentStage: number;
  daysTotal: number;
}
