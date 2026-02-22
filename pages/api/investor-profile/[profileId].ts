import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { encryptTaxId } from "@/lib/crypto/secure-storage";
import { z } from "zod";

const entityDataSchema = z.object({
  entityType: z.enum(["INDIVIDUAL", "LLC", "TRUST", "RETIREMENT", "OTHER"]),
  // Common
  phone: z.string().optional(),
  // Address
  address: z
    .object({
      street1: z.string(),
      street2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default("US"),
    })
    .optional(),
  useMailingAddress: z.boolean().optional(),
  mailingAddress: z
    .object({
      street1: z.string(),
      street2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default("US"),
    })
    .optional(),

  // Individual
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  ssn: z.string().optional(),
  dateOfBirth: z.string().optional(),

  // LLC / Other
  legalName: z.string().optional(),
  ein: z.string().optional(),
  stateOfFormation: z.string().optional(),
  dateOfFormation: z.string().optional(),
  countryOfFormation: z.string().optional(),
  taxClassification: z.string().optional(),

  // Signer
  signatoryName: z.string().optional(),
  signatoryTitle: z.string().optional(),
  signatoryEmail: z.string().optional(),
  signatoryPhone: z.string().optional(),
  signatoryIsAccountHolder: z.boolean().optional(),

  // Trust
  trustType: z.string().optional(),
  taxId: z.string().optional(), // For trusts (SSN or EIN)
  dateEstablished: z.string().optional(),
  governingState: z.string().optional(),
  trusteeName: z.string().optional(),
  trusteeTitle: z.string().optional(),
  trusteeEmail: z.string().optional(),
  trusteePhone: z.string().optional(),

  // Retirement
  accountType: z.string().optional(),
  accountTitle: z.string().optional(),
  custodianName: z.string().optional(),
  custodianAccountNumber: z.string().optional(),
  custodianEin: z.string().optional(),
  custodianAddress: z
    .object({
      street1: z.string(),
      street2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default("US"),
    })
    .optional(),
  custodianContactName: z.string().optional(),
  custodianContactPhone: z.string().optional(),
  custodianContactEmail: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountHolderSsn: z.string().optional(),
  accountHolderDob: z.string().optional(),
  accountHolderPhone: z.string().optional(),
  accountHolderEmail: z.string().optional(),
  custodianCoSignRequired: z.boolean().optional(),

  // Other entity
  otherEntityType: z.string().optional(),
});

// Fields that are tracked for post-approval change detection
const TRACKABLE_FIELDS = [
  "entityName",
  "entityType",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "stateOfFormation",
  "dateOfFormation",
  "countryOfFormation",
  "taxClassification",
  "authorizedSignatory",
  "signatoryTitle",
  "trusteeName",
  "trustType",
  "accountType",
  "accountTitle",
  "custodianName",
] as const;

// Stages where the investor profile has been approved and changes need GP review
const APPROVED_STAGES = ["APPROVED", "COMMITTED", "DOCS_APPROVED", "FUNDED"];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { profileId } = req.query;
    if (!profileId || typeof profileId !== "string") {
      return res.status(400).json({ error: "Invalid profile ID" });
    }

    // Verify the investor profile belongs to the authenticated user
    const investor = await prisma.investor.findUnique({
      where: { id: profileId },
      include: {
        user: { select: { email: true, id: true } },
        investments: { select: { fundId: true } },
      },
    });

    if (!investor) {
      return res.status(404).json({ error: "Investor profile not found" });
    }

    if (investor.user.email !== session.user.email) {
      return res.status(403).json({ error: "Access denied" });
    }

    const parsed = entityDataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid entity data" });
    }

    const data = parsed.data;

    // Build Prisma update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      entityType: data.entityType,
      updatedAt: new Date(),
    };

    // Phone
    if (data.phone !== undefined) update.phone = data.phone || null;

    // Physical address
    if (data.address) {
      update.addressLine1 = data.address.street1;
      update.addressLine2 = data.address.street2 || null;
      update.city = data.address.city;
      update.state = data.address.state;
      update.postalCode = data.address.zip;
      update.country = data.address.country || "US";
    }

    // Mailing address
    if (data.useMailingAddress !== undefined) {
      update.useMailingAddress = data.useMailingAddress;
    }
    if (data.mailingAddress) {
      update.mailingAddressLine1 = data.mailingAddress.street1;
      update.mailingAddressLine2 = data.mailingAddress.street2 || null;
      update.mailingCity = data.mailingAddress.city;
      update.mailingState = data.mailingAddress.state;
      update.mailingPostalCode = data.mailingAddress.zip;
      update.mailingCountry = data.mailingAddress.country || "US";
    }

    // Entity-specific nested data (stored in entityData JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entityDataJson: Record<string, any> = {};

    switch (data.entityType) {
      case "INDIVIDUAL": {
        if (data.firstName || data.lastName) {
          update.entityName = `${data.firstName || ""} ${data.lastName || ""}`.trim() || null;
        }
        // SSN → encrypted in taxId
        if (data.ssn) {
          update.taxId = encryptTaxId(data.ssn);
        }
        if (data.dateOfBirth !== undefined) {
          update.dateOfBirth = data.dateOfBirth || null;
        }
        update.citizenship = "US";
        break;
      }

      case "LLC": {
        update.entityName = data.legalName || null;
        if (data.ein) {
          update.taxId = encryptTaxId(data.ein);
        }
        if (data.stateOfFormation !== undefined) update.stateOfFormation = data.stateOfFormation || null;
        if (data.dateOfFormation !== undefined) update.dateOfFormation = data.dateOfFormation || null;
        if (data.countryOfFormation !== undefined) update.countryOfFormation = data.countryOfFormation || null;
        if (data.taxClassification !== undefined) update.taxClassification = data.taxClassification || null;
        if (data.signatoryName !== undefined) update.authorizedSignatory = data.signatoryName || null;
        if (data.signatoryTitle !== undefined) update.signatoryTitle = data.signatoryTitle || null;

        // Store signer contact details in entityData JSON
        if (data.signatoryEmail) entityDataJson.signatoryEmail = data.signatoryEmail;
        if (data.signatoryPhone) entityDataJson.signatoryPhone = data.signatoryPhone;
        if (data.signatoryIsAccountHolder !== undefined) {
          entityDataJson.signatoryIsAccountHolder = data.signatoryIsAccountHolder;
        }
        break;
      }

      case "TRUST": {
        update.entityName = data.legalName || null;
        if (data.taxId) {
          update.taxId = encryptTaxId(data.taxId);
        }
        if (data.trustType !== undefined) update.trustType = data.trustType || null;
        if (data.dateEstablished !== undefined) update.trustDate = data.dateEstablished || null;
        if (data.governingState !== undefined) update.governingState = data.governingState || null;
        if (data.trusteeName !== undefined) update.trusteeName = data.trusteeName || null;

        // Store trustee contact in entityData JSON
        if (data.trusteeTitle) entityDataJson.trusteeTitle = data.trusteeTitle;
        if (data.trusteeEmail) entityDataJson.trusteeEmail = data.trusteeEmail;
        if (data.trusteePhone) entityDataJson.trusteePhone = data.trusteePhone;
        break;
      }

      case "RETIREMENT": {
        if (data.accountType !== undefined) update.accountType = data.accountType || null;
        if (data.accountTitle !== undefined) {
          update.accountTitle = data.accountTitle || null;
          update.entityName = data.accountTitle || null;
        }
        if (data.custodianName !== undefined) update.custodianName = data.custodianName || null;
        if (data.custodianAccountNumber !== undefined) {
          update.custodianAccount = data.custodianAccountNumber || null;
        }
        if (data.custodianEin) {
          update.custodianEin = encryptTaxId(data.custodianEin);
        }
        if (data.custodianCoSignRequired !== undefined) {
          update.custodianCoSignRequired = data.custodianCoSignRequired;
        }

        // Account holder SSN → encrypted in taxId
        if (data.accountHolderSsn) {
          update.taxId = encryptTaxId(data.accountHolderSsn);
        }

        // Store nested data in entityData JSON
        if (data.custodianAddress) entityDataJson.custodianAddress = data.custodianAddress;
        if (data.custodianContactName) entityDataJson.custodianContactName = data.custodianContactName;
        if (data.custodianContactPhone) entityDataJson.custodianContactPhone = data.custodianContactPhone;
        if (data.custodianContactEmail) entityDataJson.custodianContactEmail = data.custodianContactEmail;
        if (data.accountHolderName) entityDataJson.accountHolderName = data.accountHolderName;
        if (data.accountHolderDob) entityDataJson.accountHolderDob = data.accountHolderDob;
        if (data.accountHolderPhone) entityDataJson.accountHolderPhone = data.accountHolderPhone;
        if (data.accountHolderEmail) entityDataJson.accountHolderEmail = data.accountHolderEmail;
        break;
      }

      case "OTHER": {
        update.entityName = data.legalName || null;
        if (data.ein) {
          update.taxId = encryptTaxId(data.ein);
        }
        if (data.otherEntityType !== undefined) update.otherEntityType = data.otherEntityType || null;
        if (data.stateOfFormation !== undefined) update.stateOfFormation = data.stateOfFormation || null;
        if (data.countryOfFormation !== undefined) update.countryOfFormation = data.countryOfFormation || null;
        if (data.dateOfFormation !== undefined) update.dateOfFormation = data.dateOfFormation || null;
        if (data.taxClassification !== undefined) update.taxClassification = data.taxClassification || null;
        if (data.signatoryName !== undefined) update.authorizedSignatory = data.signatoryName || null;
        if (data.signatoryTitle !== undefined) update.signatoryTitle = data.signatoryTitle || null;

        // Store signer contact in entityData JSON
        if (data.signatoryEmail) entityDataJson.signatoryEmail = data.signatoryEmail;
        if (data.signatoryPhone) entityDataJson.signatoryPhone = data.signatoryPhone;
        break;
      }
    }

    // Merge entityData JSON with existing data
    if (Object.keys(entityDataJson).length > 0) {
      const existing =
        investor.entityData && typeof investor.entityData === "object"
          ? (investor.entityData as Record<string, unknown>)
          : {};
      update.entityData = { ...existing, ...entityDataJson };
    }

    // Post-approval change detection:
    // If investor has already been approved, don't apply changes directly —
    // instead, save the new values as PENDING change requests for GP review.
    const fd = (investor.fundData as Record<string, unknown>) || {};
    const stage = (fd.stage as string) || "APPLIED";
    const isPostApproval = APPROVED_STAGES.includes(stage);

    if (isPostApproval) {
      // Detect which trackable fields changed
      const changedFields: Array<{
        fieldName: string;
        currentValue: string;
        requestedValue: string;
      }> = [];

      for (const field of TRACKABLE_FIELDS) {
        if (field in update) {
          const current = String((investor as Record<string, unknown>)[field] || "");
          const requested = String(update[field] || "");
          if (current !== requested) {
            changedFields.push({
              fieldName: field,
              currentValue: current,
              requestedValue: requested,
            });
          }
        }
      }

      if (changedFields.length > 0) {
        // Create ProfileChangeRequest records for GP review (don't apply changes)
        const fundId = investor.investments[0]?.fundId || null;

        await Promise.all(
          changedFields.map((change) =>
            prisma.profileChangeRequest.create({
              data: {
                investorId: profileId,
                fundId,
                requestedBy: investor.user.id,
                status: "PENDING",
                changeType: "ENTITY_INFO",
                fieldName: change.fieldName,
                reason: "LP updated field after approval",
                currentValue: change.currentValue,
                requestedValue: change.requestedValue,
                newValue: change.requestedValue,
                lpNote: "Updated by investor",
              },
            }),
          ),
        );

        // Audit log
        logAuditEvent({
          eventType: "INVESTOR_UPDATED",
          resourceType: "Investor",
          resourceId: profileId,
          userId: investor.user.id,
          metadata: {
            entityType: data.entityType,
            postApprovalChange: true,
            changedFields: changedFields.map((c) => c.fieldName),
          },
        }).catch((e) => reportError(e as Error));

        return res.status(200).json({
          success: true,
          investorId: investor.id,
          entityType: investor.entityType,
          pendingChanges: changedFields.length,
          message: "Changes submitted for GP review",
        });
      }
    }

    // Normal update (pre-approval or no tracked fields changed)
    const updated = await prisma.investor.update({
      where: { id: profileId },
      data: update,
    });

    // Audit log
    logAuditEvent({
      eventType: "INVESTOR_UPDATED",
      resourceType: "Investor",
      resourceId: profileId,
      userId: investor.user.id,
      metadata: {
        entityType: data.entityType,
        fieldsUpdated: Object.keys(update).filter(
          (k) => k !== "updatedAt" && k !== "entityData"
        ),
      },
    }).catch((e) => reportError(e as Error));

    return res.status(200).json({
      success: true,
      investorId: updated.id,
      entityType: updated.entityType,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("PATCH /api/investor-profile/[profileId] error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
