import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendInvestorWelcomeEmail, sendInvestorWelcomeEmailWithFund } from "@/lib/emails/send-investor-welcome";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";
import { ratelimit } from "@/lib/redis";
import { requireFundroomActive, requireFundroomActiveByFund, PAYWALL_ERROR } from "@/lib/auth/paywall";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { captureFromLPRegistration } from "@/lib/crm/contact-upsert-job";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { sendAccreditationConfirmedEmail } from "@/lib/emails/send-accreditation-confirmed";

export const dynamic = "force-dynamic";

const registrationLimiter = ratelimit(5, "60 s");

/**
 * POST /api/lp/register
 * Registers a new LP investor or upgrades an existing user's investor profile.
 * Generates a one-time login token for immediate session creation.
 */
export async function POST(req: NextRequest) {
  // Bot protection
  const botCheck = await verifyNotBot();
  if (botCheck.blocked) return botCheck.response;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const rlResult = await registrationLimiter.limit(`lp-register:${ip}`);
    if (!rlResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }
  } catch (rlError) {
    // Fail closed — if Redis is down, reject the request to prevent abuse
    reportError(rlError as Error);
    return NextResponse.json(
      { error: "Service temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  try {
    const {
      name,
      email,
      phone,
      password,
      entityType,
      entityName,
      entityData,
      address,
      accreditationType,
      ndaAccepted,
      sourceOfFunds,
      occupation,
      fundId,
      teamId,
      referralSource,
    } = await req.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Input length validations — prevent oversized payloads
    if (typeof name === "string" && name.length > 200) {
      return NextResponse.json({ error: "Name exceeds 200 characters" }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: "Email exceeds 254 characters" }, { status: 400 });
    }
    if (phone && typeof phone === "string" && phone.length > 30) {
      return NextResponse.json({ error: "Phone exceeds 30 characters" }, { status: 400 });
    }
    // bcrypt silently truncates passwords > 72 bytes — reject to prevent confusion
    if (password && typeof password === "string" && password.length > 72) {
      return NextResponse.json({ error: "Password exceeds 72 characters" }, { status: 400 });
    }
    if (fundId && typeof fundId === "string" && fundId.length > 100) {
      return NextResponse.json({ error: "Invalid fundId" }, { status: 400 });
    }
    if (teamId && typeof teamId === "string" && teamId.length > 100) {
      return NextResponse.json({ error: "Invalid teamId" }, { status: 400 });
    }

    // Paywall check: LP registration requires an active FundRoom subscription
    // Only enforced when a specific fund/team is targeted (from dataroom CTA)
    if (fundId) {
      const allowed = await requireFundroomActiveByFund(fundId);
      if (!allowed) {
        return NextResponse.json(PAYWALL_ERROR, { status: 402 });
      }
    } else if (teamId) {
      const allowed = await requireFundroomActive(teamId);
      if (!allowed) {
        return NextResponse.json(PAYWALL_ERROR, { status: 402 });
      }
    }

    // Determine entity type: use explicit entityType, or infer from entityName
    const resolvedEntityType = entityType || (entityName ? "ENTITY" : "INDIVIDUAL");

    // Resolve lead source from referralSource param or context
    const resolvedLeadSource = referralSource
      ? String(referralSource).slice(0, 50)
      : fundId ? "DATAROOM" : "DIRECT";

    // Build the investor profile data
    const investorData: Record<string, unknown> = {
      entityName: entityName || null,
      entityType: resolvedEntityType,
      phone: phone || null,
      accreditationType: accreditationType || null,
      onboardingStep: ndaAccepted ? 5 : 1,
      leadSource: resolvedLeadSource,
      ...(sourceOfFunds ? { sourceOfFunds: String(sourceOfFunds).slice(0, 50) } : {}),
      ...(occupation ? { occupation: String(occupation).slice(0, 255) } : {}),
    };

    // Map address fields to structured Investor columns
    if (address && typeof address === "object") {
      if (address.street1) investorData.addressLine1 = String(address.street1).slice(0, 255);
      if (address.street2) investorData.addressLine2 = String(address.street2).slice(0, 255);
      if (address.city) investorData.city = String(address.city).slice(0, 100);
      if (address.state) investorData.state = String(address.state).slice(0, 50);
      if (address.zip) investorData.postalCode = String(address.zip).slice(0, 20);
      if (address.country) investorData.country = String(address.country).slice(0, 10);
      // Also store as legacy single-line for backward compat
      investorData.address = JSON.stringify(address);
    }

    // Map entity-specific data to structured Investor columns
    if (entityData && typeof entityData === "object") {
      if (entityData.custodianName) investorData.custodianName = String(entityData.custodianName).slice(0, 255);
      if (entityData.custodianAccount) investorData.custodianAccount = String(entityData.custodianAccount).slice(0, 255);
    }

    // Store entity-specific data in fundData JSON field for additional details
    const fundDataPayload: Record<string, unknown> = {};
    if (entityData && Object.keys(entityData).length > 0) {
      fundDataPayload.entityDetails = entityData;
    }
    if (address && typeof address === "object") {
      fundDataPayload.address = address;
    }
    if (Object.keys(fundDataPayload).length > 0) {
      investorData.fundData = fundDataPayload;
    }

    // Set accreditation and NDA status
    if (accreditationType) {
      investorData.accreditationStatus = "SELF_CERTIFIED";
    }
    if (ndaAccepted) {
      investorData.ndaSigned = true;
      investorData.ndaSignedAt = new Date();
    }

    // Hash password if provided (for immediate credentials sign-in after registration)
    let hashedPassword: string | undefined;
    if (password && typeof password === "string" && password.length >= 8) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { investorProfile: true },
    });

    if (user) {
      if (!user.investorProfile) {
        // Only create investor profile if one doesn't exist
        await prisma.investor.create({
          data: {
            userId: user.id,
            ...investorData,
          } as any,
        });
      } else {
        // Do NOT overwrite existing investor profiles wholesale — prevents overwriting
        // data from a different session or impersonation via email collision.
        // However, DO upgrade NDA/accreditation flags (false→true, PENDING→SELF_CERTIFIED)
        // to handle edge cases: LP was GP-added, or page refresh lost form state.
        const upgradeData: Record<string, unknown> = {};
        if (ndaAccepted && !user.investorProfile.ndaSigned) {
          upgradeData.ndaSigned = true;
          upgradeData.ndaSignedAt = new Date();
        }
        if (
          accreditationType &&
          user.investorProfile.accreditationStatus !== "SELF_CERTIFIED" &&
          user.investorProfile.accreditationStatus !== "KYC_VERIFIED"
        ) {
          upgradeData.accreditationStatus = "SELF_CERTIFIED";
          upgradeData.accreditationType = accreditationType;
        }
        // Upgrade onboardingStep if the new step is higher (never downgrade)
        const newOnboardingStep = ndaAccepted ? 5 : 1;
        if (
          user.investorProfile.onboardingStep == null ||
          newOnboardingStep > (user.investorProfile.onboardingStep as number)
        ) {
          upgradeData.onboardingStep = newOnboardingStep;
        }
        if (Object.keys(upgradeData).length > 0) {
          await prisma.investor.update({
            where: { id: user.investorProfile.id },
            data: upgradeData,
          });
        }
      }

      // Batch user field upgrades into a single update (role, name, password)
      // Each field is only set if not already present — never downgrades
      const userUpgradeData: Record<string, unknown> = {};
      if (!user.role) userUpgradeData.role = "LP";
      if (!user.name && name) userUpgradeData.name = name;
      if (!user.password && hashedPassword) userUpgradeData.password = hashedPassword;

      if (Object.keys(userUpgradeData).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: userUpgradeData,
        });
      }

      // Re-fetch to ensure investorProfile is loaded
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: { investorProfile: true },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          role: "LP",
          ...(hashedPassword ? { password: hashedPassword } : {}),
          investorProfile: {
            create: investorData as any,
          },
        },
        include: { investorProfile: true },
      });
    }

    // Associate investor with fund if fundId provided (from dataroom link)
    if (fundId && user?.investorProfile) {
      try {
        // Validate that the fund exists and is active before associating
        const fund = await prisma.fund.findUnique({
          where: { id: fundId },
          select: { id: true, teamId: true },
        });

        if (!fund) {
          // Invalid fundId — skip association silently, don't fail registration
          return NextResponse.json({
            success: true,
            message: "Account created successfully",
          });
        }

        // If teamId was provided, verify it matches the fund's team
        if (teamId && fund.teamId !== teamId) {
          return NextResponse.json({
            success: true,
            message: "Account created successfully",
          });
        }

        // Update investor's fundId
        await prisma.investor.update({
          where: { id: user.investorProfile.id },
          data: {
            fundId: fund.id,
            fundData: {
              ...(typeof user.investorProfile.fundData === "object" && user.investorProfile.fundData !== null
                ? user.investorProfile.fundData as Record<string, unknown>
                : {}),
              approvalStage: "APPLIED",
              approvalHistory: [{
                stage: "APPLIED",
                timestamp: new Date().toISOString(),
                note: "Auto-applied via onboarding from dataroom link",
              }],
            },
          },
        });

        // Create initial investment record linking investor to fund
        const existingInvestment = await prisma.investment.findFirst({
          where: {
            investorId: user.investorProfile.id,
            fundId,
          },
        });

        if (!existingInvestment) {
          await prisma.investment.create({
            data: {
              fundId,
              investorId: user.investorProfile.id,
              commitmentAmount: 0,
              fundedAmount: 0,
              status: "APPLIED",
            },
          });
        }
      } catch (fundErr) {
        // Non-blocking — log but don't fail registration
        reportError(fundErr as Error);
      }
    }

    // Fire-and-forget welcome email — never blocks the response
    // Use org-branded variant when fund context is available (LP arrived via invite/dataroom link)
    if (user) {
      if (fundId) {
        sendInvestorWelcomeEmailWithFund(user.id, fundId);
      } else {
        sendInvestorWelcomeEmail(user.id);
      }
    }

    // Generate one-time login token for immediate session creation.
    // This bypasses the credentials flow entirely, avoiding the bug where
    // existing users with a different password fail silent credential sign-in.
    let loginToken: string | null = null;
    if (user) {
      try {
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        await prisma.verificationToken.create({
          data: {
            identifier: `lp-onetime:${user.id}`,
            token,
            expires,
          },
        });
        loginToken = token;
      } catch (tokenErr) {
        // Non-blocking — if token generation fails, client can fall back to magic link
        reportError(tokenErr as Error);
      }
    }

    // Fire-and-forget: Send accreditation confirmed email when self-certified
    if (accreditationType && user?.investorProfile) {
      sendAccreditationConfirmedEmail({
        userId: user.id,
        investorId: user.investorProfile.id,
        accreditationType,
      }).catch((e) => reportError(e as Error));
    }

    // Fire-and-forget: Track LP registration
    publishServerEvent("funnel_lp_onboarding_started", {
      userId: user?.id,
      investorId: user?.investorProfile?.id,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: Auto-capture CRM contact from LP registration
    // Links Contact to InvestorProfile for unified GP CRM view
    if (user?.investorProfile) {
      try {
        const resolvedTeamId = teamId || (fundId ? (await prisma.fund.findUnique({ where: { id: fundId }, select: { teamId: true } }))?.teamId : undefined);
        if (resolvedTeamId) {
          const nameParts = name ? String(name).trim().split(/\s+/) : [];
          captureFromLPRegistration({
            email: normalizedEmail,
            firstName: nameParts[0],
            lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined,
            phone: phone || undefined,
            teamId: resolvedTeamId,
            investorId: user.investorProfile.id,
            fundId: fundId || undefined,
          }).catch((e) => reportError(e as Error));
        }
      } catch (crmErr) {
        // Non-blocking — CRM capture failure should never fail registration
        reportError(crmErr as Error);
      }
    }

    // SEC compliance: Audit log for LP registration
    if (user) {
      const forwarded = req.headers.get("x-forwarded-for");
      logAuditEvent({
        eventType: "USER_REGISTERED",
        userId: user.id,
        teamId: teamId || undefined,
        resourceType: "User",
        resourceId: user.id,
        metadata: {
          action: "LP_REGISTRATION",
          email: normalizedEmail,
          fundId: fundId || null,
          accreditationType: accreditationType || null,
          ndaAccepted: !!ndaAccepted,
        },
        ipAddress: forwarded?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      }).catch((e) => reportError(e as Error));
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully",
      ...(loginToken ? { loginToken } : {}),
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
