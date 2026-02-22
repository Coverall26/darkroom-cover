import { z } from "zod";

/**
 * Startup raise instrument types — SAFE, Convertible Note, Priced Equity Round, SPV.
 * Used by the Startup Raise Wizard (Org Setup Wizard Step 5 when mode === "STARTUP").
 */
export const STARTUP_INSTRUMENT_TYPES = [
  "SAFE",
  "CONVERTIBLE_NOTE",
  "PRICED_EQUITY",
  "SPV",
] as const;

export type StartupInstrumentType = (typeof STARTUP_INSTRUMENT_TYPES)[number];

// ── SAFE Schema ──────────────────────────────────────────────────────────────

export const safeTermsSchema = z.object({
  instrumentType: z.literal("SAFE"),
  roundName: z.string().min(1, "Round name is required").max(200),
  targetRaise: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  minimumInvestment: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  valuationCap: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B")
    .optional()
    .nullable(),
  discountRate: z
    .number()
    .min(0, "Cannot be negative")
    .max(100, "Maximum 100%")
    .optional()
    .nullable(),
  postMoney: z.boolean().default(true),
  mfn: z.boolean().default(false),
  proRataRights: z.boolean().default(true),
  sideLetterAllowance: z.boolean().default(true),
});

export type SafeTermsData = z.infer<typeof safeTermsSchema>;

// ── Convertible Note Schema ──────────────────────────────────────────────────

export const convertibleNoteTermsSchema = safeTermsSchema
  .omit({ instrumentType: true })
  .extend({
    instrumentType: z.literal("CONVERTIBLE_NOTE"),
    interestRate: z
      .number()
      .min(0, "Cannot be negative")
      .max(25, "Maximum 25%")
      .optional()
      .nullable(),
    maturityDate: z.string().optional().nullable(),
    qualifiedFinancingThreshold: z
      .number()
      .positive("Must be positive")
      .max(100_000_000_000, "Maximum $100B")
      .optional()
      .nullable(),
    autoConvertAtMaturity: z.boolean().default(true),
    maturityExtensionOption: z.boolean().default(false),
  });

export type ConvertibleNoteTermsData = z.infer<
  typeof convertibleNoteTermsSchema
>;

// ── Priced Equity Round Schema ───────────────────────────────────────────────

export const PRICED_ROUND_NAMES = [
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Bridge",
  "Custom",
] as const;

export const LIQUIDATION_PREFERENCES = [
  "1x_non_participating",
  "1x_participating",
  "2x_non_participating",
  "custom",
] as const;

export const ANTI_DILUTION_TYPES = [
  "broad_weighted_average",
  "narrow_based",
  "full_ratchet",
  "none",
] as const;

export const pricedEquityTermsSchema = z.object({
  instrumentType: z.literal("PRICED_EQUITY"),
  roundName: z.enum(PRICED_ROUND_NAMES),
  customRoundName: z.string().max(200).optional().nullable(),
  preMoneyValuation: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  targetRaise: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  pricePerShare: z
    .number()
    .positive("Must be positive")
    .optional()
    .nullable(),
  sharesAuthorized: z
    .number()
    .int("Must be a whole number")
    .positive("Must be positive")
    .optional()
    .nullable(),
  optionPoolPct: z
    .number()
    .min(0, "Cannot be negative")
    .max(30, "Maximum 30%")
    .default(10),
  liquidationPreference: z.enum(LIQUIDATION_PREFERENCES).default("1x_non_participating"),
  antiDilution: z.enum(ANTI_DILUTION_TYPES).default("broad_weighted_average"),
  boardSeats: z.number().int().min(0).max(10).optional().nullable(),
  protectiveProvisions: z.boolean().default(true),
  informationRights: z.boolean().default(true),
  rofrCoSale: z.boolean().default(true),
  dragAlong: z.boolean().default(true),
});

export type PricedEquityTermsData = z.infer<typeof pricedEquityTermsSchema>;

// ── SPV Schema ───────────────────────────────────────────────────────────────

export const SPV_TERMS = [
  "DEAL_COMPLETION",
  "1_YEAR",
  "3_YEARS",
  "5_YEARS",
  "10_YEARS",
] as const;

export const spvTermsSchema = z.object({
  instrumentType: z.literal("SPV"),
  spvName: z.string().min(1, "SPV name is required").max(200),
  targetCompanyName: z.string().min(1, "Target company/deal name is required").max(200),
  dealDescription: z.string().max(500).optional().nullable(),
  allocationAmount: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  minimumLpInvestment: z
    .number()
    .positive("Must be positive")
    .max(100_000_000_000, "Maximum $100B"),
  carryPct: z
    .number()
    .min(0, "Cannot be negative")
    .max(50, "Maximum 50%")
    .default(20),
  managementFeePct: z
    .number()
    .min(0, "Cannot be negative")
    .max(10, "Maximum 10%")
    .default(0),
  maxInvestors: z.number().int().min(1).max(249).default(99),
  spvTerm: z.enum(SPV_TERMS).default("DEAL_COMPLETION"),
  gpCommitmentAmount: z
    .number()
    .min(0)
    .max(100_000_000_000)
    .optional()
    .nullable(),
});

export type SpvTermsData = z.infer<typeof spvTermsSchema>;

// ── Union schema for API validation ──────────────────────────────────────────

export const startupRaiseSchema = z.discriminatedUnion("instrumentType", [
  safeTermsSchema,
  convertibleNoteTermsSchema,
  pricedEquityTermsSchema,
  spvTermsSchema,
]);

export type StartupRaiseData = z.infer<typeof startupRaiseSchema>;

// ── Document requirements by instrument type ─────────────────────────────────

export const INSTRUMENT_DOCUMENTS: Record<
  StartupInstrumentType,
  { name: string; required: boolean }[]
> = {
  SAFE: [
    { name: "SAFE Agreement", required: true },
    { name: "Board Consent", required: true },
  ],
  CONVERTIBLE_NOTE: [
    { name: "Convertible Note Agreement", required: true },
    { name: "Board Consent", required: true },
  ],
  PRICED_EQUITY: [
    { name: "Stock Purchase Agreement (SPA)", required: true },
    { name: "Investors' Rights Agreement", required: true },
    { name: "Voting Agreement", required: true },
    { name: "ROFR Agreement", required: true },
    { name: "Certificate of Incorporation Amendment", required: true },
  ],
  SPV: [
    { name: "LLC Operating Agreement", required: true },
    { name: "Subscription Agreement", required: true },
  ],
};

// ── Form data interfaces (string-based for form state) ───────────────────────

export interface StartupRaiseFormData {
  instrumentType: StartupInstrumentType | "";
  // Common fields
  roundName: string;
  targetRaise: string;
  minimumInvestment: string;
  // SAFE fields
  valuationCap: string;
  discountRate: string;
  postMoney: boolean;
  mfn: boolean;
  proRataRights: boolean;
  sideLetterAllowance: boolean;
  // Convertible Note additional fields
  interestRate: string;
  maturityDate: string;
  qualifiedFinancingThreshold: string;
  autoConvertAtMaturity: boolean;
  maturityExtensionOption: boolean;
  // Priced Equity fields
  customRoundName: string;
  preMoneyValuation: string;
  pricePerShare: string;
  sharesAuthorized: string;
  optionPoolPct: string;
  liquidationPreference: string;
  antiDilution: string;
  boardSeats: string;
  protectiveProvisions: boolean;
  informationRights: boolean;
  rofrCoSale: boolean;
  dragAlong: boolean;
  // SPV fields
  spvName: string;
  targetCompanyName: string;
  dealDescription: string;
  allocationAmount: string;
  minimumLpInvestment: string;
  carryPct: string;
  managementFeePct: string;
  maxInvestors: string;
  spvTerm: string;
  gpCommitmentAmount: string;
  // Documents
  documents: Record<string, "template" | "custom" | null>;
}

export const INITIAL_STARTUP_RAISE_DATA: StartupRaiseFormData = {
  instrumentType: "",
  roundName: "",
  targetRaise: "",
  minimumInvestment: "",
  valuationCap: "",
  discountRate: "20",
  postMoney: true,
  mfn: false,
  proRataRights: true,
  sideLetterAllowance: true,
  interestRate: "5",
  maturityDate: "",
  qualifiedFinancingThreshold: "1000000",
  autoConvertAtMaturity: true,
  maturityExtensionOption: false,
  customRoundName: "",
  preMoneyValuation: "",
  pricePerShare: "",
  sharesAuthorized: "",
  optionPoolPct: "10",
  liquidationPreference: "1x_non_participating",
  antiDilution: "broad_weighted_average",
  boardSeats: "",
  protectiveProvisions: true,
  informationRights: true,
  rofrCoSale: true,
  dragAlong: true,
  spvName: "",
  targetCompanyName: "",
  dealDescription: "",
  allocationAmount: "",
  minimumLpInvestment: "",
  carryPct: "20",
  managementFeePct: "0",
  maxInvestors: "99",
  spvTerm: "DEAL_COMPLETION",
  gpCommitmentAmount: "",
  documents: {},
};
