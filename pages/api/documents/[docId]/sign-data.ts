import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { buildDocumentAutoFill } from "@/lib/entity/autofill";
import { buildMergeFieldData } from "@/lib/documents/merge-fields";

/**
 * GET /api/documents/[docId]/sign-data
 *
 * Returns document + pre-filled field data for signing.
 * Used by FundRoomSign component for initial load.
 *
 * Enhanced to return comprehensive auto-fill data from:
 * - Entity data (signatory, title, address, tax ID)
 * - Fund record (name, unit price)
 * - Organization record (GP entity name)
 * - Investment record (commitment amount)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { docId } = req.query as { docId: string };

  try {
    const document = await prisma.signatureDocument.findUnique({
      where: { id: docId },
      include: {
        fields: {
          orderBy: [{ pageNumber: "asc" }, { y: "asc" }],
        },
        recipients: {
          where: {
            OR: [
              { email: session.user.email || "" },
            ],
          },
          take: 1,
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check recipient has access
    const recipient = document.recipients[0];
    if (!recipient) {
      return res.status(403).json({ error: "You are not a recipient of this document" });
    }

    // Get investor profile for auto-fill (including entity data and structured address)
    const investor = await prisma.investor.findFirst({
      where: { userId: session.user.id },
      include: {
        user: { select: { name: true, email: true } },
        investments: {
          where: document.fundId ? { fundId: document.fundId } : undefined,
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Get fund and org data for merge fields
    let fundName: string | undefined;
    let gpEntity: string | undefined;
    let unitPrice: number | undefined;

    if (document.fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: document.fundId },
        select: {
          name: true,
          featureFlags: true,
          team: {
            select: {
              organization: { select: { name: true } },
            },
          },
        },
      });
      if (fund) {
        fundName = fund.name;
        gpEntity = fund.team?.organization?.name || undefined;
        const flags = fund.featureFlags as Record<string, unknown> | null;
        if (flags?.unitPrice && typeof flags.unitPrice === "number") {
          unitPrice = flags.unitPrice;
        }
      }
    }

    // Build entity auto-fill from stored entity data
    const entityData = (investor?.entityData as Record<string, unknown>) || {};
    const entityFields = {
      entityType: investor?.entityType || "INDIVIDUAL",
      legalName: investor?.entityName || investor?.user?.name || "",
      mailingAddress: entityData.mailingAddress as { street1: string; street2?: string; city: string; state: string; zip: string; country: string } | undefined,
      // Spread all entity-specific fields from entityData
      ...entityData,
    };

    const entityAutoFill = buildDocumentAutoFill(entityFields, investor?.user?.name || session.user.name || "");

    const investmentAmount = investor?.investments[0]?.commitmentAmount
      ? Number(investor.investments[0].commitmentAmount)
      : undefined;

    // Build structured address from entity data (prefer over legacy investor.address)
    const structuredAddress = entityAutoFill.formattedAddress ||
      [investor?.addressLine1, investor?.addressLine2, [investor?.city, investor?.state, investor?.postalCode].filter(Boolean).join(", ")].filter(Boolean).join("\n") ||
      investor?.address || "";

    // Build merge field data for template replacement
    const mergeFields = buildMergeFieldData({
      autoFill: entityAutoFill,
      fundName,
      gpEntity,
      investmentAmount,
      unitPrice,
      email: session.user.email || "",
    });

    const autoFillData = {
      investorName: entityAutoFill.signatoryName || investor?.user?.name || investor?.entityName || session.user.name || "",
      entityName: investor?.entityType !== "INDIVIDUAL" ? (investor?.entityName || "") : undefined,
      investmentAmount,
      email: session.user.email || "",
      address: structuredAddress,
      company: investor?.entityType !== "INDIVIDUAL" ? (investor?.entityName || "") : "",
      title: entityAutoFill.signatoryTitle || "",
      // Extended fields for comprehensive auto-fill
      fundName,
      gpEntity,
      signatoryName: entityAutoFill.signatoryName,
      signatoryTitle: entityAutoFill.signatoryTitle,
      entityType: entityAutoFill.entityTypeDescription,
      commitmentUnits: mergeFields.commitmentUnits,
    };

    return res.status(200).json({
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        fileUrl: document.file,
        status: document.status,
        fundId: document.fundId,
      },
      fields: document.fields.map((f) => ({
        id: f.id,
        type: f.type,
        pageNumber: f.pageNumber,
        x: f.x ? Number(f.x) : 0,
        y: f.y ? Number(f.y) : 0,
        width: f.width ? Number(f.width) : 10,
        height: f.height ? Number(f.height) : 3,
        required: f.required,
        label: f.label,
        placeholder: f.placeholder,
        value: f.value,
        recipientId: f.recipientId,
      })),
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        status: recipient.status,
        signingToken: recipient.signingToken,
      },
      autoFillData,
      mergeFields,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[SIGN_DATA] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
