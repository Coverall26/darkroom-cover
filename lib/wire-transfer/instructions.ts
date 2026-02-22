import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import type {
  SetWireInstructionsInput,
  WireInstructions,
  WireInstructionsPublic,
} from "./types";

// ============================================================================
// GP Wire Instructions Configuration
// ============================================================================

/**
 * Set or update wire instructions for a fund.
 * Only GP ADMIN/OWNER should call this.
 */
export async function setWireInstructions(
  fundId: string,
  input: SetWireInstructionsInput,
  userId: string,
) {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { id: true, teamId: true },
  });

  if (!fund) {
    throw new Error(`Fund not found: ${fundId}`);
  }

  const wireInstructions: WireInstructions = {
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    swiftCode: input.swiftCode,
    beneficiaryName: input.beneficiaryName,
    beneficiaryAddress: input.beneficiaryAddress,
    reference: input.reference,
    notes: input.notes,
    intermediaryBank: input.intermediaryBank,
  };

  const updated = await prisma.fund.update({
    where: { id: fundId },
    data: {
      wireInstructions: wireInstructions as unknown as Record<string, unknown>,
      wireInstructionsUpdatedAt: new Date(),
      wireInstructionsUpdatedBy: userId,
    },
    select: {
      id: true,
      name: true,
      wireInstructions: true,
      wireInstructionsUpdatedAt: true,
    },
  });

  return updated;
}

/**
 * Get wire instructions for a fund (GP view — full details).
 */
export async function getWireInstructions(
  fundId: string,
): Promise<WireInstructions | null> {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { wireInstructions: true },
  });

  if (!fund?.wireInstructions) return null;

  return fund.wireInstructions as unknown as WireInstructions;
}

/**
 * Get wire instructions for a fund (LP view — masked account number).
 */
export async function getWireInstructionsPublic(
  fundId: string,
): Promise<WireInstructionsPublic | null> {
  const instructions = await getWireInstructions(fundId);
  if (!instructions) return null;

  return {
    bankName: instructions.bankName,
    accountNumberLast4: instructions.accountNumber.slice(-4),
    routingNumber: instructions.routingNumber,
    swiftCode: instructions.swiftCode,
    beneficiaryName: instructions.beneficiaryName,
    beneficiaryAddress: instructions.beneficiaryAddress,
    reference: instructions.reference,
    notes: instructions.notes,
    intermediaryBank: instructions.intermediaryBank,
  };
}

/**
 * Delete wire instructions for a fund.
 */
export async function deleteWireInstructions(
  fundId: string,
  userId: string,
) {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { id: true },
  });

  if (!fund) {
    throw new Error(`Fund not found: ${fundId}`);
  }

  return prisma.fund.update({
    where: { id: fundId },
    data: {
      wireInstructions: Prisma.JsonNull,
      wireInstructionsUpdatedAt: new Date(),
      wireInstructionsUpdatedBy: userId,
    },
    select: { id: true, name: true },
  });
}
