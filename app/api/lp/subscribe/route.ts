import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { putFileServer } from "@/lib/files/put-file-server";
import { newId } from "@/lib/id-helper";
import { logSubscriptionEvent } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";
import { executePurchase } from "@/lib/funds/tranche-service";
import { appRouterStrictRateLimit } from "@/lib/security/rate-limiter";
import { sendGpCommitmentNotification } from "@/lib/emails/send-gp-commitment-notification";
import { sendLpCommitmentConfirmation } from "@/lib/emails/send-lp-commitment-confirmation";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";
import { emitSSE, SSE_EVENTS } from "@/lib/sse/event-emitter";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/subscribe
 * Creates a subscription for an LP investor in a fund.
 * Generates a PDF subscription agreement, creates the subscription record,
 * and updates investor/fund status atomically.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const { fundId, units, amount, tierId, representations } = await req.json();

    if (!fundId || !amount) {
      return NextResponse.json(
        { error: "Fund ID and amount are required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        investorProfile: {
          include: {
            fund: true,
          },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 403 },
      );
    }

    const investor = user.investorProfile;

    // --- Defensive auto-heal: check OnboardingFlow for NDA/accreditation completion ---
    let ndaOk = !!investor.ndaSigned;
    let accreditationOk =
      investor.accreditationStatus === "SELF_CERTIFIED" ||
      investor.accreditationStatus === "KYC_VERIFIED";

    if (!ndaOk || !accreditationOk) {
      const onboardingStepSufficient = investor.onboardingStep != null && investor.onboardingStep >= 6;

      let flowStepsCompleted: Record<string, boolean> | null = null;
      try {
        const flow = await prisma.onboardingFlow.findFirst({
          where: { investorId: investor.id },
          orderBy: { startedAt: "desc" },
          select: { stepsCompleted: true, currentStep: true },
        });
        if (flow?.stepsCompleted && typeof flow.stepsCompleted === "object") {
          flowStepsCompleted = flow.stepsCompleted as Record<string, boolean>;
        }
      } catch {
        // Non-blocking
      }

      const flowAgreementDone = flowStepsCompleted?.agreement === true;
      const flowAccreditationDone = flowStepsCompleted?.accreditation === true;

      if (!ndaOk && (onboardingStepSufficient || flowAgreementDone)) {
        try {
          await prisma.investor.update({
            where: { id: investor.id },
            data: { ndaSigned: true, ndaSignedAt: new Date() },
          });
          ndaOk = true;
        } catch {
          // If update fails, continue with original check
        }
      }

      if (!accreditationOk && (onboardingStepSufficient || flowAccreditationDone)) {
        try {
          await prisma.investor.update({
            where: { id: investor.id },
            data: { accreditationStatus: "SELF_CERTIFIED" },
          });
          accreditationOk = true;
        } catch {
          // If update fails, continue with original check
        }
      }
    }

    if (!ndaOk) {
      return NextResponse.json(
        { error: "NDA must be signed before committing. Please complete the NDA agreement step." },
        { status: 403 },
      );
    }

    if (!accreditationOk) {
      return NextResponse.json(
        { error: "Accreditation must be confirmed before committing. Please complete the accreditation step." },
        { status: 403 },
      );
    }

    // SEC 506(c): Check accreditation expiry for third-party verified investors
    if (
      investor.accreditationExpiresAt &&
      new Date(investor.accreditationExpiresAt) < new Date()
    ) {
      return NextResponse.json(
        { error: "Your accreditation has expired. Please re-verify your accreditation status to continue." },
        { status: 403 },
      );
    }

    if (investor.fundId && investor.fundId !== fundId) {
      return NextResponse.json(
        { error: "You can only subscribe to your associated fund" },
        { status: 403 },
      );
    }

    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: {
        pricingTiers: {
          where: { isActive: true },
          orderBy: { tranche: "asc" },
        },
        team: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const numAmount = parseFloat(amount);
    const numUnits = units ? parseInt(units, 10) : null;

    if (isNaN(numAmount) || numAmount <= 0 || numAmount > 100_000_000_000) {
      return NextResponse.json(
        { error: "Invalid subscription amount" },
        { status: 400 },
      );
    }

    // Prevent representations DoS (limit key count)
    if (representations && typeof representations === "object") {
      const repKeys = Object.keys(representations);
      if (repKeys.length > 20) {
        return NextResponse.json(
          { error: "Too many representation fields" },
          { status: 400 },
        );
      }
    }

    if (!fund.flatModeEnabled && (numUnits === null || isNaN(numUnits) || numUnits < 1)) {
      return NextResponse.json(
        { error: "Invalid unit count for tiered subscription" },
        { status: 400 },
      );
    }

    if (numAmount < parseFloat(fund.minimumInvestment.toString())) {
      return NextResponse.json(
        { error: `Minimum investment is $${parseFloat(fund.minimumInvestment.toString()).toLocaleString()}` },
        { status: 400 },
      );
    }

    let selectedTier = null;
    let tierAllocations: { tierId: string; tranche: number; units: number; pricePerUnit: number; subtotal: number }[] = [];
    let computedAmount = numAmount;

    if (!fund.flatModeEnabled && numUnits) {
      const activeTier = fund.pricingTiers[0] || null;

      if (!activeTier) {
        return NextResponse.json(
          { error: "No active pricing tier — fund may be fully subscribed" },
          { status: 400 },
        );
      }

      if (numUnits > activeTier.unitsAvailable) {
        return NextResponse.json(
          {
            error: `Only ${activeTier.unitsAvailable} units available in current tranche (${activeTier.name || "Tranche " + activeTier.tranche}) at $${parseFloat(activeTier.pricePerUnit.toString()).toLocaleString()} per unit`,
            maxUnits: activeTier.unitsAvailable,
            pricePerUnit: parseFloat(activeTier.pricePerUnit.toString()),
          },
          { status: 400 },
        );
      }

      const pricePerUnit = parseFloat(activeTier.pricePerUnit.toString());
      const expectedAmount = numUnits * pricePerUnit;

      tierAllocations = [
        {
          tierId: activeTier.id,
          tranche: activeTier.tranche,
          units: numUnits,
          pricePerUnit,
          subtotal: expectedAmount,
        },
      ];

      computedAmount = expectedAmount;
      selectedTier = activeTier;

      const tolerance = 0.01;
      if (Math.abs(computedAmount - numAmount) > tolerance) {
        return NextResponse.json(
          {
            error: `Amount mismatch: expected $${computedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${numUnits} units`,
            expectedAmount: computedAmount,
          },
          { status: 400 },
        );
      }
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { height } = page.getSize();
    let y = height - 60;

    page.drawText("SUBSCRIPTION AGREEMENT", {
      x: 50, y, size: 18, font: boldFont, color: rgb(0, 0, 0),
    });
    y -= 40;

    page.drawText(fund.name, {
      x: 50, y, size: 14, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    y -= 30;

    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 40;

    const finalAmount = fund.flatModeEnabled ? numAmount : computedAmount;
    const details = [
      ["Subscriber:", investor.entityName || user.name || "Individual Investor"],
      ["Email:", user.email || ""],
      ["Subscription Amount:", `$${finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ];

    if (numUnits && tierAllocations.length > 0) {
      details.push(
        ["Number of Units:", numUnits.toLocaleString()],
        ["Price per Unit:", `$${tierAllocations[0].pricePerUnit.toLocaleString()}`],
        ["Pricing Tranche:", tierAllocations[0].tranche.toString()],
      );
    }

    for (const [label, value] of details) {
      page.drawText(label, { x: 50, y, size: 11, font: boldFont });
      page.drawText(value, { x: 180, y, size: 11, font });
      y -= 20;
    }

    y -= 20;
    page.drawText("TERMS AND CONDITIONS", { x: 50, y, size: 12, font: boldFont });
    y -= 20;

    const terms = [
      "1. The undersigned hereby subscribes for the investment amount specified above.",
      "2. The subscriber represents that they are an accredited investor as defined by SEC Rule 501.",
      "3. The subscriber acknowledges receipt of offering materials and has had the opportunity",
      "   to ask questions about the investment.",
      "4. This subscription is irrevocable and binding upon execution.",
      "5. The fund reserves the right to accept or reject this subscription in whole or in part.",
    ];

    for (const term of terms) {
      page.drawText(term, { x: 50, y, size: 10, font });
      y -= 16;
    }

    y -= 30;
    page.drawText("SIGNATURE", { x: 50, y, size: 12, font: boldFont });
    y -= 30;
    page.drawLine({ start: { x: 50, y }, end: { x: 300, y }, thickness: 1, color: rgb(0, 0, 0) });
    y -= 15;
    page.drawText("Subscriber Signature", { x: 50, y, size: 9, font });
    y -= 30;
    page.drawLine({ start: { x: 50, y }, end: { x: 300, y }, thickness: 1, color: rgb(0, 0, 0) });
    y -= 15;
    page.drawText("Date", { x: 50, y, size: 9, font });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const signingToken = randomBytes(32).toString("hex");
    const docId = newId("doc");

    const { type: storageType, data: filePath } = await putFileServer({
      file: {
        name: `subscription-agreement-${docId}.pdf`,
        type: "application/pdf",
        buffer: pdfBuffer,
      },
      teamId: fund.teamId,
      docId,
    });

    if (!filePath) {
      throw new Error("Failed to upload subscription document");
    }

    const result = await prisma.$transaction(async (tx) => {
      // Execute purchase: decrement units, auto-advance tranche if sold out
      if (tierAllocations.length > 0 && numUnits && selectedTier) {
        const allocation = tierAllocations[0];

        const tier = await tx.fundPricingTier.findUnique({
          where: { id: allocation.tierId },
        });

        if (!tier || tier.unitsAvailable < allocation.units) {
          throw new Error(
            `Tranche ${allocation.tranche} no longer has ${allocation.units} units available`,
          );
        }

        await executePurchase(tx, fund.id, allocation.tierId, allocation.units);
      }

      const docAmount = fund.flatModeEnabled ? numAmount : computedAmount;
      const document = await tx.signatureDocument.create({
        data: {
          title: `Subscription Agreement - ${investor.entityName || user.name || "Investor"}`,
          description: `Subscription for ${fund.name}: $${docAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          file: filePath,
          storageType: storageType || "S3_PATH",
          status: "SENT",
          sentAt: new Date(),
          documentType: "SUBSCRIPTION",
          subscriptionAmount: docAmount,
          investorId: investor.id,
          metadata: {
            fundId: fund.id,
            units: numUnits,
            tierBreakdown: tierAllocations.length > 0 ? tierAllocations : undefined,
            autoGenerated: true,
          },
          teamId: fund.teamId,
          createdById: user.id,
          recipients: {
            create: {
              name: investor.entityName || user.name || "Investor",
              email: user.email || "",
              role: "SIGNER",
              signingOrder: 1,
              status: "PENDING",
              signingToken,
            },
          },
        },
        include: { recipients: true },
      });

      const subscriptionAmount = fund.flatModeEnabled ? numAmount : computedAmount;
      const subscription = await tx.subscription.create({
        data: {
          investorId: investor.id,
          fundId: fund.id,
          signatureDocumentId: document.id,
          amount: subscriptionAmount,
          units: numUnits,
          pricingTierId: selectedTier?.id,
          status: "PENDING",
          tierBreakdown: tierAllocations.length > 0 ? (tierAllocations as any) : undefined,
        },
      });

      const existingInvestment = await tx.investment.findFirst({
        where: { investorId: investor.id, fundId: fund.id },
      });

      let investment;
      if (existingInvestment) {
        investment = await tx.investment.update({
          where: { id: existingInvestment.id },
          data: {
            commitmentAmount: subscriptionAmount,
            status: "COMMITTED",
            subscriptionDate: new Date(),
          },
        });
      } else {
        investment = await tx.investment.create({
          data: {
            fundId: fund.id,
            investorId: investor.id,
            commitmentAmount: subscriptionAmount,
            fundedAmount: 0,
            status: "COMMITTED",
            subscriptionDate: new Date(),
          },
        });
      }

      const existingFundData =
        typeof investor.fundData === "object" && investor.fundData !== null
          ? (investor.fundData as Record<string, unknown>)
          : {};
      const existingHistory =
        (existingFundData.approvalHistory as unknown[]) || [];

      await tx.investor.update({
        where: { id: investor.id },
        data: {
          ...(investor.fundId ? {} : { fundId: fund.id }),
          onboardingStep: 7,
          fundData: {
            ...existingFundData,
            approvalStage: "COMMITTED",
            approvalHistory: [
              ...existingHistory,
              {
                stage: "COMMITTED",
                timestamp: new Date().toISOString(),
                note: `Subscribed for $${subscriptionAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              },
            ],
            ...(representations && typeof representations === "object"
              ? { representations }
              : {}),
          },
        },
      });

      // Sync FundAggregate.totalCommitted
      const commitAgg = await tx.investment.aggregate({
        where: {
          fundId: fund.id,
          status: { notIn: ["CANCELLED", "DECLINED", "WITHDRAWN"] },
        },
        _sum: { commitmentAmount: true },
      });
      const totalCommittedNow = Number(commitAgg._sum.commitmentAmount ?? 0);

      await tx.fundAggregate.upsert({
        where: { fundId: fund.id },
        create: { fundId: fund.id, totalCommitted: totalCommittedNow },
        update: { totalCommitted: totalCommittedNow },
      });

      return { document, subscription, signingToken, subscriptionAmount, investment };
    });

    await logSubscriptionEvent(req, {
      eventType: "SUBSCRIPTION_CREATED",
      userId: user.id,
      teamId: fund.teamId,
      subscriptionId: result.subscription.id,
      investorId: investor.id,
      fundId: fund.id,
      amount: result.subscriptionAmount,
    });

    // Fire-and-forget: notify GP team admins of new commitment
    sendGpCommitmentNotification({
      fundId: fund.id,
      investorId: investor.id,
      commitmentAmount: result.subscriptionAmount,
      units: numUnits,
      pricePerUnit: tierAllocations.length > 0 ? tierAllocations[0].pricePerUnit : null,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: Track LP commitment
    publishServerEvent("funnel_lp_commitment_made", {
      userId: user.id,
      investorId: investor.id,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: Send LP commitment confirmation email
    sendLpCommitmentConfirmation({
      userId: user.id,
      investorId: investor.id,
      fundId: fund.id,
      amount: result.subscriptionAmount,
      units: numUnits,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: SSE for real-time GP dashboard update
    emitSSE(SSE_EVENTS.INVESTOR_COMMITTED, {
      orgId: fund.teamId,
      data: {
        investorId: investor.id,
        amount: result.subscriptionAmount,
        fundId: fund.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        signingUrl: `/view/sign/${result.signingToken}`,
        investment: {
          id: result.investment.id,
          amount: result.subscriptionAmount,
          units: numUnits,
          status: result.investment.status,
        },
        subscription: {
          id: result.subscription.id,
          amount: result.subscriptionAmount,
          units: numUnits,
          status: "PENDING",
          tranche: tierAllocations.length > 0 ? {
            number: tierAllocations[0].tranche,
            pricePerUnit: tierAllocations[0].pricePerUnit,
          } : undefined,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
