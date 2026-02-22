import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

function determineCurrentStep(steps: any): string {
  if (!steps.ndaSigned.completed) return "NDA";
  if (!steps.accreditationCompleted.completed) return "ACCREDITATION";
  if (!steps.kycVerified.completed) return "KYC";
  if (!steps.bankLinked.completed) return "BANK_LINK";
  if (!steps.subscribed.completed) return "SUBSCRIPTION";
  return "COMPLETE";
}

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: {
      investorProfile: {
        include: {
          accreditationAcks: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          investments: true,
          bankLinks: { where: { status: "ACTIVE" } },
          documents: {
            where: { documentType: "SUBSCRIPTION_AGREEMENT" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!user?.investorProfile) {
    return NextResponse.json(
      { error: "Investor profile not found" },
      { status: 404 },
    );
  }

  const investor = user.investorProfile;
  const accreditationAck = investor.accreditationAcks[0];

  const steps = {
    accountCreated: {
      completed: true,
      completedAt: user.createdAt,
    },
    ndaSigned: {
      completed: investor.ndaSigned,
      completedAt: investor.ndaSignedAt,
      required: true,
    },
    accreditationStarted: {
      completed: !!accreditationAck,
      completedAt: accreditationAck?.startedAt,
    },
    accreditationCompleted: {
      completed: accreditationAck?.completedAt != null,
      completedAt: accreditationAck?.completedAt,
      details: accreditationAck
        ? {
            method: accreditationAck.method,
            type: accreditationAck.accreditationType,
            confirmAccredited: accreditationAck.confirmAccredited,
            confirmRiskAware: accreditationAck.confirmRiskAware,
            confirmDocReview: accreditationAck.confirmDocReview,
            confirmRepresentations: accreditationAck.confirmRepresentations,
          }
        : null,
    },
    kycVerified: {
      completed: investor.personaStatus === "APPROVED",
      completedAt: investor.personaVerifiedAt,
      status: investor.personaStatus,
      required: true,
    },
    bankLinked: {
      completed: investor.bankLinks.length > 0,
      count: investor.bankLinks.length,
    },
    subscribed: {
      completed: investor.investments.length > 0,
      count: investor.investments.length,
    },
    documentsSigned: {
      completed: investor.documents.length > 0,
      count: investor.documents.length,
      latestSignedAt: investor.documents[0]?.signedAt,
    },
  };

  const completedSteps = Object.values(steps).filter(
    (s: any) => s.completed,
  ).length;
  const totalSteps = Object.keys(steps).length;
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

  const currentStep = determineCurrentStep(steps);

  return NextResponse.json({
    steps,
    progress: {
      completed: completedSteps,
      total: totalSteps,
      percentage: progressPercentage,
    },
    currentStep,
    onboardingStatus: investor.onboardingCompletedAt
      ? "COMPLETE"
      : "IN_PROGRESS",
    onboardingCompletedAt: investor.onboardingCompletedAt,
  });
}

export async function PUT(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const authPut = await requireLPAuthAppRouter();
  if (authPut instanceof NextResponse) return authPut;

  const user = await prisma.user.findUnique({
    where: { id: authPut.userId },
    include: {
      investorProfile: {
        include: {
          accreditationAcks: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!user?.investorProfile) {
    return NextResponse.json(
      { error: "Investor profile not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const { step, data } = body;

  if (!step) {
    return NextResponse.json({ error: "Step is required" }, { status: 400 });
  }

  const allowedSteps = [
    "ACCREDITATION_CHECKPOINT",
    "ONBOARDING_STEP",
    "COMPLETE_ONBOARDING",
  ];
  if (!allowedSteps.includes(step)) {
    return NextResponse.json(
      { error: "Invalid step type" },
      { status: 400 },
    );
  }

  const investor = user.investorProfile;

  try {
    switch (step) {
      case "ACCREDITATION_CHECKPOINT":
        if (!data?.completedSteps || !Array.isArray(data.completedSteps)) {
          return NextResponse.json(
            { error: "completedSteps array required" },
            { status: 400 },
          );
        }
        if (investor.accreditationAcks[0]) {
          await prisma.accreditationAck.update({
            where: { id: investor.accreditationAcks[0].id },
            data: {
              completedSteps: data.completedSteps,
            },
          });
        }
        break;

      case "ONBOARDING_STEP":
        if (
          typeof data?.step !== "number" ||
          data.step < 0 ||
          data.step > 10
        ) {
          return NextResponse.json(
            { error: "Valid step number required (0-10)" },
            { status: 400 },
          );
        }
        await prisma.investor.update({
          where: { id: investor.id },
          data: { onboardingStep: data.step },
        });
        break;

      case "COMPLETE_ONBOARDING":
        if (!investor.ndaSigned) {
          return NextResponse.json(
            { error: "NDA must be signed first" },
            { status: 400 },
          );
        }
        if (investor.accreditationStatus === "PENDING") {
          return NextResponse.json(
            { error: "Accreditation must be completed first" },
            { status: 400 },
          );
        }
        if (investor.personaStatus !== "APPROVED") {
          return NextResponse.json(
            { error: "KYC verification must be approved first" },
            { status: 400 },
          );
        }
        await prisma.investor.update({
          where: { id: investor.id },
          data: { onboardingCompletedAt: new Date() },
        });
        break;

      default:
        return NextResponse.json(
          { error: "Unknown step type" },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating wizard progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
