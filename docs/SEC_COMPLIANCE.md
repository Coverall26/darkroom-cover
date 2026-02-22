# SEC Compliance Reference

Consolidated reference for SEC regulatory compliance features implemented in FundRoom. This document covers Regulation D exemptions, investor accreditation, Form D data capture, audit trail requirements, and e-signature compliance.

---

## Table of Contents

- [Regulation D Exemptions](#regulation-d-exemptions)
- [Investor Accreditation](#investor-accreditation)
- [Form D Data Capture](#form-d-data-capture)
- [Bad Actor Certification (Rule 506(d))](#bad-actor-certification-rule-506d)
- [Investor Representations](#investor-representations)
- [E-Signature Compliance](#e-signature-compliance)
- [Audit Trail (SEC 506(c))](#audit-trail-sec-506c)
- [Data Retention](#data-retention)
- [Key Files](#key-files)

---

## Regulation D Exemptions

FundRoom supports 4 SEC exemption types, selected during GP Org Setup Wizard Step 3 (Raise Style) and stored in `Fund.regulationDExemption`.

### Rule 506(b)

| Attribute | Value |
|-----------|-------|
| Schema value | `506B` |
| General solicitation | Not permitted |
| Non-accredited investors | Up to 35 (must be sophisticated) |
| Accreditation verification | Self-certification sufficient |
| Form D filing | Required within 15 days of first sale |
| Key restriction | No general advertising or solicitation |

**Platform behavior**: Standard accreditation flow. Self-acknowledged accreditation accepted. No enhanced verification required.

### Rule 506(c)

| Attribute | Value |
|-----------|-------|
| Schema value | `506C` |
| General solicitation | Permitted |
| Non-accredited investors | None allowed |
| Accreditation verification | Reasonable steps required (third-party or documented) |
| Form D filing | Required within 15 days of first sale |
| Key restriction | Must take reasonable steps to verify accreditation |

**Platform behavior**: Enhanced accreditation flow activated. LP onboarding Step 3 (Accreditation) requires additional fields:
- `noThirdPartyFinancing` checkbox (mandatory)
- `sourceOfFunds` dropdown: SALARY, INVESTMENT_RETURNS, BUSINESS_INCOME, INHERITANCE, SAVINGS, OTHER
- `occupation` / employer text field (mandatory)
- All stored on Investor record for audit

**Implementation**: `app/lp/onboard/page-client.tsx` — Step 3 checks `fundContext.regulationDExemption === "506C"` to show enhanced fields.

### Regulation A+ (Tier 1 / Tier 2)

| Attribute | Value |
|-----------|-------|
| Schema value | `REG_A_PLUS` |
| Maximum raise | Tier 1: $20M / Tier 2: $75M (12-month rolling) |
| Non-accredited investors | Allowed (Tier 2: 10% annual income/net worth limit) |
| SEC qualification | Required (Form 1-A) |
| State registration | Tier 1: required. Tier 2: exempt |
| Ongoing reporting | Tier 2: annual, semi-annual, current event reports |

### Rule 504

| Attribute | Value |
|-----------|-------|
| Schema value | `RULE_504` |
| Maximum raise | $10M in 12 months |
| Non-accredited investors | Generally allowed |
| General solicitation | Varies by state |
| State registration | May be required |
| Form D filing | Required |

**Selection UI**: `components/setup/fund-details-step.tsx` — 4-card selector with descriptions and compliance notes. Also available in Org Setup Wizard Step 3 via `components/setup/raise-style-step.tsx`.

---

## Investor Accreditation

### Accreditation Criteria by Entity Type

Accreditation criteria are entity-type-specific, matching SEC Rule 501(a) definitions.

#### Individual

| Criteria | Threshold |
|----------|-----------|
| Annual income | > $200,000 for last 2 years (reasonable expectation of same) |
| Joint income | > $300,000 for last 2 years |
| Net worth | > $1,000,000 (excluding primary residence) |
| Professional certifications | Series 7, Series 65, or Series 82 |
| Knowledgeable employee | Of a private fund's investment adviser |

#### Joint (Spousal)

| Criteria | Threshold |
|----------|-----------|
| Joint income | > $300,000 for last 2 years |
| Combined net worth | > $1,000,000 (excluding primary residences) |

#### Trust / Estate

| Criteria | Threshold |
|----------|-----------|
| Total assets | > $5,000,000 (not formed for specific investment) |
| Grantor status | Grantor is an accredited investor |
| Knowledgeable employees | Directs investments for the trust |

#### LLC / Corporation

| Criteria | Threshold |
|----------|-----------|
| Total assets | > $5,000,000 |
| All equity owners | Each is an accredited investor |
| Investment company | Registered under Investment Company Act |
| Bank / insurance | Registered institution |

#### Partnership

| Criteria | Threshold |
|----------|-----------|
| Total assets | > $5,000,000 |
| All partners | Each is an accredited investor |
| Investment company | Registered under Investment Company Act |

#### IRA / Retirement

| Criteria | Threshold |
|----------|-----------|
| Self-directed | By an accredited individual |
| Plan assets | > $5,000,000 |

#### Charity / Foundation

| Criteria | Threshold |
|----------|-----------|
| Total assets | > $5,000,000 |
| Formation | Not formed for the specific investment purpose |
| Knowledgeable employees | Direct investments for the entity |

**Implementation**: `components/onboarding/InvestorTypeStep.tsx` (69KB) — dynamic forms per entity type with checkboxes matching SEC criteria. Zod validation in `lib/validations/investor-entity.ts`.

### Accreditation Verification Methods

Configured in GP Org Setup Wizard Step 6 (LP Onboarding > Accreditation & Compliance).

| Method | Schema Value | Description |
|--------|-------------|-------------|
| Self-Acknowledged | `SELF_ACK` | LP checks accreditation criteria boxes |
| Self-Acknowledged + Minimum Investment | `SELF_ACK_MIN_INVEST` | Same + minimum investment threshold |
| Third-Party Verification | `PERSONA` | Persona KYC/AML (coming soon badge) |

**March 2025 No-Action Letter**: The SEC no-action letter allows issuers to rely on minimum investment thresholds as one factor in determining accredited status for 506(c) offerings. The platform implements this via `SELF_ACK_MIN_INVEST` with a configurable minimum threshold.

**Auto-heal logic**: If LP reaches onboarding Step 6 (commitment) but `ndaSigned` or `accreditationStatus` flags weren't set, the Subscribe API auto-heals by checking the OnboardingFlow record and `onboardingStep` value. See `pages/api/lp/subscribe.ts`.

---

## Form D Data Capture

Form D is the SEC filing required within 15 days of the first sale of securities. FundRoom captures all required Form D fields during GP setup and investor onboarding.

### Fund-Level Fields (GP Setup)

| Form D Item | Platform Field | Captured In |
|-------------|---------------|-------------|
| Issuer Name | `Organization.name` | Org Setup Step 1 |
| Entity Type | `Organization.entityType` | Org Setup Step 1 |
| EIN | `Organization.ein` (AES-256 encrypted) | Org Setup Step 1 |
| Address | `Organization.addressLine1/City/State/Zip/Country` | Org Setup Step 1 |
| Phone | `Organization.phone` | Org Setup Step 1 |
| Industry Group | `Organization.sector` | Org Setup Step 2 |
| Fund Name | `Fund.name` | Org Setup Step 5 |
| Type of Securities | `Fund.fundType` / `Fund.fundSubType` | Org Setup Step 5 |
| Exemption Claimed | `Fund.regulationDExemption` | Org Setup Step 3 |
| Minimum Investment | `Fund.minimumInvestment` | Org Setup Step 3 |
| Target Offering Amount | `Fund.targetSize` | Org Setup Step 5 |

### Investor-Level Fields (LP Onboarding)

| Form D Item | Platform Field | Captured In |
|-------------|---------------|-------------|
| Investor Name | `User.name` | LP Onboard Step 1 |
| Investor Type | `Investor.entityType` | LP Onboard Step 4 |
| Accreditation | `Investor.accreditationStatus` | LP Onboard Step 3 |
| Investment Amount | `Investment.amount` | LP Onboard Step 5 |
| State of Residence | `Investor.addressState` | LP Onboard Step 4 |

### Form D Reminders

`GET/POST /api/admin/form-d-reminders` — Tracks Form D filing deadlines and sends email reminders to GPs. Tier 1 email from @fundroom.ai.

---

## Bad Actor Certification (Rule 506(d))

Rule 506(d) requires issuers to conduct a "bad actor" check on all covered persons before relying on Rule 506 exemptions.

### Captured Fields

| Field | Model | Location |
|-------|-------|----------|
| Certification date | `Organization.badActorCertDate` | GP Setup Step 1 |
| Signer name | `Organization.badActorCertSignerName` | GP Setup Step 1 |
| Signer title | `Organization.badActorCertSignerTitle` | GP Setup Step 1 |

### GP Setup Wizard Integration

Step 1 (Company Info) includes a collapsible "Bad Actor Certification (Rule 506(d))" section with:
- Checkbox: "I certify that no covered person... has been subject to any disqualifying event"
- Full text of the certification
- Date, signer name, and signer title fields (required when checkbox checked)

**Implementation**: `app/admin/setup/Step1CompanyInfo.tsx` — Bad Actor section with date picker and signer fields. Persisted via `POST /api/setup/complete` in the atomic `$transaction`.

---

## Investor Representations

8 SEC-required investor representations are collected during LP onboarding Step 5 (Commitment). All must be acknowledged before the commitment can be submitted.

| # | Representation | Field Key |
|---|---------------|-----------|
| 1 | I am an accredited investor as defined in SEC Rule 501(a) | `accreditedCert` |
| 2 | I am investing as principal, not as agent or nominee | `investingAsPrincipal` |
| 3 | I have read and understood all offering documents | `readOfferingDocs` |
| 4 | I understand the risks, including possible total loss | `riskAwareness` |
| 5 | I understand these are restricted securities under Rule 144 | `restrictedSecurities` |
| 6 | I am not subject to AML/OFAC sanctions | `amlOfac` |
| 7 | I consent to providing my tax ID for K-1 preparation | `taxConsent` |
| 8 | I have had the opportunity to seek independent legal/financial advice | `independentAdvice` |

### Storage

Representations are stored in `Investor.fundData.representations` as a JSON object:
```json
{
  "accreditedCert": true,
  "investingAsPrincipal": true,
  "readOfferingDocs": true,
  "riskAwareness": true,
  "restrictedSecurities": true,
  "amlOfac": true,
  "taxConsent": true,
  "independentAdvice": true,
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

**Implementation**: `app/lp/onboard/page-client.tsx` — Step 5 renders 8 checkboxes. Submit button disabled until all checked. Persisted via `POST /api/lp/commitment` which stores in `Investor.fundData`.

---

## E-Signature Compliance

FundRoom Sign is the native e-signature system. It complies with the ESIGN Act (15 U.S.C. 7001-7031) and UETA.

### ESIGN Act Requirements

| Requirement | Implementation |
|-------------|---------------|
| Intent to sign | Explicit "Sign Document" button + consent checkbox |
| Consent to do business electronically | ESIGN/UETA confirmation modal with legal text |
| Association of signature with record | Signature fields linked to specific document coordinates |
| Record retention | Signed PDFs stored encrypted (AES-256), configurable retention |

### UETA Requirements

| Requirement | Implementation |
|-------------|---------------|
| Attribution | Signature linked to user session, IP, user-agent logged |
| Effect | Legally binding once all parties sign |
| Record of agreement | Certificate of Completion embedded in PDF |

### Consent Flow

1. LP views document with field overlays
2. LP fills required fields (auto-filled where possible)
3. LP captures signature (draw, type, or upload)
4. LP checks consent checkbox: "I agree to sign this document electronically"
5. ESIGN/UETA confirmation modal appears with legal language
6. LP confirms → signature submitted

### Audit Trail per Signature

Each signature action is recorded with:
- User ID and email
- IP address and user-agent
- Timestamp (ISO 8601)
- Document ID and field coordinates
- SHA-256 checksum of the document at time of signing
- ESIGN consent record (from `lib/signature/checksum.ts`)

### Certificate of Completion

After all signers complete a document:
1. Signatures are flattened onto the PDF (pdf-lib)
2. A Certificate of Completion page is appended containing:
   - Document ID and title
   - SHA-256 checksum
   - List of all signers with timestamps
   - IP addresses and consent records
3. The completed PDF is encrypted (AES-256) and stored
4. `signedFileUrl`, `signedFileType`, `signedAt` columns updated on SignatureDocument

### Signature Field Types

| Type | Description | Auto-Fill |
|------|-------------|-----------|
| SIGNATURE | Full signature image | Saved signature from profile |
| INITIALS | Initials image | Separate initials capture |
| TEXT | Free text field | — |
| CHECKBOX | Boolean checkbox | — |
| DATE_SIGNED | Date of signing | Current date |
| NAME | Signer's full name | From investor profile |
| EMAIL | Signer's email | From session |
| COMPANY | Company/entity name | From entity details |
| TITLE | Job title | From profile |
| ADDRESS | Full address | From investor profile |

---

## Audit Trail (SEC 506(c))

SEC Rule 506(c) requires "reasonable steps" to verify accredited investor status. The platform maintains a tamper-evident audit trail for compliance.

### Immutable Hash Chain

- **Algorithm**: SHA-256
- **Structure**: Each entry links to previous entry via hash
- **Isolation**: Separate chains per team (multi-tenant)
- **Genesis**: 64-char zero hash for first entry
- **Sequence**: Monotonically increasing BigInt

### What is Logged

| Category | Events |
|----------|--------|
| Authentication | USER_LOGIN, USER_LOGOUT, USER_REGISTERED, USER_PASSWORD_SET |
| Documents | DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, DOCUMENT_SIGNED, DOCUMENT_COMPLETED, DOCUMENT_DECLINED |
| Subscriptions | SUBSCRIPTION_CREATED, SUBSCRIPTION_SIGNED, SUBSCRIPTION_PAYMENT_* |
| Accreditation | ACCREDITATION_SUBMITTED, ACCREDITATION_APPROVED, ACCREDITATION_REJECTED, ACCREDITATION_AUTO_APPROVED |
| Investor Lifecycle | INVESTOR_CREATED, INVESTOR_UPDATED, INVESTOR_REVIEWED, INVESTOR_APPROVED, INVESTOR_APPROVED_WITH_CHANGES, INVESTOR_REJECTED, INVESTOR_CHANGES_REQUESTED |
| KYC/AML | KYC_INITIATED, KYC_COMPLETED, KYC_FAILED, AML_SCREENING |
| Financial | CAPITAL_CALL_CREATED, CAPITAL_CALL_PAID, DISTRIBUTION_CREATED, DISTRIBUTION_COMPLETED |
| Fund Operations | FUND_CREATED, FUND_SETTINGS_UPDATE, FUND_THRESHOLD_UPDATE |
| Platform | FUNDROOM_ACTIVATED, FUNDROOM_DEACTIVATED, SETTINGS_UPDATED |

### Verification

- **API**: `POST /api/teams/:teamId/audit/verify` — Recomputes hashes and validates chain integrity
- **Export**: `POST /api/teams/:teamId/audit/export` — Exports log with integrity checksums for external audit

### Each Log Entry Contains

```typescript
{
  teamId: string;           // Multi-tenant isolation
  userId: string;           // Actor
  eventType: AuditEventType;
  resourceType: ResourceType;
  resourceId: string;
  ip: string;
  userAgent: string;
  timestamp: DateTime;
  metadata: Json;           // Event-specific details
  previousHash: string;     // Link to previous entry
  currentHash: string;      // SHA-256 of this entry
  sequenceNumber: BigInt;
  metadataHash: string;     // Separate hash for JSON stability
}
```

---

## Data Retention

| Data Type | Default Retention | Configurable | Location |
|-----------|-------------------|-------------|----------|
| Audit logs | 7 years (2,555 days) | Yes (1-10 years) | `AUDIT_LOG_RETENTION_DAYS` env var, Settings Center |
| Signature audit logs | 7 years | Yes | `SIGNATURE_AUDIT_LOG_RETENTION_DAYS` env var |
| Signed documents | Indefinite | No | Encrypted storage |
| Investor profiles | Indefinite | No | Database |
| Transaction records | Indefinite | No | Database |
| KYC/AML records | Per regulatory requirement | No | Database |

**Automated cleanup**: `POST /api/cron/audit-retention` — Cron job purges audit log entries older than the configured retention period per team.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/audit/audit-logger.ts` | 60+ audit event types, logging interface |
| `lib/audit/immutable-audit-log.ts` | SHA-256 hash-chained immutable log |
| `lib/signature/flatten-pdf.ts` | PDF flattening with Certificate of Completion |
| `lib/signature/checksum.ts` | SHA-256 checksums + ESIGN consent |
| `lib/validations/investor-entity.ts` | 7 entity type Zod schemas |
| `lib/validations/startup-raise-types.ts` | SAFE/Conv Note/Priced/SPV schemas |
| `lib/validations/fund-types.ts` | Regulation D exemption enum |
| `components/onboarding/InvestorTypeStep.tsx` | Entity type forms with accreditation criteria |
| `components/esign/FundRoomSign.tsx` | Consolidated signing component |
| `components/setup/raise-style-step.tsx` | Raise style + Reg D selector |
| `components/setup/fund-details-step.tsx` | Fund terms + Reg D selector |
| `app/lp/onboard/page-client.tsx` | LP onboarding with 506(c) enhanced fields |
| `pages/api/lp/subscribe.ts` | Commitment with auto-heal + representations |
| `pages/api/sign/[token].ts` | Signature submission + flatten + advance |
| `app/admin/setup/Step1CompanyInfo.tsx` | Bad Actor 506(d) certification |
