import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

/**
 * Document template types by fund/raise mode.
 * Used for validation and default template resolution.
 */
const GP_FUND_DOC_TYPES = [
  "NDA",
  "LPA",
  "SUBSCRIPTION",
  "PPM",
  "SIDE_LETTER",
  "INVESTOR_QUESTIONNAIRE",
] as const;

const STARTUP_DOC_TYPES = [
  "NDA",
  "SAFE",
  "CONVERTIBLE_NOTE",
  "SPA",
  "IRA",
  "VOTING_AGREEMENT",
  "ROFR",
  "BOARD_CONSENT",
] as const;

const ALL_DOC_TYPES = [
  ...new Set([...GP_FUND_DOC_TYPES, ...STARTUP_DOC_TYPES]),
] as const;

type DocType = (typeof ALL_DOC_TYPES)[number];

/** Default template configuration per document type */
const DEFAULT_TEMPLATES: Record<
  string,
  {
    label: string;
    hasDefault: boolean;
    mergeFields: string[];
  }
> = {
  NDA: {
    label: "NDA / Confidentiality Agreement",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
    ],
  },
  LPA: {
    label: "Limited Partnership Agreement",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{investment_amount}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
      "{{commitment_units}}",
    ],
  },
  SUBSCRIPTION: {
    label: "Subscription Agreement",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{investment_amount}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
      "{{commitment_units}}",
    ],
  },
  PPM: {
    label: "Private Placement Memorandum",
    hasDefault: false,
    mergeFields: ["{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  },
  SIDE_LETTER: {
    label: "Side Letter",
    hasDefault: false,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
    ],
  },
  INVESTOR_QUESTIONNAIRE: {
    label: "Investor Questionnaire",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{date}}",
    ],
  },
  SAFE: {
    label: "SAFE Agreement",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{investment_amount}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
    ],
  },
  CONVERTIBLE_NOTE: {
    label: "Convertible Note Agreement",
    hasDefault: true,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{investment_amount}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
    ],
  },
  SPA: {
    label: "Stock Purchase Agreement",
    hasDefault: false,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{investment_amount}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
      "{{commitment_units}}",
    ],
  },
  IRA: {
    label: "Investors' Rights Agreement",
    hasDefault: false,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{fund_name}}",
      "{{gp_entity}}",
      "{{date}}",
    ],
  },
  VOTING_AGREEMENT: {
    label: "Voting Agreement",
    hasDefault: false,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{fund_name}}",
      "{{date}}",
    ],
  },
  ROFR: {
    label: "Right of First Refusal Agreement",
    hasDefault: false,
    mergeFields: [
      "{{investor_name}}",
      "{{investor_entity}}",
      "{{fund_name}}",
      "{{date}}",
    ],
  },
  BOARD_CONSENT: {
    label: "Board Consent",
    hasDefault: true,
    mergeFields: ["{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  },
};

/**
 * GET /api/org/[orgId]/document-templates
 *
 * Returns configured document templates for the organization,
 * with default template metadata and upload status per document type.
 *
 * Query params:
 *   - fundId (optional): filter templates for a specific fund
 *   - mode (optional): "GP_FUND" | "STARTUP" to filter doc types
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;

    // Verify user has admin access to this org
    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        team: { organizationId: orgId },
      },
      include: { team: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    const mode = searchParams.get("mode") as "GP_FUND" | "STARTUP" | null;

    // Get custom templates from SignatureTemplate (uploaded PDFs)
    const sigWhereClause: Record<string, unknown> = {
      teamId: membership.team.id,
    };
    if (fundId) {
      sigWhereClause.fundId = fundId;
    }

    const customTemplates = await prisma.signatureTemplate.findMany({
      where: sigWhereClause,
      orderBy: { createdAt: "desc" },
    });

    // Get default/custom document templates from DocumentTemplate model
    const docTemplateWhere: Record<string, unknown> = {
      teamId: membership.team.id,
      isActive: true,
    };
    if (fundId) {
      docTemplateWhere.fundId = fundId;
    }

    const documentTemplates = await prisma.documentTemplate.findMany({
      where: docTemplateWhere,
      orderBy: { createdAt: "desc" },
    });

    // Determine document types based on mode
    let docTypes: readonly string[];
    if (mode === "GP_FUND") {
      docTypes = GP_FUND_DOC_TYPES;
    } else if (mode === "STARTUP") {
      docTypes = STARTUP_DOC_TYPES;
    } else {
      docTypes = ALL_DOC_TYPES;
    }

    // Build combined template list: DocumentTemplate > SignatureTemplate > hardcoded defaults
    const templates = docTypes.map((docType) => {
      const defaultInfo = DEFAULT_TEMPLATES[docType];

      // Check DocumentTemplate model first (HTML-based templates)
      const docTemplate = documentTemplates.find(
        (tpl) => tpl.documentType === docType,
      );

      // Check SignatureTemplate model (uploaded PDF custom templates)
      const customForType = customTemplates.find((tpl: typeof customTemplates[number]) => {
        const fields = tpl.fields as Record<string, unknown> | null;
        return fields && fields.documentType === docType;
      }) || customTemplates.find((tpl: typeof customTemplates[number]) => {
        const meta = tpl.fields as Record<string, unknown> | null;
        return meta?.documentType === docType || tpl.name === defaultInfo?.label;
      });

      // Determine status: custom upload > document template > hardcoded default
      let status: string;
      if (customForType) {
        status = "CUSTOM_UPLOADED";
      } else if (docTemplate) {
        status = docTemplate.isDefault ? "DEFAULT_TEMPLATE" : "CUSTOM_UPLOADED";
      } else if (defaultInfo?.hasDefault) {
        status = "DEFAULT_TEMPLATE";
      } else {
        status = "NOT_CONFIGURED";
      }

      return {
        documentType: docType,
        label: docTemplate?.name || defaultInfo?.label || docType,
        description: "",
        hasDefaultTemplate: defaultInfo?.hasDefault || !!docTemplate?.isDefault,
        hasHtmlContent: !!docTemplate?.content,
        mergeFields: defaultInfo?.mergeFields || [],
        numPages: null as number | null,
        isRequired: false,
        status,
        customTemplate: customForType
          ? {
              id: customForType.id,
              name: customForType.name,
              file: customForType.file,
              storageType: customForType.storageType,
              numPages: customForType.numPages,
              createdAt: customForType.createdAt,
              updatedAt: customForType.updatedAt,
            }
          : null,
        documentTemplate: docTemplate
          ? {
              id: docTemplate.id,
              label: docTemplate.name,
              isDefault: docTemplate.isDefault,
              numPages: null as number | null,
              version: docTemplate.version,
              createdAt: docTemplate.createdAt,
              updatedAt: docTemplate.updatedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      templates,
      teamId: membership.team.id,
      orgId,
      mode: mode || "ALL",
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/org/[orgId]/document-templates
 *
 * Upload a new custom document template.
 * Stores as a SignatureTemplate record linked to the team.
 *
 * Body:
 *   - documentType: string (e.g. "NDA", "LPA")
 *   - fileName: string
 *   - storageKey: string (S3 path from putFile)
 *   - storageType: string (S3_PATH or VERCEL_BLOB)
 *   - numPages: number (optional)
 *   - fileSize: number (optional)
 *   - fundId: string (optional — link template to specific fund)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;

    // Verify user has admin access to this org
    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        team: { organizationId: orgId },
      },
      include: { team: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      documentType,
      fileName,
      storageKey,
      storageType = "S3_PATH",
      numPages,
      fileSize,
      fundId,
    } = body;

    // Validate required fields
    if (!documentType || !fileName || !storageKey) {
      return NextResponse.json(
        { error: "documentType, fileName, and storageKey are required" },
        { status: 400 },
      );
    }

    // Validate document type
    if (!ALL_DOC_TYPES.includes(documentType as DocType)) {
      return NextResponse.json(
        { error: "Invalid document type" },
        { status: 400 },
      );
    }

    // Validate storage type
    if (!["S3_PATH", "VERCEL_BLOB"].includes(storageType)) {
      return NextResponse.json(
        { error: "Invalid storage type" },
        { status: 400 },
      );
    }

    // Validate file size (25MB max)
    if (fileSize && fileSize > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 25MB limit" },
        { status: 400 },
      );
    }

    // If fundId provided, verify fund belongs to team
    if (fundId) {
      const fund = await prisma.fund.findFirst({
        where: { id: fundId, teamId: membership.team.id },
      });
      if (!fund) {
        return NextResponse.json(
          { error: "Fund not found" },
          { status: 404 },
        );
      }
    }

    const templateLabel =
      DEFAULT_TEMPLATES[documentType]?.label || documentType;

    // Check if a custom template already exists for this type
    const existingTemplates = await prisma.signatureTemplate.findMany({
      where: { teamId: membership.team.id },
    });

    const existingForType = existingTemplates.find((tpl: typeof existingTemplates[number]) => {
      const fields = tpl.fields as Record<string, unknown> | null;
      return fields && fields.documentType === documentType;
    });

    let template;

    if (existingForType) {
      // Update existing template
      template = await prisma.signatureTemplate.update({
        where: { id: existingForType.id },
        data: {
          name: `${templateLabel} (Custom)`,
          file: storageKey,
          storageType: storageType as any,
          numPages: numPages || null,
          fields: {
            documentType,
            fileName,
            fileSize: fileSize || null,
            uploadSource: "GP_UPLOADED_FOR_LP",
            fundId: fundId || null,
          },
        },
      });
    } else {
      // Create new template
      template = await prisma.signatureTemplate.create({
        data: {
          name: `${templateLabel} (Custom)`,
          file: storageKey,
          storageType: storageType as any,
          numPages: numPages || null,
          teamId: membership.team.id,
          createdById: session.user.id,
          fields: {
            documentType,
            fileName,
            fileSize: fileSize || null,
            uploadSource: "GP_UPLOADED_FOR_LP",
            fundId: fundId || null,
          },
        },
      });
    }

    // Audit log
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: session.user.id,
      teamId: membership.team.id,
      resourceType: "Document",
      resourceId: template.id,
      metadata: {
        action: existingForType ? "template_updated" : "template_uploaded",
        documentType,
        fileName,
        fundId: fundId || null,
      },
    });

    return NextResponse.json(
      {
        id: template.id,
        documentType,
        name: template.name,
        file: template.file,
        storageType: template.storageType,
        numPages: template.numPages,
        createdAt: template.createdAt,
      },
      { status: existingForType ? 200 : 201 },
    );
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
