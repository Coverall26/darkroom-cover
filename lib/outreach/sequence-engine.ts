/**
 * Outreach Sequence Engine — Enrollment management and step execution.
 *
 * Sequences are multi-step automated outreach campaigns.
 * Each step has a delay (in days) and either a template or an AI prompt.
 * Enrollment tracks where each contact is in the sequence.
 *
 * The cron job at /api/cron/sequences picks up enrollments where
 * nextStepAt <= now and status === "ACTIVE", then executes the step.
 */

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { sendOutreachEmail } from "@/lib/outreach/send-email";
import { createChatCompletion } from "@/lib/openai";
import {
  buildEmailDraftPrompt,
  type ContactContext,
  type SenderContext,
  type EmailPurpose,
} from "@/lib/ai/crm-prompts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrollContactParams {
  contactId: string;
  sequenceId: string;
  orgId: string;
}

export interface StepResult {
  enrollmentId: string;
  contactId: string;
  stepOrder: number;
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Enroll a contact in a sequence
// ---------------------------------------------------------------------------

export async function enrollContact(
  params: EnrollContactParams,
): Promise<{ enrollmentId: string; nextStepAt: Date }> {
  const { contactId, sequenceId, orgId } = params;

  // Verify sequence exists and is active
  const sequence = await prisma.outreachSequence.findFirst({
    where: { id: sequenceId, orgId, isActive: true },
    include: { steps: { orderBy: { stepOrder: "asc" }, take: 1 } },
  });

  if (!sequence) {
    throw new Error("Sequence not found or inactive");
  }

  if (sequence.steps.length === 0) {
    throw new Error("Sequence has no steps");
  }

  // Calculate first step execution time
  const firstStep = sequence.steps[0];
  const nextStepAt = new Date();
  nextStepAt.setDate(nextStepAt.getDate() + firstStep.delayDays);

  // Create enrollment (upsert to handle re-enrollment)
  const enrollment = await prisma.sequenceEnrollment.upsert({
    where: {
      contactId_sequenceId: { contactId, sequenceId },
    },
    update: {
      currentStep: 0,
      status: "ACTIVE",
      nextStepAt,
      pausedReason: null,
    },
    create: {
      orgId,
      contactId,
      sequenceId,
      currentStep: 0,
      status: "ACTIVE",
      nextStepAt,
    },
  });

  // Log activity
  await prisma.contactActivity.create({
    data: {
      contactId,
      type: "STATUS_CHANGE",
      description: `Enrolled in sequence: ${sequence.name}`,
      metadata: {
        action: "sequence_enrolled",
        sequenceId,
        sequenceName: sequence.name,
      },
    },
  });

  return { enrollmentId: enrollment.id, nextStepAt };
}

// ---------------------------------------------------------------------------
// Unenroll a contact from a sequence
// ---------------------------------------------------------------------------

export async function unenrollContact(
  contactId: string,
  sequenceId: string,
  reason: string = "manually_cancelled",
): Promise<void> {
  await prisma.sequenceEnrollment.updateMany({
    where: { contactId, sequenceId, status: "ACTIVE" },
    data: {
      status: "CANCELLED",
      pausedReason: reason,
      nextStepAt: null,
    },
  });

  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
    select: { name: true },
  });

  await prisma.contactActivity.create({
    data: {
      contactId,
      type: "STATUS_CHANGE",
      description: `Unenrolled from sequence: ${sequence?.name ?? sequenceId}`,
      metadata: {
        action: "sequence_unenrolled",
        sequenceId,
        reason,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

export async function pauseEnrollment(
  enrollmentId: string,
  reason?: string,
): Promise<void> {
  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "PAUSED",
      pausedReason: reason ?? "paused_by_user",
      nextStepAt: null,
    },
  });
}

export async function resumeEnrollment(
  enrollmentId: string,
): Promise<void> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: {
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
  });

  if (!enrollment || enrollment.status !== "PAUSED") {
    throw new Error("Enrollment not found or not paused");
  }

  const currentStepDef = enrollment.sequence.steps[enrollment.currentStep];
  if (!currentStepDef) {
    // No more steps — complete
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", nextStepAt: null },
    });
    return;
  }

  const nextStepAt = new Date();
  nextStepAt.setDate(nextStepAt.getDate() + currentStepDef.delayDays);

  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "ACTIVE",
      pausedReason: null,
      nextStepAt,
    },
  });
}

// ---------------------------------------------------------------------------
// Execute a single step for an enrollment
// ---------------------------------------------------------------------------

export async function executeStep(
  enrollmentId: string,
): Promise<StepResult> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: {
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
          org: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!enrollment || enrollment.status !== "ACTIVE") {
    return {
      enrollmentId,
      contactId: enrollment?.contactId ?? "",
      stepOrder: enrollment?.currentStep ?? -1,
      status: "skipped",
      reason: "Enrollment not active",
    };
  }

  const step = enrollment.sequence.steps[enrollment.currentStep];
  if (!step) {
    // Sequence complete
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", nextStepAt: null },
    });
    return {
      enrollmentId,
      contactId: enrollment.contactId,
      stepOrder: enrollment.currentStep,
      status: "skipped",
      reason: "No more steps — sequence complete",
    };
  }

  // Load contact
  const contact = await prisma.contact.findUnique({
    where: { id: enrollment.contactId },
    include: {
      contactActivities: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { type: true, description: true, createdAt: true },
      },
    },
  });

  if (!contact) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "CANCELLED", pausedReason: "contact_deleted", nextStepAt: null },
    });
    return {
      enrollmentId,
      contactId: enrollment.contactId,
      stepOrder: enrollment.currentStep,
      status: "skipped",
      reason: "Contact not found",
    };
  }

  // Check if contact unsubscribed or bounced
  if (contact.unsubscribedAt || contact.emailBounced) {
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "CANCELLED",
        pausedReason: contact.unsubscribedAt ? "unsubscribed" : "bounced",
        nextStepAt: null,
      },
    });
    return {
      enrollmentId,
      contactId: contact.id,
      stepOrder: enrollment.currentStep,
      status: "skipped",
      reason: contact.unsubscribedAt ? "Contact unsubscribed" : "Email bounced",
    };
  }

  // Check step condition
  const conditionMet = await checkStepCondition(
    step.condition,
    contact.id,
    enrollment.currentStep,
  );
  if (!conditionMet) {
    // Skip this step, advance to next
    return await advanceToNextStep(enrollment, step);
  }

  // Generate email content
  let subject: string;
  let body: string;

  if (step.templateId) {
    // Use template
    const template = await prisma.emailTemplate.findUnique({
      where: { id: step.templateId },
    });
    if (!template) {
      return {
        enrollmentId,
        contactId: contact.id,
        stepOrder: enrollment.currentStep,
        status: "failed",
        reason: "Template not found",
      };
    }
    subject = template.subject;
    body = template.body;
  } else if (step.aiPrompt) {
    // Use AI to generate
    try {
      const contactCtx: ContactContext = {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        title: contact.title,
        status: contact.status,
        engagementScore: contact.engagementScore,
        lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
        lastEngagedAt: contact.lastEngagedAt?.toISOString() ?? null,
        recentActivities: (contact.contactActivities ?? []).map((a: { type: string; description: string | null; createdAt: Date }) => ({
          type: a.type,
          description: a.description ?? "",
          createdAt: a.createdAt.toISOString(),
        })),
      };

      const senderCtx: SenderContext = {
        name: null, // cron has no user context
        company: enrollment.sequence.org.name,
        fundName: null,
      };

      const prompt = buildEmailDraftPrompt(
        contactCtx,
        senderCtx,
        "follow_up" as EmailPurpose,
        step.aiPrompt,
      );

      const completion = await createChatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const draft = JSON.parse(raw);
      subject = draft.subject;
      body = draft.body;
    } catch (err) {
      reportError(err as Error);
      return {
        enrollmentId,
        contactId: contact.id,
        stepOrder: enrollment.currentStep,
        status: "failed",
        reason: "AI generation failed",
      };
    }
  } else {
    return {
      enrollmentId,
      contactId: contact.id,
      stepOrder: enrollment.currentStep,
      status: "failed",
      reason: "Step has no template or AI prompt",
    };
  }

  // Send the email
  try {
    // Resolve the team from the org to send via outreach
    const orgTeam = await prisma.team.findFirst({
      where: { organizationId: enrollment.sequence.org.id },
      select: { id: true },
    });

    if (!orgTeam) {
      return {
        enrollmentId,
        contactId: contact.id,
        stepOrder: enrollment.currentStep,
        status: "failed",
        reason: "No team found for org",
      };
    }

    await sendOutreachEmail({
      contactId: contact.id,
      teamId: orgTeam.id,
      subject,
      body,
      actorId: "system-cron", // cron-initiated (no user actor)
      trackOpens: true,
    });
  } catch (err) {
    reportError(err as Error);
    return {
      enrollmentId,
      contactId: contact.id,
      stepOrder: enrollment.currentStep,
      status: "failed",
      reason: "Email send failed",
    };
  }

  // Advance to next step
  return await advanceToNextStep(enrollment, step);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function advanceToNextStep(
  enrollment: {
    id: string;
    contactId: string;
    currentStep: number;
    sequence: { steps: Array<{ stepOrder: number; delayDays: number }> };
  },
  currentStep: { stepOrder: number },
): Promise<StepResult> {
  const nextStepIndex = enrollment.currentStep + 1;
  const nextStepDef = enrollment.sequence.steps[nextStepIndex];

  if (!nextStepDef) {
    // Sequence complete
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: nextStepIndex,
        status: "COMPLETED",
        nextStepAt: null,
      },
    });
  } else {
    const nextStepAt = new Date();
    nextStepAt.setDate(nextStepAt.getDate() + nextStepDef.delayDays);

    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: nextStepIndex,
        nextStepAt,
      },
    });
  }

  return {
    enrollmentId: enrollment.id,
    contactId: enrollment.contactId,
    stepOrder: currentStep.stepOrder,
    status: "sent",
  };
}

async function checkStepCondition(
  condition: string,
  contactId: string,
  currentStep: number,
): Promise<boolean> {
  if (condition === "ALWAYS") return true;

  // Look at last outreach email activity for this contact
  const lastEmail = await prisma.contactActivity.findFirst({
    where: {
      contactId,
      type: "EMAIL_SENT",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lastEmail) return true; // No prior email — always send

  const emailId = (lastEmail.metadata as Record<string, unknown>)?.emailId as
    | string
    | undefined;

  switch (condition) {
    case "IF_NO_REPLY": {
      // Check if there's a REPLY activity after the email
      const reply = await prisma.contactActivity.findFirst({
        where: {
          contactId,
          type: "EMAIL_REPLIED",
          createdAt: { gt: lastEmail.createdAt },
        },
      });
      return !reply; // Send only if no reply
    }

    case "IF_NOT_OPENED": {
      if (!emailId) return true;
      const open = await prisma.contactActivity.findFirst({
        where: {
          contactId,
          type: "EMAIL_OPENED",
          metadata: { path: ["emailId"], equals: emailId },
        },
      });
      return !open; // Send only if not opened
    }

    case "IF_NOT_CLICKED": {
      if (!emailId) return true;
      const click = await prisma.contactActivity.findFirst({
        where: {
          contactId,
          type: "LINK_CLICKED",
          createdAt: { gt: lastEmail.createdAt },
        },
      });
      return !click; // Send only if no click
    }

    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Batch processor for cron job
// ---------------------------------------------------------------------------

/**
 * Process all due sequence enrollments.
 * Called by the cron job at /api/cron/sequences.
 * Returns summary of results.
 */
export async function processDueEnrollments(batchSize: number = 50): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  results: StepResult[];
}> {
  const now = new Date();

  // Find all enrollments that are due
  const dueEnrollments = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextStepAt: { lte: now },
    },
    take: batchSize,
    orderBy: { nextStepAt: "asc" },
    select: { id: true },
  });

  const results: StepResult[] = [];

  for (const enrollment of dueEnrollments) {
    try {
      const result = await executeStep(enrollment.id);
      results.push(result);
    } catch (err) {
      reportError(err as Error);
      results.push({
        enrollmentId: enrollment.id,
        contactId: "",
        stepOrder: -1,
        status: "failed",
        reason: "Unexpected error",
      });
    }
  }

  return {
    processed: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
