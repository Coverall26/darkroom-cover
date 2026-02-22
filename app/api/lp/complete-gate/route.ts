import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import AccreditationConfirmedEmail from "@/components/emails/accreditation-confirmed";
import { reportError } from "@/lib/error";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface CompleteGateBody {
  ndaAccepted: boolean;
  ndaSignature?: string;
  accreditationType?: string;
  confirmIncome?: boolean;
  confirmNetWorth?: boolean;
  confirmAccredited?: boolean;
  confirmRiskAware?: boolean;
  resendConfirmation?: boolean;
}

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json()) as CompleteGateBody;
    const {
      ndaAccepted,
      ndaSignature,
      accreditationType,
      confirmIncome,
      confirmNetWorth,
      confirmAccredited,
      confirmRiskAware,
      resendConfirmation,
    } = body;

    // Handle resend confirmation request
    if (resendConfirmation) {
      try {
        await sendEmail({
          to: auth.email,
          subject: "Accreditation Confirmation - FundRoom",
          react: AccreditationConfirmedEmail({
            investorName: auth.session.user.name || "Investor",
            email: auth.email,
            accreditationType: "Resent Confirmation",
            completedAt: new Date().toISOString(),
          }),
        });
        return NextResponse.json({
          success: true,
          message: "Confirmation resent",
        });
      } catch (emailError) {
        reportError(emailError as Error);
        console.error("Failed to resend confirmation:", emailError);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
    }

    if (!ndaAccepted) {
      return NextResponse.json(
        { error: "NDA acceptance is required" },
        { status: 400 },
      );
    }

    // Validate signature is present and within size limits (max 500KB base64)
    if (!ndaSignature || typeof ndaSignature !== "string") {
      return NextResponse.json(
        { error: "Signature is required" },
        { status: 400 },
      );
    }

    const maxSignatureSize = 500 * 1024; // 500KB
    if (ndaSignature.length > maxSignatureSize) {
      return NextResponse.json(
        { error: "Signature data exceeds maximum allowed size" },
        { status: 400 },
      );
    }

    // Validate signature is a valid data URL
    if (!ndaSignature.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Invalid signature format" },
        { status: 400 },
      );
    }

    if (!confirmAccredited || !confirmRiskAware) {
      return NextResponse.json(
        { error: "Accreditation confirmation is required" },
        { status: 400 },
      );
    }

    if (!confirmIncome && !confirmNetWorth) {
      return NextResponse.json(
        {
          error:
            "At least one accreditation criterion (income or net worth) must be selected",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { investorProfile: true },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const timestamp = new Date();

    const signedDocsData = user.investorProfile.signedDocs || [];
    // Create signature hash for integrity verification
    const signatureHash = crypto
      .createHash("sha256")
      .update(ndaSignature)
      .digest("hex");

    const ndaRecord = {
      type: "NDA",
      signedAt: timestamp.toISOString(),
      ipAddress,
      userAgent,
      signature: "captured",
      signatureHash,
      signatureData: ndaSignature,
    };

    const accreditationRecord = {
      type: "ACCREDITATION_ACK",
      signedAt: timestamp.toISOString(),
      accreditationType:
        accreditationType ||
        (confirmIncome && confirmNetWorth
          ? "INCOME_AND_NET_WORTH"
          : confirmIncome
            ? "INCOME"
            : "NET_WORTH"),
      criteria: {
        income: confirmIncome || false,
        netWorth: confirmNetWorth || false,
      },
      ipAddress,
      userAgent,
    };

    await prisma.$transaction([
      prisma.investor.update({
        where: { id: user.investorProfile.id },
        data: {
          ndaSigned: true,
          ndaSignedAt: timestamp,
          accreditationStatus: "SELF_CERTIFIED",
          accreditationType:
            accreditationType ||
            (confirmIncome && confirmNetWorth
              ? "INCOME_AND_NET_WORTH"
              : confirmIncome
                ? "INCOME"
                : "NET_WORTH"),
          signedDocs: [
            ...(signedDocsData as any[]),
            ndaRecord,
            accreditationRecord,
          ],
        },
      }),
      prisma.accreditationAck.create({
        data: {
          investorId: user.investorProfile.id,
          acknowledged: true,
          method: "SELF_CERTIFIED",
          accreditationType:
            accreditationType ||
            (confirmIncome && confirmNetWorth
              ? "INCOME_AND_NET_WORTH"
              : confirmIncome
                ? "INCOME"
                : "NET_WORTH"),
          accreditationDetails: {
            incomeQualification: confirmIncome || false,
            netWorthQualification: confirmNetWorth || false,
            incomeThreshold: "$200K individual / $300K joint",
            netWorthThreshold: "$1M excluding primary residence",
          },
          confirmAccredited: confirmAccredited || false,
          confirmRiskAware: confirmRiskAware || false,
          confirmDocReview: true,
          confirmRepresentations: true,
          ipAddress,
          userAgent,
          completedAt: timestamp,
          completedSteps: {
            step1_nda: {
              completed: true,
              timestamp: timestamp.toISOString(),
            },
            step2_accreditation: {
              completed: true,
              timestamp: timestamp.toISOString(),
            },
          },
        },
      }),
    ]);

    // Send confirmation email
    const finalAccreditationType =
      accreditationType ||
      (confirmIncome && confirmNetWorth
        ? "INCOME_AND_NET_WORTH"
        : confirmIncome
          ? "INCOME"
          : "NET_WORTH");

    try {
      await sendEmail({
        to: auth.email,
        subject: "Accreditation Confirmed - FundRoom",
        react: AccreditationConfirmedEmail({
          investorName: auth.session.user.name || "Investor",
          email: auth.email,
          accreditationType: finalAccreditationType,
          completedAt: timestamp.toISOString(),
        }),
      });
    } catch (emailError) {
      reportError(emailError as Error);
      console.error("Failed to send confirmation email:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "Verification completed successfully",
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Complete gate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
