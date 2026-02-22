# FundRoom AI — Complete Fundraising Structures & Capital Flow Research
## UX Blueprint for Platform Design | February 2026 — v2.0
### Updated to align with GP Wizard Plan v1.0 + SEC Compliance Requirements v1.0

---

## PART 1: STARTUP MODE — How Startups Raise Money

### 1.1 Fundraising Stages (Chronological)

| Stage | Typical Size | Instrument | Valuation Known? | Investors |
|-------|-------------|------------|------------------|-----------|
| **Friends & Family** | $10K–$250K | SAFE, Conv. Note, or simple equity | Usually no | Personal network |
| **Pre-Seed** | $100K–$2M | SAFE (90% of deals in Q1 2025) | Cap only | Angels, micro-VCs |
| **Seed** | $500K–$5M | SAFE (64%) or Priced Round (27%) | Cap or set valuation | Angels, seed VCs, syndicates |
| **Series A** | $5M–$25M | Priced Equity Round (preferred stock) | Yes — negotiated | Institutional VCs |
| **Series B+** | $15M–$100M+ | Priced Equity Round | Yes | Growth VCs, PE crossover |
| **Bridge Round** | Variable | Convertible Note (most common) | Deferred | Existing investors |

---

### 1.2 Instrument Deep-Dive

#### A. SAFE (Simple Agreement for Future Equity)
**Dominance**: 90% of pre-seed deals, 64% of seed deals (Carta Q1 2025)

**Key Terms FundRoom Must Capture:**
- **Investment Amount** — the cash being invested
- **Valuation Cap** — maximum valuation at which SAFE converts (61% use cap-only)
- **Discount Rate** — % discount to next round price (typically 15–25%)
- **Post-Money vs Pre-Money** — Post-money SAFEs (now standard ~85% of market) lock in investor ownership %; pre-money SAFEs dilute proportionally
- **MFN (Most Favored Nation)** — if future SAFEs get better terms, this SAFE gets them too
- **Pro-Rata Rights** — right to invest in future rounds to maintain ownership %

**Conversion Triggers:**
- Next priced equity round (most common)
- IPO / Direct listing
- Change of control / acquisition
- Dissolution (investor gets money back, if available)

**What DOESN'T happen with SAFEs:**
- No interest accrual
- No maturity date
- No repayment obligation
- No board seat (typically)
- No shares issued until conversion

**UX Implication**: SAFE investors are "pending" — they hold a promise of future equity. The platform needs to track SAFEs as outstanding instruments that convert later. Cap table shows them as a dilution overhang until conversion event.

---

#### B. Convertible Note
**Usage**: ~10% of seed deals, popular for bridge rounds, biotech/hardware

**Key Terms FundRoom Must Capture:**
- **Principal Amount** — the invested amount
- **Interest Rate** — typically 2–8% (36% exceed 8% at pre-seed)
- **Maturity Date** — deadline for conversion or repayment (12–24 months typical)
- **Valuation Cap** — maximum conversion valuation
- **Discount Rate** — % discount to next round price
- **Qualified Financing Threshold** — minimum raise amount to trigger auto-conversion (e.g., $1M)

**Key Differences from SAFE:**
- IS a debt instrument (appears as liability on balance sheet)
- Accrues interest (which converts to equity too)
- Has maturity date (creates urgency)
- Repayment obligation if no qualifying event
- Can have multiple extensions
- Higher in capital structure than SAFE if company fails

**Conversion Math:**
```
Conversion Price = LOWER of:
  (a) Valuation Cap / fully-diluted shares
  (b) Next round price × (1 - Discount%)

Shares Received = (Principal + Accrued Interest) / Conversion Price
```

**UX Implication**: Platform must track accruing interest, maturity dates, and alert founders/investors as maturity approaches. Need "extend maturity" workflow.

---

#### C. Priced Equity Round (Series A+ Standard)
**Usage**: Standard from Series A onward, ~27% of seed deals

**Key Terms FundRoom Must Capture:**

**Economics:**
- **Pre-Money Valuation** — company value before investment
- **Investment Amount** — total capital raised in round
- **Post-Money Valuation** — pre-money + investment
- **Price Per Share** — post-money / fully-diluted shares
- **Shares Issued** — investment amount / price per share
- **Option Pool** — typically 10-15% of post-money, usually created/expanded pre-investment

**Investor Rights (Preferred Stock):**
- **Liquidation Preference** — 1× non-participating is standard (98% of Q2 2025 deals)
  - 1× = investors get their money back first before common stock
  - Non-participating = choose EITHER liquidation pref OR convert to common and share pro-rata (can't double-dip)
  - Participating = get preference AND share in remaining (rare now, ~5%)
- **Anti-Dilution Protection** — protects against down rounds
  - Broad-based weighted average (founder-friendly, standard)
  - Full ratchet (investor-aggressive, rare)
- **Pro-Rata Rights** — right to invest in future rounds
- **Board Seats** — lead investor typically gets 1 seat
- **Protective Provisions** — veto rights over major decisions (new equity, company sale, charter amendments)
- **Drag-Along Rights** — force minority to join approved sale
- **Tag-Along Rights** — minority can join in founder secondary sales
- **Information Rights** — quarterly financials, annual audited
- **ROFR (Right of First Refusal)** — company/investors can match any share transfer offer
- **Registration Rights** — relevant for IPO

**UX Implication**: Priced rounds are document-heavy. Need term sheet builder, stock purchase agreement (SPA), investor rights agreement (IRA), voting agreement, ROFR/co-sale agreement, certificate of incorporation amendment. The cap table becomes precise — exact share counts, classes of stock, conversion ratios.

---

#### D. SPV (Special Purpose Vehicle)
**Usage**: Angel syndicates, group investments, single-deal vehicles

**Key Characteristics:**
- LLC or LP created for one investment
- Pools multiple investors into single cap table entry
- GP/lead organizer manages the SPV
- Typically 15-20% carry for lead
- Setup cost: $5K-$10K via platforms (AngelList, Allocations, Sydecar)
- Limited to 99 accredited investors (3(c)(1)) or unlimited qualified purchasers (3(c)(7))
- Min investment typically $1K-$25K per LP

**Capital Flow:**
1. Lead sources deal, negotiates terms with startup
2. LPs commit capital to SPV
3. SPV wires aggregate investment to startup
4. Startup has single entity on cap table
5. On exit: proceeds flow to SPV → distributed per waterfall to LPs (after carry to lead)

**UX Implication**: FundRoom needs SPV support — a GP creates the SPV entity, invites LPs, collects commitments, and the SPV itself is what appears on the startup's cap table. Separate waterfall for SPV distributions.

---

#### E. Rolling Fund
**Usage**: Newer model popularized by AngelList

**Key Characteristics:**
- Quarterly subscription-based fund
- Each quarter is technically a separate fund/SPV
- LPs subscribe on rolling basis
- Carry calculated per-period (not whole fund)
- Allows continuous fundraising while deploying

**UX Implication**: Phase 2+ feature. Need quarterly vintage tracking, per-period waterfall, rolling LP commitments.

---

### 1.3 Startup Capital Flow Summary

```
RAISE EVENT
    ↓
Investor Signs Docs (SAFE/Note/SPA)
    ↓
Wire Transfer / ACH
    ↓
Funds Received by Company
    ↓
[SAFE/Note: Promise recorded, no shares yet]
[Priced Round: Shares issued, cap table updated]
    ↓
Company Uses Capital (operations, growth)
    ↓
[Future: Conversion event OR exit]
    ↓
EXIT (Acquisition / IPO)
    ↓
Proceeds Distributed per Liquidation Waterfall:
  1. Debt holders (if any)
  2. Preferred stock liquidation preferences
  3. Remaining to common stock (founders, employees, converted preferred)
```

---

## PART 2: GP/LP FUND MODE — How Financial Funds Work

### 2.1 Fund Types FundRoom Should Support

| Fund Type | Strategy | Typical Terms | Key Docs |
|-----------|----------|---------------|----------|
| **Venture Capital** | Invest in startups | 2/20, 10yr, no hurdle typical | LPA, Sub Agreement, PPM |
| **Private Equity (Buyout)** | Acquire companies | 2/20, 8% hurdle, 10yr | LPA, Sub Agreement, PPM |
| **Real Estate PE** | Buy/develop property | 1.5-2/20, 8% hurdle, 7-10yr | LPA, Sub Agreement, PPM |
| **Hedge Fund** | Public/private markets | 2/20, high-water mark, quarterly liquidity | LPA/OA, Sub Agreement, PPM |
| **Fund of Funds** | Invest in other funds | 0.5-1/10, longer horizon | LPA, Sub Agreement |
| **SPV / Co-Invest** | Single deal | 0-1/10-15, deal-term | SPV Operating Agreement |
| **Search Fund** | Acquire/operate 1 biz | 2/20-25, 5-7yr | LPA, Sub Agreement |

### 2.2 Fund Lifecycle & Capital Flows

#### Phase 1: Fundraising (6-18 months)
```
GP markets the fund
    ↓
LP reviews PPM (Private Placement Memo)
    ↓
LP signs Subscription Agreement + LPA
    ↓
LP commits capital (NOT wired yet)
    ↓
First Close (GP has enough to start investing)
    ↓
Additional Closes (more LPs join, up to Hard Cap)
    ↓
Final Close (no more LPs)
```

**Key Terms to Capture (GP Wizard Step 5 — Fund Details):**
- **Fund Name** — used in all docs, LP portal, Form D
- **Target Raise / Hard Cap** — maximum fund size
- **Minimum Commitment** — per LP (typically $100K-$1M+). Critical for 506(c) verification threshold ($200K+ individuals, $1M+ entities per March 2025 no-action letter)
- **GP Commitment** — GP's own capital (1-5% typical)
- **Management Fee** — 1.5-2% of committed capital (default 2.0%)
- **Carried Interest** — 15-20% of profits (default 20.0%)
- **Hurdle Rate / Preferred Return** — 6-8% IRR before carry kicks in (default 8.0%)
- **Fund Term** — 10 years + 1-2 year extensions (default 10+2)
- **Investment Period** — first 3-5 years (when capital is deployed)
- **Waterfall Type** — European (whole fund, default) vs American (deal-by-deal)
- **Fund Strategy** — PE, VC, Real Estate, Hedge, Fund of Funds, Other (for Form D Item 4 + marketplace)

---

#### Phase 2: Investment Period (Years 1-5) — Capital Calls

```
GP identifies investment opportunity
    ↓
GP issues Capital Call Notice (10-15 biz days notice)
    ↓
Notice includes: amount per LP, purpose, deadline, remaining commitment
    ↓
LP wires capital (pro-rata from unfunded commitment)
    ↓
Fund invests in portfolio company/asset
```

**Capital Call Mechanics:**
- Calls are pro-rata based on each LP's commitment
- Annual drawdown often capped (e.g., 25-33% per year)
- Unfunded commitment = Total commitment - Sum of capital calls to date
- Default penalties if LP doesn't fund: interest charges, dilution, or forced sale
- Some funds allow "recycling" — reinvesting early proceeds during investment period

**Management Fee During Investment Period:**
- Calculated on committed capital (not just called capital)
- Typically deducted from capital calls or charged quarterly

**UX Requirements:**
- Capital call creation wizard (select LPs, amounts, purpose, deadline)
- LP notification with wire instructions
- Track funded/unfunded per LP
- Default management workflow
- Fee calculation engine

---

#### Phase 3: Harvest Period (Years 5-10) — Distributions

```
Portfolio company exits (sale, IPO, dividend)
    ↓
Fund receives proceeds
    ↓
Distribution Waterfall Applied
    ↓
Cash distributed to LPs (and GP carry)
```

**Distribution Waterfall — European (Whole-of-Fund) — Most Common (FundRoom default):**

```
TIER 1: Return of Capital (100% to LPs)
  → All distributions go to LPs until they receive back ALL contributed capital
  → Includes fees and expenses that were drawn down
  
TIER 2: Preferred Return / Hurdle (100% to LPs)
  → LPs continue receiving 100% until cumulative distributions
    achieve the hurdle rate IRR (typically 8%)
  → Calculated on every cashflow (contributions and distributions)
  
TIER 3: GP Catch-Up (50-100% to GP)
  → GP receives disproportionate share until GP's total distributions
    equal the carried interest % of ALL profits distributed so far
  → Common: 80% to GP / 20% to LP until GP "catches up"
  → Or 100% to GP (full catch-up)
  
TIER 4: Carried Interest Split (80/20 typical)
  → Remaining profits split: 80% to LPs, 20% to GP
  → Some funds have tiered carry (e.g., 25% if >3× multiple)
```

**Distribution Waterfall — American (Deal-by-Deal):**
```
Same tiers but applied PER INVESTMENT exit, not fund-wide
  → GP can receive carry on early winners even if fund overall is underwater
  → Requires clawback provisions (GP returns excess carry at fund end)
  → More common in VC (GP needs earlier liquidity)
  → Escrow: 20-30% of carry held back pending final fund performance
```

**Management Fee During Harvest:**
- Often drops to % of invested capital (not committed)
- Or steps down (e.g., 2% → 1.5% → 1%)

---

### 2.3 Key Fund Financial Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| **IRR** | Internal Rate of Return | Time-weighted return accounting for cash flow timing |
| **TVPI** | Total Value / Paid-In Capital | How much total value (realized + unrealized) per $1 invested |
| **DPI** | Distributions / Paid-In Capital | How much actual cash returned per $1 invested |
| **RVPI** | Residual Value / Paid-In Capital | Unrealized value remaining per $1 invested |
| **MOIC** | Multiple on Invested Capital | Total return multiple (similar to TVPI) |
| **NAV** | Net Asset Value | Current value of fund's holdings |

---

### 2.4 Key Documents per Fund Type

**Required for ALL Fund Types:**
1. **Limited Partnership Agreement (LPA)** — The master governing document
   - Defines GP/LP rights, fee structure, waterfall, investment restrictions
   - Term, extensions, key person provisions
   - Typically 50-100+ pages
   
2. **Private Placement Memorandum (PPM)** — The marketing/disclosure document
   - Fund strategy, risks, terms, GP bios
   - Required for 506(b)/(c) offerings
   
3. **Subscription Agreement** — LP's commitment document
   - Commitment amount, investor representations
   - Accreditation verification (12 required representations per SEC Compliance §4.3)
   - Tax information (SSN/EIN, entity type)
   
4. **Side Letters** — Individual LP term modifications
   - Fee discounts, co-invest rights, MFN clauses
   - Reporting requirements, advisory committee seats

**Additional by Fund Type:**
- **VC**: Stock Purchase Agreements, SAFE agreements (for portfolio cos)
- **Real Estate**: Property-specific subscription agreements, JV agreements
- **Hedge Fund**: Offering memorandum, redemption procedures

---

## PART 3: SEC REGULATORY FRAMEWORK

### 3.1 Regulation D Exemptions

FundRoom supports offerings under Regulation D of the Securities Act of 1933. The GP selects which exemption applies during GP Wizard Step 3 (Raise Style), and this drives the entire compliance posture.

| Requirement | Rule 506(b) | Rule 506(c) |
|------------|-------------|-------------|
| **General Solicitation** | PROHIBITED. Must have pre-existing relationship. | PERMITTED. Can publicly advertise. |
| **Investor Types** | Unlimited accredited + up to 35 sophisticated non-accredited | Accredited investors ONLY |
| **Verification** | Self-certification (reasonable belief) | Reasonable steps to verify (see March 2025 guidance) |
| **Form D Filing** | Within 15 days of first sale | Within 15 days of first sale |
| **Switching** | Can switch TO 506(c) | CANNOT switch back to 506(b) after advertising |
| **FundRoom Default** | DEFAULT for most GPs | For Marketplace, public dataroom links, advertised offerings |

### 3.2 March 2025 No-Action Letter (Simplified 506(c) Verification)

On March 12, 2025, the SEC Division of Corporation Finance issued a landmark no-action letter (Latham & Watkins) that dramatically simplifies accredited investor verification under Rule 506(c). **This is a game-changer for FundRoom.**

**The Three Conditions (All Must Be Met):**

1. **Minimum Investment Threshold:**
   - Natural persons (individuals): $200,000+ minimum investment
   - Entities (accredited under Rule 501(a)(3), (7), (8), (9), or (12)): $1,000,000+
   - Entities accredited solely via all accredited equity owners: $200,000 per equity owner (if <5 natural persons) OR $1,000,000 total

2. **Written Representation:** Investor must provide:
   - Written confirmation they qualify as accredited under applicable Rule 501(a) subcategory
   - Written representation that minimum investment is NOT third-party financed for this specific investment
   - For entities via equity owners: each equity owner must also certify

3. **No Actual Knowledge:** Issuer must have:
   - No actual knowledge that any purchaser is not accredited
   - No actual knowledge that investment is third-party financed
   - Contractual commitments (capital call commitments) count toward threshold

**FundRoom Implementation:** The minimum commitment field in GP Wizard Step 5 directly maps to the verification threshold. If GP sets min commitment at $200K+ (individual) or $1M+ (entity), and we collect the written representations during LP onboarding Step 3, the GP satisfies 506(c) verification without income/net worth documentation.

### 3.3 Accredited Investor Categories (Rule 501)

**For Individuals:**
- Income >$200K (or >$300K joint) each of last 2 years + reasonable expectation
- Net worth >$1M excluding primary residence
- FINRA Series 7, 65, or 82 in good standing
- Director, executive officer, or GP of the issuer (insider)
- Knowledgeable employee of the private fund
- Meets minimum investment threshold per March 2025 guidance

**For Entities:**
- Regulated entity (bank, broker-dealer, insurance co, RIA)
- Assets >$5M, not formed for specific purpose of investing
- Trust with >$5M assets directed by sophisticated person
- All equity owners individually accredited
- Family office with AUM >$5M
- Entity owning investments >$5M
- Meets $1M minimum investment threshold per March 2025 guidance

### 3.4 Form D Requirements

**CRITICAL: Recent SEC enforcement (December 2024) resulted in $60K-$195K civil penalties for failure to file. This is no longer low-risk.**

- File electronically via EDGAR within 15 calendar days of first sale
- Annual amendment required if offering ongoing >12 months
- Material change amendment for significant changes

**16 Form D Items** (all captured across GP Wizard Steps 1, 3, 5):
1. Issuer identity (name, previous names, entity type, jurisdiction, year formed)
2. Principal place of business and contact
3. Related persons (directors, officers, promoters — past 5 years)
4. Industry group (fund strategy → SIC equivalent)
5. Issuer size (revenue range or NAV)
6. Federal exemption (506(b) or 506(c))
7. Type of filing (new, amendment, annual)
8. Duration of offering
9. Type of securities
10. Business combination transaction
11. Minimum investment accepted
12. Sales compensation
13. Offering and sales amounts
14. Number of investors (accredited + non-accredited)
15. Sales commissions and finder's fees
16. Use of proceeds

**FundRoom Feature:** Auto-generate Form D pre-fill data from wizard inputs. GP can export pre-populated PDF to file with EDGAR. Phase 2: Direct EDGAR filing integration.

### 3.5 Bad Actor Disqualification (Rule 506(d))

Covered persons must certify no disqualification. Captured in GP Wizard Step 1.

### 3.6 State Blue Sky Compliance

Rule 506 offerings are federally preempted but most states require notice filings. FundRoom reminds GPs after first LP commitment. Phase 2: State filing tracker.

---

## PART 4: UX MAPPING — What FundRoom Screens Need

### 4.1 GP Onboarding Wizard (8 Steps — Canonical Structure)

This is the canonical wizard architecture per GP Wizard Plan v1.0:

```
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│  1   │  2   │  3   │  4   │  5   │  6   │  7   │  8   │
│      │      │      │      │      │      │      │      │
│Comp. │Brand │Raise │Data  │Fund  │LP    │Integ │Launch│
│Info  │ing   │Style │room  │Dtls  │Onbd  │ation │      │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
 GREEN (Free, active)    AMBER (Free config,   BLUE (Integrations
                          paywall to activate)   + Launch)
```

**Step 1: Company Information** — Legal entity, EIN (encrypted), address, contact, related persons (Form D), bad actor certification (506(d))

**Step 2: Branding + Profile** — Logo, brand colors, custom domain, company profile (marketplace-ready), typography preset, powered-by badge, live preview

**Step 3: Raise Style (CRITICAL)** — Mode selection (GP_FUND / STARTUP / DATAROOM_ONLY) → Regulation D exemption (506(b) default / 506(c)) → Minimum investment + share price. Mode drives everything downstream.

**Step 4: Dataroom (FREE)** — Upload docs, policies (email gate, watermark, link expiry, downloads, invest button), shareable link, 506(b) advertising warning

**Step 5: Fund / Raise Details** — GP FUND: fund name, target, min commitment, mgmt fee, carry, hurdle, term, waterfall, strategy. STARTUP: instrument selector (SAFE/Note/Priced) + type-specific fields. Both: wiring instructions (bank, account, routing, SWIFT, intermediary, memo format)

**Step 6: LP Onboarding Settings** — LP step toggles, document templates (mode-specific), external doc settings, accreditation settings matrix (506(b) vs 506(c) behavior), GP approval gates, notification settings

**Step 7: Integrations + Compliance** — Active defaults (FundRoom Sign, S3, audit, Resend, manual wire), optional integrations (KYC, ACH, accounting, tax — Coming Soon), compliance settings (audit retention 7yr default, export format, Form D reminder)

**Step 8: Preview & Launch** — Summary cards with edit links, preview as visitor, dataroom status (live), fundroom status (paywall), add-ons ($50 branding removal, $10 custom domain), complete setup → redirect to GP dashboard

### 4.2 LP Onboarding Wizard (6 Steps)

```
Dataroom → "I Want to Invest" →
┌──────┬──────┬──────┬──────┬──────┬──────┐
│  1   │  2   │  3   │  4   │  5   │  6   │
│Acct  │NDA   │Accrd │Invst │Commit│Fund  │
│Setup │Sign  │Verify│Type  │+Sign │ing   │
└──────┴──────┴──────┴──────┴──────┴──────┘
```

**Step 1: Account Creation** — Email (pre-filled from dataroom gate), name, phone, password, email verification

**Step 2: NDA E-Signature** — Display NDA, FundRoom Sign, or upload external (pending GP confirmation)

**Step 3: Accredited Investor** — Driven by fund's regulation D exemption:
- 506(b): category selector + single self-certification checkbox
- 506(c) with threshold met: category selector + 3 checkboxes (accreditation, no third-party financing, threshold acknowledgment)
- 506(c) below threshold: document upload (income/net worth/third-party letter)
- ALL certifications individually timestamped + audit-logged with IP + user agent

**Step 4: Investor Type / Entity** — Full SEC-compliant field sets:
- Individual: name, DOB, SSN (encrypted), address (no PO Box), phone, email, citizenship, tax residence, occupation, source of funds, PEP status
- LLC/Corp: entity name, type, EIN (encrypted), tax classification, formation state/date/country, address, authorized signer, beneficial owners
- Trust: name, type, EIN (encrypted), date established, address, trustee info, trust agreement upload, grantor info
- IRA/401(k): account type, title (FBO), custodian details (name, account#, EIN, address, contact), holder SSN (encrypted), co-sign required, direction of investment letter

**Step 5: Commitment + Signing** — Investment amount, 12 required subscription representations (each audit-logged), e-sign via FundRoom Sign OR upload external docs (pending GP confirmation). Entity authorized signer + custodian co-sign for IRA.

**Step 6: Funding Instructions** — Wire instructions display, formatted reference line, wire proof upload (Document type WIRE_PROOF, pending GP confirmation), GP email notification, pay later option

### 4.3 GP Dashboard — Fund Mode

```
Fund Overview:
  ├── Raise Progress (committed vs target vs hard cap)
  ├── Capital Called vs Committed (utilization)
  ├── Distributions to Date
  ├── Fund NAV
  ├── Key Metrics: IRR, TVPI, DPI, RVPI
  └── Fund Timeline (where in lifecycle)

LP Pipeline:
  ├── Prospects → Committed → Funded → Active
  ├── Per-LP: commitment, called, unfunded, distributions received
  └── Engagement scoring from dataroom

Capital Calls:
  ├── Create New Call
  ├── Pending Calls (awaiting LP funding)
  ├── Call History
  └── Per-LP call tracker

Distributions:
  ├── Create Distribution Event
  ├── Waterfall Calculator (inputs: proceeds, source)
  ├── Distribution History
  └── Per-LP distribution tracker

Portfolio:
  ├── Investments made by the fund
  ├── Per-investment: cost basis, current value, multiple
  └── Exit tracking

Document Review (for GP confirmation workflow):
  ├── Pending: externally uploaded docs awaiting GP approval
  ├── Approve / Reject / Request Changes
  ├── Upload on behalf of LP (auto-confirmed)
  └── Wire proof confirmations
```

### 4.4 GP Dashboard — Startup Mode

```
Round Overview:
  ├── Amount Raised vs Target
  ├── Investor Count
  ├── Instrument breakdown (SAFE/Note/Priced)
  └── Round timeline

Investors:
  ├── Pipeline: Prospect → Committed → Funded → Active
  ├── Per-investor: amount, instrument type, terms, status
  └── Engagement scoring

Cap Table (Phase 2):
  ├── Founders (common stock, vesting)
  ├── Employees (option pool)
  ├── SAFE holders (conversion overhang)
  ├── Note holders (principal + accrued interest)
  ├── Preferred holders (per series)
  └── Dilution modeling

Documents:
  ├── SAFE/Note/SPA templates
  ├── Signed agreements
  └── Review queue (externally uploaded)
```

### 4.5 Capital Call Wizard (Phase 2)

```
Step 1: Call Details
  → Purpose (investment, fees, expenses)
  → Total amount needed
  → Due date (10-15 business days)
  → Call as % of remaining commitment

Step 2: LP Selection
  → All LPs (pro-rata) or select specific
  → Show each LP's: commitment, called to date, unfunded, this call amount
  → Override individual amounts if needed

Step 3: Review & Notify
  → Preview call notice
  → Wire instructions included automatically
  → Send notifications (email + in-app)

Step 4: Track Receipts
  → LP-by-LP wire confirmation
  → Mark received / escalate default
```

### 4.6 Distribution Wizard (Phase 2)

```
Step 1: Distribution Source
  → Investment exit (which portfolio company)
  → Dividend / interest income
  → Fund wind-down

Step 2: Waterfall Calculation
  → Input: gross proceeds
  → System calculates per waterfall tier:
    Tier 1: Return of capital amounts per LP
    Tier 2: Preferred return amounts per LP
    Tier 3: GP catch-up amount
    Tier 4: Carry split amounts
  → Show visual waterfall diagram
  → GP/LP split summary

Step 3: Review & Approve
  → Per-LP distribution amounts
  → Tax withholding considerations
  → Approve distribution

Step 4: Execute & Notify
  → Wire or ACH distributions
  → LP notifications with distribution statement
  → Update fund metrics
```

---

## PART 5: ENTITY & DOCUMENT MATRIX

### Documents Required by Raise Type

| Document | SAFE | Conv Note | Priced Round | GP/LP Fund |
|----------|------|-----------|--------------|------------|
| **NDA** | Optional | Optional | Common | Common |
| **SAFE Agreement** | ✅ Required | — | — | — |
| **Convertible Note** | — | ✅ Required | — | — |
| **Stock Purchase Agreement** | — | — | ✅ Required | — |
| **Investor Rights Agreement** | — | — | ✅ Required | — |
| **Voting Agreement** | — | — | Common | — |
| **ROFR / Co-Sale Agreement** | — | — | Common | — |
| **LPA** | — | — | — | ✅ Required |
| **PPM** | — | — | — | ✅ Required |
| **Subscription Agreement** | — | — | — | ✅ Required |
| **Side Letter** | Rare | Rare | Common | Common |
| **Accreditation Cert** | If 506(c) | If 506(c) | If 506(c) | If 506(c) |
| **W-9 / W-8BEN** | Post-close | Post-close | At close | At close |
| **K-1** | — | — | — | Annual |
| **Capital Call Notice** | — | — | — | Per call |
| **Distribution Notice** | — | — | — | Per distribution |

### LP-Provided Documents (SEC Compliance §7.2)

- W-9 (US taxpayers) or W-8BEN/W-8BEN-E (non-US)
- Government-issued photo ID (for KYC, Phase 2)
- Entity formation documents (LLC operating agreement, trust agreement, etc.)
- Custodian Direction of Investment Letter (IRA/401k)
- Accreditation verification letter (from CPA, attorney, broker-dealer, or RIA — optional for 506(c) with minimum investment threshold)
- Wire proof / payment confirmation

---

## PART 6: MVP PRIORITIZATION

### P0 — Must Have for Launch (This Week)

**GP Wizard (8 Steps):**
- Step 1: Full company info including related persons + bad actor cert
- Step 2: Logo + colors + domain (skip marketplace profile)
- Step 3: GP FUND mode fully functional + 506(b)/506(c) selector + min investment
- Step 4: Full dataroom with upload, policies, share link
- Step 5: GP FUND fields complete + wiring instructions
- Step 6: All 6 LP steps configured + doc templates + accreditation settings
- Step 7: Display-only, everything pre-active
- Step 8: Summary + preview + activate button

**LP Wizard (6 Steps):**
- Step 1: Account creation with email verification
- Step 2: NDA e-signature (FundRoom Sign)
- Step 3: Accredited investor self-certification (506(b)) + enhanced verification (506(c) with threshold)
- Step 4: Full entity data collection (Individual/LLC/Trust/IRA/Other) with encrypted fields
- Step 5: Commitment + all 12 subscription representations + e-sign or external upload
- Step 6: Wire instructions display + proof upload

**GP Review Flow:**
- Approve/reject externally uploaded documents
- Upload docs on behalf of LP (auto-confirmed)
- Wire proof confirmation
- All actions audit-logged

**Shared Infrastructure:**
- Dataroom with email gate + "I Want to Invest"
- NDA e-signature (FundRoom Sign)
- Accredited investor verification (both 506(b) and 506(c) paths)
- Full audit logging (IP, timestamp, user agent, hash chain)
- AES-256 encryption for SSN/EIN/account numbers
- Multi-tenant isolation (org_id on every query)
- Sensitive field masking in UI (show last 4 only)

### P1 — Week 2-3

**Startup Mode:**
- SAFE, Convertible Note, Priced Round fields fully functional
- Basic cap table view
- SAFE conversion tracking

**GP Fund Mode:**
- Capital call wizard
- Distribution wizard (basic waterfall calc)
- Fund metrics (IRR, TVPI, DPI)

**Compliance:**
- 506(c) below-threshold verification (income/net worth doc upload)
- Form D pre-fill export (PDF from wizard data)
- State blue sky reminder after first LP commitment

### P2 — Month 2+

- Priced round full support (SPA, IRA, voting agreements)
- Advanced waterfall engine (European + American + tiered carry)
- SPV creation & management
- Cap table scenarios / dilution modeling
- K-1 generation (Wolters Kluwer integration)
- Stripe ACH payments ($5 cap/tx)
- Persona KYC integration
- Form D EDGAR direct filing
- Third-party accreditation letter upload with expiration tracking
- Marketplace (V2): GPs list raises, accredited LPs browse/invest

---

## PART 7: UX DESIGN PRINCIPLES (FundRoom Specific)

### Navigation Architecture

```
STARTUP MODE sidebar:
  Dashboard
  Datarooms
  Raises (replaces "Funds")
    └── [Raise Name] → Overview, Investors, Cap Table, Documents
  Investors (Pipeline/CRM)
  Documents
  Reports
  Settings

GP FUND MODE sidebar:
  Dashboard
  Datarooms
  Funds
    └── [Fund Name] → Overview, LPs, Capital Calls, Distributions, Portfolio, Documents
  Investors (Pipeline/CRM)
  Documents
  Transactions
  Reports
  Settings
```

### Key UX Patterns (from Brand Guidelines v1.0)

1. **Mode-Driven UI**: The entire interface adapts based on GP FUND vs STARTUP mode. Different terminology, workflows, documents.

2. **Wizard-First**: Every complex flow is a multi-step wizard with progress indicator, auto-save, and resume capability. One CTA per screen.

3. **Progressive Disclosure**: Show simple defaults first, hide complexity behind "Advanced" toggles. A first-time SAFE raise should be 3 clicks.

4. **Opinionated Defaults**: Sensible defaults pre-filled. GP can click Next through entire wizard without changes and get working config.

5. **Real-Time Calculations**: Investment amounts immediately show units/shares, ownership %, fees.

6. **Document Assembly**: Auto-fill documents from entity data + raise terms. Reduce manual entry.

7. **Status Visibility**: Every investor, document, transaction has a clear status badge (pill-shaped, semantic colors, ALL CAPS, 11px).

8. **Mobile-First LP Experience**: LPs sign docs and upload wire proofs on phones. Full-screen signature pad, camera upload.

9. **Brand Consistency**: Deep Navy #0A1628 for trust, Electric Blue #0066FF for action, Inter typography, shadcn/ui + Tailwind components.

---

## PART 8: MODE COMPARISON QUICK REFERENCE

| Feature | GP FUND Mode | STARTUP Mode |
|---------|-------------|--------------|
| **Primary Document** | LPA + Subscription Agreement | SAFE / Conv. Note / SPA |
| **Key Terms** | Mgmt fee, carry, hurdle, waterfall, fund term | Val cap, discount, interest rate, share price, option pool |
| **Capital Flow** | Commitment → Capital Call → Distribution | Investment → (holds until conversion event) |
| **Typical Min Investment** | $100K – $500K | $10K – $100K |
| **Typical Reg D** | 506(b) (overwhelming majority) | 506(b) or 506(c) for syndicates |
| **Accreditation** | Self-cert (506b) or min threshold (506c) | Self-cert (506b) or min threshold (506c) |
| **LP Dashboard Shows** | Commitment status, capital calls, distributions, K-1s | Investment amount, SAFE/note status, conversion tracking |
| **GP Dashboard Shows** | Raise progress, LP pipeline, call schedule, distributions | Round progress, investor table, cap table, conversion modeling |
| **Form D Required** | Yes, within 15 days of first sale | Yes, within 15 days of first sale |

---

*This research document serves as the canonical reference for FundRoom's UX/UI design across both STARTUP and GP FUND modes. Updated to align with GP Wizard Plan v1.0, SEC Compliance Requirements v1.0, and Brand Guidelines v1.0.*
