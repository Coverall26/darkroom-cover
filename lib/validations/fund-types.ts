import { z } from "zod";

/**
 * GP Fund sub-types — determines default economics, docs, and terminology.
 */
export const FUND_SUB_TYPES = [
  "VENTURE_CAPITAL",
  "PRIVATE_EQUITY",
  "REAL_ESTATE",
  "HEDGE_FUND",
  "SPV_COINVEST",
  "SEARCH_FUND",
  "FUND_OF_FUNDS",
  "CUSTOM",
] as const;

export type FundSubType = (typeof FUND_SUB_TYPES)[number];

export interface FundTypeDefaults {
  managementFeePct: number;
  carryPct: number;
  termYears: number | null;
  extensionYears: number | null;
  hurdleRate: number | null;
  waterfallType: "EUROPEAN" | "AMERICAN" | "DEAL_BY_DEAL" | null;
  highWaterMark: boolean;
  docs: string[];
}

export const FUND_TYPE_DEFAULTS: Record<FundSubType, FundTypeDefaults> = {
  VENTURE_CAPITAL: {
    managementFeePct: 2,
    carryPct: 20,
    termYears: 10,
    extensionYears: 2,
    hurdleRate: 8,
    waterfallType: "EUROPEAN",
    highWaterMark: false,
    docs: ["LPA", "Subscription Agreement", "Side Letters"],
  },
  PRIVATE_EQUITY: {
    managementFeePct: 2,
    carryPct: 20,
    termYears: 7,
    extensionYears: 2,
    hurdleRate: 8,
    waterfallType: "EUROPEAN",
    highWaterMark: false,
    docs: ["LPA", "Subscription Agreement", "Side Letters"],
  },
  REAL_ESTATE: {
    managementFeePct: 1.5,
    carryPct: 20,
    termYears: 7,
    extensionYears: 3,
    hurdleRate: 8,
    waterfallType: "AMERICAN",
    highWaterMark: false,
    docs: ["LPA", "Subscription Agreement", "Operating Agreement", "PPM"],
  },
  HEDGE_FUND: {
    managementFeePct: 2,
    carryPct: 20,
    termYears: null,
    extensionYears: null,
    hurdleRate: null,
    waterfallType: null,
    highWaterMark: true,
    docs: ["LPA", "Subscription Agreement", "PPM", "DDQ"],
  },
  SPV_COINVEST: {
    managementFeePct: 0,
    carryPct: 20,
    termYears: null,
    extensionYears: null,
    hurdleRate: null,
    waterfallType: null,
    highWaterMark: false,
    docs: ["LLC Agreement", "Subscription Agreement"],
  },
  SEARCH_FUND: {
    managementFeePct: 2,
    carryPct: 20,
    termYears: 7,
    extensionYears: null,
    hurdleRate: null,
    waterfallType: null,
    highWaterMark: false,
    docs: ["LPA", "Search Agreement", "Subscription Agreement"],
  },
  FUND_OF_FUNDS: {
    managementFeePct: 1,
    carryPct: 10,
    termYears: 10,
    extensionYears: null,
    hurdleRate: 6,
    waterfallType: "EUROPEAN",
    highWaterMark: false,
    docs: ["LPA", "Subscription Agreement"],
  },
  CUSTOM: {
    managementFeePct: 0,
    carryPct: 0,
    termYears: null,
    extensionYears: null,
    hurdleRate: null,
    waterfallType: null,
    highWaterMark: false,
    docs: [],
  },
};

/** Zod schema for fund terms form validation */
export const fundTermsSchema = z.object({
  fundSubType: z.enum(FUND_SUB_TYPES).optional(),
  fundName: z.string().min(1, "Fund name is required").max(200),
  targetRaise: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B")
    .optional()
    .nullable(),
  currency: z.string().default("USD"),
  minimumCommitment: z
    .number()
    .min(0, "Cannot be negative")
    .max(100_000_000_000, "Maximum $100B")
    .optional()
    .nullable(),
  managementFeePct: z
    .number()
    .min(0, "Cannot be negative")
    .max(10, "Maximum 10%")
    .optional()
    .nullable(),
  carryPct: z
    .number()
    .min(0, "Cannot be negative")
    .max(50, "Maximum 50%")
    .optional()
    .nullable(),
  termYears: z
    .number()
    .int()
    .min(1, "Minimum 1 year")
    .max(40, "Maximum 40 years")
    .optional()
    .nullable(),
  extensionYears: z
    .number()
    .int()
    .min(0)
    .max(10, "Maximum 10 years")
    .optional()
    .nullable(),
  waterfallType: z
    .enum(["EUROPEAN", "AMERICAN", "DEAL_BY_DEAL"])
    .optional()
    .nullable(),
  hurdleRate: z
    .number()
    .min(0, "Cannot be negative")
    .max(30, "Maximum 30%")
    .optional()
    .nullable(),
  highWaterMark: z.boolean().default(false),
  gpCommitmentAmount: z
    .number()
    .min(0)
    .max(100_000_000_000)
    .optional()
    .nullable(),
  gpCommitmentPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  // Advanced
  recyclingEnabled: z.boolean().default(false),
  keyPersonEnabled: z.boolean().default(false),
  keyPersonName: z.string().max(200).optional().nullable(),
  noFaultDivorceThreshold: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  investmentPeriodYears: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .nullable(),
  preferredReturnMethod: z
    .enum(["COMPOUNDED", "SIMPLE"])
    .default("COMPOUNDED"),
  clawbackProvision: z.boolean().default(true),
  mgmtFeeOffsetPct: z
    .number()
    .min(0, "Cannot be negative")
    .max(100, "Maximum 100%")
    .optional()
    .nullable(),
  // SEC Exemption
  regulationDExemption: z
    .enum(["506B", "506C", "REG_A_PLUS", "RULE_504"])
    .optional()
    .nullable(),
  // Marketplace
  marketplaceOptIn: z.boolean().default(false),
  marketplaceDescription: z.string().max(280).optional().nullable(),
  marketplaceCategory: z.string().optional().nullable(),
  // Wiring instructions
  bankName: z.string().max(200).optional().nullable(),
  bankAccountName: z.string().max(200).optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankRoutingNumber: z.string().optional().nullable(),
  bankSwiftBic: z.string().max(20).optional().nullable(),
  wireMemoFormat: z.string().max(500).optional().nullable(),
});

export type FundTermsFormData = z.infer<typeof fundTermsSchema>;
