/**
 * LP Onboarding Flow API (App Router)
 *
 * GET /api/lp/onboarding-flow?fundId=xxx
 *   Returns saved onboarding flow state for resume.
 *
 * PUT /api/lp/onboarding-flow
 *   Saves onboarding flow state (auto-save after each step).
 *
 * DELETE /api/lp/onboarding-flow?fundId=xxx
 *   Clears onboarding flow state on final submission.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    if (!auth.investorId) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    if (!fundId) {
      return NextResponse.json(
        { error: "fundId query parameter required" },
        { status: 400 },
      );
    }

    const flow = await prisma.onboardingFlow.findUnique({
      where: {
        investorId_fundId: {
          investorId: auth.investorId,
          fundId,
        },
      },
    });

    if (!flow || flow.status === "COMPLETED") {
      return NextResponse.json({ flow: null });
    }

    return NextResponse.json({
      flow: {
        id: flow.id,
        currentStep: flow.currentStep,
        totalSteps: flow.totalSteps,
        status: flow.status,
        stepsCompleted: flow.stepsCompleted,
        formData: flow.formData,
        lastActiveAt: flow.lastActiveAt,
      },
    });
  } catch (error) {
    reportError(error, {
      path: "/api/lp/onboarding-flow",
      action: "get",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const authPut = await requireLPAuthAppRouter();
  if (authPut instanceof NextResponse) return authPut;

  try {
    if (!authPut.investorId) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const { fundId, currentStep, formData, stepsCompleted } = body;

    if (!fundId) {
      return NextResponse.json(
        { error: "fundId is required" },
        { status: 400 },
      );
    }

    if (
      typeof currentStep !== "number" ||
      currentStep < 0 ||
      currentStep > 10
    ) {
      return NextResponse.json(
        { error: "Invalid currentStep" },
        { status: 400 },
      );
    }

    // Verify fund exists
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { id: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const flow = await prisma.onboardingFlow.upsert({
      where: {
        investorId_fundId: {
          investorId: authPut.investorId!,
          fundId,
        },
      },
      update: {
        currentStep,
        formData: formData || undefined,
        stepsCompleted: stepsCompleted || undefined,
        lastActiveAt: new Date(),
        status: "IN_PROGRESS",
      },
      create: {
        investorId: authPut.investorId!,
        fundId,
        currentStep,
        totalSteps: 8,
        formData: formData || undefined,
        stepsCompleted: stepsCompleted || undefined,
        status: "IN_PROGRESS",
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({
      success: true,
      flow: {
        id: flow.id,
        currentStep: flow.currentStep,
        lastActiveAt: flow.lastActiveAt,
      },
    });
  } catch (error) {
    reportError(error, {
      path: "/api/lp/onboarding-flow",
      action: "put",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const authDel = await requireLPAuthAppRouter();
  if (authDel instanceof NextResponse) return authDel;

  try {
    if (!authDel.investorId) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    if (!fundId) {
      return NextResponse.json(
        { error: "fundId query parameter required" },
        { status: 400 },
      );
    }

    await prisma.onboardingFlow.updateMany({
      where: {
        investorId: authDel.investorId!,
        fundId,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error, {
      path: "/api/lp/onboarding-flow",
      action: "delete",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
