import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { reportError } from "@/lib/error";
import { encryptTaxId } from "@/lib/crypto/secure-storage";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { publishServerEvent } from "@/lib/tracking/server-events";

/** Generate a prefixed cuid-style ID */
function generateId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${hex}`;
}

export const dynamic = "force-dynamic";

/**
 * POST /api/setup/complete
 * Finalizes the GP Organization Setup Wizard (V2 — 9 steps).
 * Creates: Organization, OrganizationDefaults, Team, UserTeam, Fund (optional),
 *          FundAggregate, Dataroom, FundroomActivation.
 * Encrypts sensitive fields (EIN, wire instructions).
 * Logs audit events including Bad Actor certification.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await req.json();
    const userId = auth.userId;

    // Generate IDs
    const orgId = generateId("org");
    const teamId = generateId("team");

    // Compute slug from company name
    const slug =
      (data.companyName || "org")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `org-${Date.now()}`;

    // Parse numeric values safely
    const parseNum = (val: string | number | undefined): number | null => {
      if (val === undefined || val === null || val === "") return null;
      const n = typeof val === "string" ? Number(val.replace(/[^0-9.]/g, "")) : val;
      return isNaN(n) ? null : n;
    };

    const parsePct = (val: string | number | undefined): number | null => {
      const n = parseNum(val);
      return n !== null ? n / 100 : null;
    };

    const isDataroomOnly = data.raiseMode === "DATAROOM_ONLY";
    const isStartup = data.raiseMode === "STARTUP";

    // Build wire instructions JSON (encrypted sensitive fields)
    const wireInstructions =
      !isDataroomOnly && data.bankName
        ? {
            bankName: data.bankName,
            accountName: data.accountName || data.companyName,
            accountNumber: data.accountNumber
              ? encryptTaxId(data.accountNumber)
              : null,
            routingNumber: data.routingNumber
              ? encryptTaxId(data.routingNumber)
              : null,
            swiftBic: data.swift || null,
            memoFormat:
              data.memoFormat ||
              "[Investor Name] - [Fund Name] - [Amount]",
            intermediaryBank: data.wireIntermediaryBank || null,
            specialInstructions: data.wireSpecialInstructions || null,
            currency: data.wireCurrency || "USD",
          }
        : null;

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          id: orgId,
          name: data.companyName || "Untitled Organization",
          slug,
          description: data.description || null,
          entityType: data.entityType || null,
          ein: data.ein ? encryptTaxId(data.ein.replace(/-/g, "")) : null,
          phone: data.contactPhone || null,
          addressLine1: data.address || null,
          addressCity: data.city || null,
          addressState: data.state || null,
          addressZip: data.zip || null,
          addressCountry: data.country || "US",
          logo: data.logoUrl || null,
          brandColor: data.brandColor || "#0A1628",
          accentColor: data.accentColor || "#0066FF",
          companyDescription: data.description || null,
          sector: data.sector || null,
          geography: data.geography || null,
          website: data.website || null,
          foundedYear: parseNum(data.foundedYear) as number | null,
          // V2 wizard fields
          legalName: data.legalName || data.companyName || null,
          yearIncorporated: parseNum(data.yearIncorporated) as number | null,
          jurisdiction: data.jurisdiction || null,
          previousNames: Array.isArray(data.previousNamesList) && data.previousNamesList.length > 0
            ? data.previousNamesList.join(", ")
            : data.previousNames || null,
          productMode: data.raiseMode || null,
          relatedPersons: Array.isArray(data.relatedPersons) && data.relatedPersons.length > 0
            ? data.relatedPersons
            : null,
          contactName: data.contactName || null,
          contactEmail: data.contactEmail || null,
          contactPhone: data.contactPhone || null,
          badActorCertified: data.badActorCertified === true,
          badActorCertifiedAt: data.badActorCertified
            ? new Date()
            : null,
          badActorCertifiedBy: data.badActorCertified ? userId : null,
          regulationDExemption: data.regDExemption || null,
          formDReminderEnabled: data.formDReminder !== false,
          featureFlags: {
            mode: data.raiseMode || "GP_FUND",
          },
        },
      });

      // 2. Create OrganizationDefaults with all notification + LP onboarding fields
      await tx.organizationDefaults.create({
        data: {
          organizationId: orgId,
          featureFlags: {
            mode: data.raiseMode || "GP_FUND",
            documentTemplates: data.documentTemplates || null,
          },
          regulationDExemption: data.regDExemption || "506B",
          // LP Onboarding Settings
          requireGpApproval: data.gpApproval !== false,
          allowExternalDocUpload: data.allowExternalUpload !== false,
          allowGpDocUploadForLp: data.allowGPUpload !== false,
          accreditationMethod: data.accreditationMethod || "SELF_ACK",
          minimumInvestThreshold: parseNum(data.minimumInvestThreshold),
          // GP Notification preferences
          notifyGpLpOnboardingStart: data.notifyGpLpOnboardingStart !== false,
          notifyGpCommitment: data.emailGPCommitment !== false,
          notifyGpWireUpload: data.emailGPWire !== false,
          notifyGpLpInactive: data.notifyGpLpInactive !== false,
          notifyGpExternalDocUpload: data.notifyGpExternalDocUpload !== false,
          // LP Notification preferences
          notifyLpStepComplete: data.emailLPSteps !== false,
          notifyLpWireConfirm: data.notifyLpWireConfirm !== false,
          notifyLpNewDocument: data.notifyLpNewDocument !== false,
          notifyLpChangeRequest: data.notifyLpChangeRequest !== false,
          notifyLpOnboardingReminder: data.notifyLpOnboardingReminder !== false,
          // Compliance
          auditLogRetentionDays:
            parseNum(data.auditRetention)
              ? (parseNum(data.auditRetention) as number) * 365
              : 2555,
        },
      });

      // 3. Create Team
      const team = await tx.team.create({
        data: {
          id: teamId,
          name: data.companyName || "Default Team",
          organizationId: orgId,
        },
      });

      // 4. Create UserTeam membership (OWNER)
      await tx.userTeam.create({
        data: {
          userId,
          teamId,
          role: "OWNER",
        },
      });

      // 5. Create Fund (if not DATAROOM_ONLY)
      let fund = null;
      if (!isDataroomOnly) {
        const targetAmount =
          parseNum(data.targetRaise) ||
          parseNum(data.allocationAmount) ||
          0;
        const minInvestAmount =
          parseNum(data.minInvestment) ||
          parseNum(data.minimumLpInvestment) ||
          0;

        // Determine fund name based on mode/instrument
        let fundName = data.fundName || `${data.companyName} Fund I`;
        if (isStartup) {
          if (data.instrumentType === "SPV") {
            fundName = data.spvName || `${data.companyName} SPV`;
          } else {
            fundName = data.roundName || `${data.companyName} Raise`;
          }
        }

        // Determine fund sub type
        let fundSubType = data.fundStrategy || null;
        if (isStartup && data.instrumentType === "SPV") {
          fundSubType = "SPV_COINVEST";
        }

        fund = await tx.fund.create({
          data: {
            teamId,
            name: fundName,
            entityMode: isStartup ? "STARTUP" : "FUND",
            targetRaise: targetAmount,
            minimumInvestment: minInvestAmount,
            regulationDExemption: data.regDExemption || "506B",
            currency: data.currency || "USD",
            // GP Fund economics
            managementFeePct: parsePct(data.mgmtFee),
            carryPct: parsePct(data.carry),
            hurdleRate: parsePct(data.hurdle),
            termYears: parseNum(data.fundTerm) as number | null,
            extensionYears: parseNum(data.extensionYears) as number | null,
            waterfallType: data.waterfallType || null,
            fundSubType,
            fundStrategy: data.fundStrategy || null,
            // Startup instrument fields
            instrumentType: isStartup
              ? data.instrumentType || null
              : "LPA",
            safeType: data.safeType || null,
            valuationCap: parseNum(data.valCap),
            discountRatePct: parsePct(data.discount),
            interestRatePct: parsePct(data.interestRate),
            maturityDate: data.maturityDate
              ? new Date(data.maturityDate)
              : null,
            qualifiedFinancingThreshold: parseNum(data.qualFinancing),
            preMoneyValuation: parseNum(data.preMoneyVal),
            liquidationPreference: data.liqPref || null,
            antiDilutionType: data.antiDilution || null,
            optionPoolPct: parsePct(data.optionPool),
            // Advanced fund settings (GP FUND mode)
            gpCommitmentAmount: parseNum(data.gpCommitment),
            gpCommitmentPct:
              parseNum(data.gpCommitment) && parseNum(data.targetRaise)
                ? (parseNum(data.gpCommitment) as number) /
                  (parseNum(data.targetRaise) as number)
                : null,
            investmentPeriodYears: parseNum(data.investmentPeriod) as number | null,
            recyclingEnabled: data.recyclingEnabled === true,
            keyPersonEnabled: data.keyPersonEnabled === true,
            keyPersonName: data.keyPersonName || null,
            noFaultDivorceThreshold: parseNum(data.noFaultDivorceThreshold),
            preferredReturnMethod: data.preferredReturnMethod || "COMPOUNDED",
            clawbackProvision: data.clawbackProvision !== false,
            mgmtFeeOffsetPct: parsePct(data.mgmtFeeOffset),
            // Wire instructions
            wireInstructions: wireInstructions ?? undefined,
            wireInstructionsUpdatedAt: wireInstructions
              ? new Date()
              : null,
            wireInstructionsUpdatedBy: wireInstructions ? userId : null,
            // SEC / Investment Company Act
            investmentCompanyExemption: data.investmentCompanyExemption || null,
            useOfProceeds: data.useOfProceeds || null,
            salesCommissions: data.salesCommissions || null,
            // Marketplace
            marketplaceInterest: data.marketplaceInterest === true,
            marketplaceDescription: data.marketplaceDescription || null,
            marketplaceCategory: data.marketplaceCategory || null,
            marketplaceInterestDate: data.marketplaceInterest
              ? new Date()
              : null,
            createdBy: userId,
            featureFlags: isStartup
              ? {
                  instrumentType: data.instrumentType,
                  roundName: data.roundName,
                  mfn: data.mfn,
                  proRata: data.proRata,
                  // SPV-specific fields stored in featureFlags
                  ...(data.instrumentType === "SPV"
                    ? {
                        spvName: data.spvName,
                        targetCompanyName: data.targetCompanyName,
                        dealDescription: data.dealDescription,
                        allocationAmount: parseNum(data.allocationAmount),
                        minimumLpInvestment: parseNum(data.minimumLpInvestment),
                        maxInvestors: parseNum(data.maxInvestors),
                        spvTerm: data.spvTerm,
                        spvMgmtFee: parsePct(data.spvMgmtFee),
                        spvCarry: parsePct(data.spvCarry),
                        spvGpCommitment: parseNum(data.spvGpCommitment),
                      }
                    : {}),
                  // Priced Round additional fields
                  ...(data.instrumentType === "PRICED_ROUND"
                    ? {
                        boardSeats: parseNum(data.boardSeats),
                        protectiveProvisions: data.protectiveProvisions !== false,
                        informationRights: data.informationRights !== false,
                        rofrCoSale: data.rofrCoSale !== false,
                        dragAlong: data.dragAlong !== false,
                      }
                    : {}),
                }
              : {
                  unitPrice: parseNum(data.sharePrice),
                  highWaterMark: data.highWaterMark === true,
                  minimumCommitment: parseNum(data.minimumCommitment),
                },
          },
        });

        // SPV: also set fund-level economics from SPV fields
        if (isStartup && data.instrumentType === "SPV") {
          await tx.fund.update({
            where: { id: fund.id },
            data: {
              carryPct: parsePct(data.spvCarry),
              managementFeePct: parsePct(data.spvMgmtFee),
              gpCommitmentAmount: parseNum(data.spvGpCommitment),
            },
          });
        }

        // Create FundAggregate
        await tx.fundAggregate.create({
          data: {
            fundId: fund.id,
          },
        });

        // Create initial FundingRound(s) for startup mode
        if (isStartup) {
          const roundName = data.roundName || data.instrumentType === "SPV"
            ? (data.spvName || `${data.companyName} SPV`)
            : "Seed Round";

          await tx.fundingRound.create({
            data: {
              fundId: fund.id,
              roundName,
              roundOrder: 1,
              amountRaised: 0,
              targetAmount: targetAmount || null,
              preMoneyVal: parseNum(data.preMoneyVal) ?? parseNum(data.valCap) ?? null,
              postMoneyVal: null,
              leadInvestor: null,
              investorCount: 0,
              status: "ACTIVE",
              instrumentType: data.instrumentType || null,
              valuationCap: parseNum(data.valCap),
              discount: parseNum(data.discount),
              orgId,
            },
          });

          // Create additional planned rounds from wizard data
          if (Array.isArray(data.plannedRounds) && data.plannedRounds.length > 0) {
            for (let i = 0; i < data.plannedRounds.length; i++) {
              const pr = data.plannedRounds[i];
              if (!pr.roundName || typeof pr.roundName !== "string" || !pr.roundName.trim()) continue;
              const prTarget = parseNum(pr.targetAmount);
              await tx.fundingRound.create({
                data: {
                  fundId: fund.id,
                  roundName: pr.roundName.trim(),
                  roundOrder: i + 2, // Active round is 1
                  amountRaised: 0,
                  targetAmount: prTarget || null,
                  status: "PLANNED",
                  instrumentType: pr.instrumentType || null,
                  valuationCap: parseNum(pr.valuationCap),
                  discount: parseNum(pr.discount),
                  orgId,
                },
              });
            }
          }
        }

        // Create initial pricing tiers for GP_FUND mode
        if (!isStartup && !isDataroomOnly && Array.isArray(data.initialTiers) && data.initialTiers.length > 0) {
          for (const tier of data.initialTiers) {
            const pricePerUnit = parseNum(tier.pricePerUnit);
            const unitsAvailable = parseInt(String(tier.unitsAvailable).replace(/[^0-9]/g, ""), 10);
            if (!pricePerUnit || !unitsAvailable || isNaN(unitsAvailable)) continue;
            await tx.fundPricingTier.create({
              data: {
                fundId: fund.id,
                tranche: tier.tranche,
                name: tier.name?.trim() || `Tranche ${tier.tranche}`,
                pricePerUnit,
                unitsAvailable,
                unitsTotal: unitsAvailable,
                isActive: tier.tranche === 1,
              },
            });
          }
        }
      }

      // 6. Create Dataroom
      const dataroomName =
        data.dataroomName ||
        `${data.companyName || "Company"} — Fund Dataroom`;
      const dataroom = await tx.dataroom.create({
        data: {
          pId: `dr_${generateId("dr")}`,
          name: dataroomName,
          teamId,
        },
      });

      // 7. Create FundroomActivation
      await tx.fundroomActivation.create({
        data: {
          teamId,
          fundId: fund?.id || null,
          status: "ACTIVE",
          activatedBy: userId,
          activatedAt: new Date(),
          mode: data.raiseMode || "GP_FUND",
          wireInstructionsConfigured: !!wireInstructions,
          brandingConfigured: !!(data.brandColor || data.logoUrl),
          setupProgress: {
            companyInfo: true,
            branding: !!(data.brandColor || data.logoUrl),
            raiseType: !!data.raiseMode,
            teamInvites: (data.inviteEmails || []).filter(
              (e: string) => e && e.trim(),
            ).length > 0,
            dataroom: true,
            fund: !isDataroomOnly,
            lpOnboarding: !isDataroomOnly,
            integrations: true,
            wire: !!wireInstructions,
            notifications: true,
          },
          setupCompletedAt: new Date(),
        },
      });

      return { org, team, fund, dataroom };
    });

    // Audit: Organization created
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId,
      teamId,
      resourceType: "Organization",
      resourceId: orgId,
      metadata: {
        action: "organization_created",
        orgName: data.companyName,
        raiseMode: data.raiseMode,
        regDExemption: data.regDExemption,
        instrumentType: data.instrumentType || null,
        teamInviteCount: (data.inviteEmails || []).filter(
          (e: string) => e && e.trim(),
        ).length,
      },
    });

    // Audit: Bad Actor certification (separately logged and immutable)
    if (data.badActorCertified) {
      await logAuditEvent(
        {
          eventType: "SETTINGS_UPDATED",
          userId,
          teamId,
          resourceType: "Organization",
          resourceId: orgId,
          metadata: {
            action: "CERTIFY",
            certification: "BAD_ACTOR_506D",
            certified: true,
            certificationText:
              "I certify that no covered person associated with this offering (as defined in Rule 506(d) of Regulation D) is subject to disqualification.",
            ipAddress:
              req.headers.get("x-forwarded-for") ||
              req.headers.get("x-real-ip"),
            userAgent: req.headers.get("user-agent"),
          },
        },
        { useImmutableChain: true },
      );
    }

    // Audit: Fund created
    if (result.fund) {
      await logAuditEvent({
        eventType: "FUND_CREATED",
        userId,
        teamId,
        resourceType: "Fund",
        resourceId: result.fund.id,
        metadata: {
          fundName: result.fund.name,
          instrumentType: data.instrumentType,
          targetRaise: data.targetRaise,
          fundStrategy: data.fundStrategy,
        },
      });
    }

    // Fire-and-forget: Send team invite emails
    const validInvites = (data.inviteEmails || [])
      .map((email: string, i: number) => ({
        email: email?.trim(),
        role: (data.inviteRoles || [])[i] || "ADMIN",
      }))
      .filter((inv: { email: string }) => inv.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email));

    if (validInvites.length > 0) {
      // Store invites in org audit log for later manual processing
      // Team invites can be sent from Settings > Team after setup
      await logAuditEvent({
        teamId,
        userId,
        eventType: "ADMIN_ACTION",
        resourceType: "Organization",
        resourceId: orgId,
        metadata: {
          action: "team_invites_queued",
          invites: validInvites.map((inv: { email: string; role: string }) => ({
            email: inv.email,
            role: inv.role,
          })),
        },
      }).catch((e) => reportError(e as Error));
    }

    // Fire-and-forget: Track org setup completion
    publishServerEvent("funnel_org_setup_completed", {
      userId,
      orgId,
      teamId,
      method: data.raiseMode || "GP_FUND",
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      success: true,
      orgId,
      teamId,
      fundId: result.fund?.id || null,
      dataroomId: result.dataroom.id,
      redirectUrl: "/admin/dashboard",
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
