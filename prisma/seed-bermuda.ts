/**
 * Bermuda Franchise Group — Production Tenant Seed Script
 *
 * Seeds the first production tenant: Bermuda Franchise Group (BFG)
 * with the Bermuda Franchise Fund I, L.P.
 *
 * Usage:
 *   npx ts-node prisma/seed-bermuda.ts [--clean] [--dry-run]
 *
 * This script is idempotent: running it multiple times will not
 * create duplicate records.
 */

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Configuration
const BFG_CONFIG = {
  org: {
    name: "Bermuda Franchise Group",
    slug: "bermuda-franchise",
    description:
      "Multi-unit franchise investment and management firm specializing in premium franchise brands.",
    brandColor: "#1a365d", // Navy blue
    accentColor: "#d69e2e", // Gold
    entityType: "LLC",
    productMode: "GP_FUND",
    sector: "Franchise Operations",
    geography: "Southeast United States",
    website: "https://bermudafranchisegroup.com",
    foundedYear: 2023,
    regulationDExemption: "506C",
    relatedPersons: [
      { name: "Joseph Bermuda", title: "Managing Partner", relationship: "General Partner" },
      { name: "Ricardo Ciesco", title: "Fund Administrator", relationship: "Executive Officer" },
    ],
    previousNames: "Bermuda Franchise Holdings, LLC",
  },
  team: {
    name: "Bermuda Franchise Fund I",
  },
  fund: {
    name: "Bermuda Franchise Fund I, L.P.",
    description:
      "A 506(c) private placement fund acquiring and operating premium franchise units. Wyoming Limited Partnership.",
    targetRaise: 9_550_000, // $9.55M total
    minimumInvestment: 90_000, // Current tranche minimum (updates as tranches advance)
    fullAuthorizedAmount: 9_550_000,
    style: "TRADITIONAL",
    entityMode: "FUND" as const,
    // Economic terms
    managementFeePct: 0.025, // 2.5%
    carryPct: 0.20, // 20%
    hurdleRate: 0.08, // 8%
    orgFeePct: 0.005, // 0.5% organizational fee
    expenseRatioPct: 0.003, // 0.3% operating expenses
    aumCalculationFrequency: "DAILY", // Daily AUM snapshots
    waterfallType: "EUROPEAN",
    termYears: 8,
    extensionYears: 2,
    currency: "USD",
  },
  // 6 pricing tiers — 90 total units
  pricingTiers: [
    { tranche: 1, name: "Founder's Equity (GP Formation)", units: 2, pricePerUnit: 0.0001, isActive: false }, // Completed
    { tranche: 2, name: "Early Investor", units: 25, pricePerUnit: 90_000, isActive: true }, // Current
    { tranche: 3, name: "Early Investor Rnd 2", units: 22, pricePerUnit: 95_000, isActive: false },
    { tranche: 4, name: "Growth", units: 17, pricePerUnit: 110_000, isActive: false },
    { tranche: 5, name: "Expansion", units: 13, pricePerUnit: 130_000, isActive: false },
    { tranche: 6, name: "Late-Stage Growth", units: 11, pricePerUnit: 150_000, isActive: false },
  ],
  wireInstructions: {
    bankName: "TBD — Update before launch",
    beneficiaryName: "Bermuda Franchise Fund I, L.P.",
    routingNumber: "XXXXXXXXX",
    accountNumber: "XXXX-XXXX-XXXX",
    reference: "BFF-I [Investor Last Name]",
    notes:
      "Include your full legal name and 'BFF-I' in the wire memo/reference field.",
  },
  // GP admin user — will be created or found by email
  adminEmail: "rciesco@fundroom.ai",
  adminName: "Ricardo Ciesco",
  // Default admin password — MUST be changed after first login via /api/auth/setup-admin
  adminPassword: process.env.ADMIN_SEED_PASSWORD || "FundRoom2026!",
  // Custom domains
  domains: [
    "fundroom.bermudafranchisegroup.com",
    "dataroom.bermudafranchisegroup.com",
  ],
};

async function main() {
  console.log("\n  FundRoom AI — Bermuda Franchise Group Seed");
  console.log("  ==========================================\n");

  const args = process.argv.slice(2);
  const cleanFirst = args.includes("--clean");
  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    console.log("  [DRY RUN] No data will be written.\n");
  }

  if (cleanFirst && !dryRun) {
    console.log("  Cleaning existing BFG data...");
    await cleanBFGData();
    console.log("  Done.\n");
  }

  // 1. Create or find admin user
  let adminUser = await prisma.user.findUnique({
    where: { email: BFG_CONFIG.adminEmail },
  });

  // Hash password for admin (bcrypt 12 rounds, matching auth-options.ts)
  const hashedPassword = await bcrypt.hash(BFG_CONFIG.adminPassword, 12);

  if (!adminUser) {
    if (dryRun) {
      console.log(`  [DRY] Would create user: ${BFG_CONFIG.adminEmail}`);
    } else {
      adminUser = await prisma.user.create({
        data: {
          email: BFG_CONFIG.adminEmail,
          name: BFG_CONFIG.adminName,
          emailVerified: new Date(),
          role: "GP",
          password: hashedPassword,
        },
      });
      console.log(`  Created Admin user: ${adminUser.email} (with password)`);
    }
  } else {
    // If admin exists but has no password, set one
    if (!adminUser.password) {
      if (!dryRun) {
        adminUser = await prisma.user.update({
          where: { id: adminUser.id },
          data: { password: hashedPassword },
        });
        console.log(`  Updated Admin user with password: ${adminUser.email}`);
      } else {
        console.log(`  [DRY] Would set password for: ${adminUser.email}`);
      }
    } else {
      console.log(`  Admin user exists (with password): ${adminUser.email}`);
    }
  }

  // 1b. Create or find GP demo user (joe@bermudafranchisegroup.com)
  const gpDemoEmail = "joe@bermudafranchisegroup.com";
  const gpDemoPassword = await bcrypt.hash("FundRoom2026!", 12);
  let gpDemoUser = await prisma.user.findUnique({
    where: { email: gpDemoEmail },
  });

  if (!gpDemoUser) {
    if (dryRun) {
      console.log(`  [DRY] Would create GP demo user: ${gpDemoEmail}`);
    } else {
      gpDemoUser = await prisma.user.create({
        data: {
          email: gpDemoEmail,
          name: "Joseph Bermuda",
          emailVerified: new Date(),
          role: "GP",
          password: gpDemoPassword,
        },
      });
      console.log(`  Created GP demo user: ${gpDemoUser.email} (with password)`);
    }
  } else {
    if (!gpDemoUser.password && !dryRun) {
      gpDemoUser = await prisma.user.update({
        where: { id: gpDemoUser.id },
        data: { password: gpDemoPassword },
      });
      console.log(`  Updated GP demo user with password: ${gpDemoUser.email}`);
    } else {
      console.log(`  GP demo user exists: ${gpDemoUser.email}`);
    }
  }

  // 2. Create Organization
  let org = await prisma.organization.findUnique({
    where: { slug: BFG_CONFIG.org.slug },
  });

  if (!org) {
    if (dryRun) {
      console.log(`  [DRY] Would create org: ${BFG_CONFIG.org.name}`);
    } else {
      org = await prisma.organization.create({
        data: {
          name: BFG_CONFIG.org.name,
          slug: BFG_CONFIG.org.slug,
          description: BFG_CONFIG.org.description,
          brandColor: BFG_CONFIG.org.brandColor,
          accentColor: BFG_CONFIG.org.accentColor,
          entityType: BFG_CONFIG.org.entityType,
          productMode: BFG_CONFIG.org.productMode,
          sector: BFG_CONFIG.org.sector,
          geography: BFG_CONFIG.org.geography,
          website: BFG_CONFIG.org.website,
          foundedYear: BFG_CONFIG.org.foundedYear,
          regulationDExemption: BFG_CONFIG.org.regulationDExemption,
          relatedPersons: BFG_CONFIG.org.relatedPersons,
          previousNames: BFG_CONFIG.org.previousNames,
          badActorCertified: true,
          badActorCertifiedAt: new Date(),
          badActorCertifiedBy: gpDemoUser?.id || "Joseph Bermuda",
          featureFlags: {
            mode: "GP_FUND",
            "dataroom.enabled": true,
            "marketplace.enabled": false,
          },
        },
      });
      console.log(`  Created Organization: ${org.name} (${org.slug})`);
    }
  } else {
    console.log(`  Organization exists: ${org.name}`);
  }

  // 3. Create OrganizationDefaults
  if (org) {
    const existingDefaults = await prisma.organizationDefaults.findUnique({
      where: { organizationId: org.id },
    });

    if (!existingDefaults && !dryRun) {
      await prisma.organizationDefaults.create({
        data: {
          organizationId: org.id,
          fundroomNdaGateEnabled: true,
          fundroomKycRequired: true,
          fundroomAccreditationRequired: true,
          fundroomStagedCommitmentsEnabled: false,
          fundroomCallFrequency: "AS_NEEDED",
          dataroomConversationsEnabled: false,
          dataroomAllowBulkDownload: true,
          linkEmailProtected: true,
          linkAllowDownload: true,
          linkEnableNotifications: true,
          auditLogRetentionDays: 2555, // 7 years
          allowExternalDocUpload: true,
          allowGpDocUploadForLp: true,
          accreditationMethod: "SELF_ACK",
          notifyGpCommitment: true,
          notifyGpWireUpload: true,
          notifyGpLpInactive: true,
          notifyGpExternalDocUpload: true,
          notifyLpStepComplete: true,
          notifyLpWireConfirm: true,
          notifyLpNewDocument: true,
          featureFlags: {
            mode: "GP_FUND",
          },
        },
      });
      console.log("  Created OrganizationDefaults");
    } else if (!existingDefaults) {
      console.log("  [DRY] Would create OrganizationDefaults");
    } else {
      console.log("  OrganizationDefaults exist");
    }
  }

  // 4. Create Organization Security Policy
  if (org) {
    const existingPolicy = await prisma.organizationSecurityPolicy.findUnique({
      where: { organizationId: org.id },
    });

    if (!existingPolicy && !dryRun) {
      await prisma.organizationSecurityPolicy.create({
        data: {
          organizationId: org.id,
          requireMfa: false,
          allowedAuthProviders: ["email", "google"],
        },
      });
      console.log("  Created OrganizationSecurityPolicy");
    } else if (!existingPolicy) {
      console.log("  [DRY] Would create OrganizationSecurityPolicy");
    } else {
      console.log("  SecurityPolicy exists");
    }
  }

  // 5. Create Team
  let team = await prisma.team.findFirst({
    where: {
      name: BFG_CONFIG.team.name,
      organizationId: org?.id,
    },
  });

  if (!team) {
    if (dryRun) {
      console.log(`  [DRY] Would create team: ${BFG_CONFIG.team.name}`);
    } else {
      team = await prisma.team.create({
        data: {
          name: BFG_CONFIG.team.name,
          organizationId: org?.id || null,
          plan: "business",
          users: adminUser
            ? {
                create: {
                  userId: adminUser.id,
                  role: "OWNER",
                  hasFundroomAccess: true,
                },
              }
            : undefined,
        },
      });
      console.log(`  Created Team: ${team.name}`);
    }
  } else {
    console.log(`  Team exists: ${team.name}`);

    // Ensure admin membership
    if (adminUser) {
      const membership = await prisma.userTeam.findFirst({
        where: { teamId: team.id, userId: adminUser.id },
      });
      if (!membership && !dryRun) {
        await prisma.userTeam.create({
          data: {
            teamId: team.id,
            userId: adminUser.id,
            role: "OWNER",
            hasFundroomAccess: true,
          },
        });
        console.log("  Added admin as OWNER of team");
      }
    }

    // Ensure GP demo user membership
    if (gpDemoUser) {
      const gpMembership = await prisma.userTeam.findFirst({
        where: { teamId: team.id, userId: gpDemoUser.id },
      });
      if (!gpMembership && !dryRun) {
        await prisma.userTeam.create({
          data: {
            teamId: team.id,
            userId: gpDemoUser.id,
            role: "ADMIN",
            hasFundroomAccess: true,
          },
        });
        console.log("  Added GP demo user as ADMIN of team");
      }
    }
  }

  // 6. Create Fund
  let fund = await prisma.fund.findFirst({
    where: { teamId: team?.id, name: BFG_CONFIG.fund.name },
  });

  if (!fund && team) {
    if (dryRun) {
      console.log(`  [DRY] Would create fund: ${BFG_CONFIG.fund.name}`);
    } else {
      fund = await prisma.fund.create({
        data: {
          teamId: team.id,
          name: BFG_CONFIG.fund.name,
          description: BFG_CONFIG.fund.description,
          targetRaise: new Decimal(BFG_CONFIG.fund.targetRaise),
          minimumInvestment: new Decimal(BFG_CONFIG.fund.minimumInvestment),
          currentRaise: new Decimal(0),
          status: "RAISING",
          entityMode: BFG_CONFIG.fund.entityMode,
          style: BFG_CONFIG.fund.style,
          ndaGateEnabled: true,
          initialThresholdEnabled: false,
          fullAuthorizedAmount: new Decimal(
            BFG_CONFIG.fund.fullAuthorizedAmount,
          ),
          managementFeePct: new Decimal(BFG_CONFIG.fund.managementFeePct),
          carryPct: new Decimal(BFG_CONFIG.fund.carryPct),
          hurdleRate: new Decimal(BFG_CONFIG.fund.hurdleRate),
          orgFeePct: new Decimal(BFG_CONFIG.fund.orgFeePct),
          expenseRatioPct: new Decimal(BFG_CONFIG.fund.expenseRatioPct),
          aumCalculationFrequency: BFG_CONFIG.fund.aumCalculationFrequency,
          waterfallType: BFG_CONFIG.fund.waterfallType,
          termYears: BFG_CONFIG.fund.termYears,
          extensionYears: BFG_CONFIG.fund.extensionYears,
          currency: BFG_CONFIG.fund.currency,
          regulationDExemption: "506C",
          investmentCompanyExemption: "3C1",
          useOfProceeds: "Acquisition and operation of premium franchise units across Southeast US markets.",
          gpCommitmentAmount: new Decimal(500_000),
          gpCommitmentPct: new Decimal(0.0524), // ~5.24% of target
          investmentPeriodYears: 3,
          preferredReturnMethod: "COMPOUND",
          highWaterMark: true,
          recyclingEnabled: true,
          keyPersonEnabled: true,
          keyPersonName: "Joseph Bermuda",
          noFaultDivorceThreshold: new Decimal(0.6667), // 66.67%
          clawbackProvision: true,
          wireInstructions: BFG_CONFIG.wireInstructions,
          wireInstructionsUpdatedAt: new Date(),
          wireInstructionsUpdatedBy: adminUser?.id || "seed",
          createdBy: adminUser?.id || "seed",
        },
      });
      console.log(`  Created Fund: ${fund.name}`);
    }
  } else if (fund) {
    console.log(`  Fund exists: ${fund.name}`);
  }

  // 7. Create Fund Aggregate
  if (fund) {
    let aggregate = await prisma.fundAggregate.findFirst({
      where: { fundId: fund.id },
    });

    if (!aggregate && !dryRun) {
      aggregate = await prisma.fundAggregate.create({
        data: {
          fundId: fund.id,
          totalCommitted: 0,
          totalInbound: 0,
          totalOutbound: 0,
          initialThresholdEnabled: false,
          initialThresholdAmount: 0,
          initialThresholdMet: false,
          fullAuthorizedAmount: BFG_CONFIG.fund.fullAuthorizedAmount,
          fullAuthorizedProgress: 0,
        },
      });
      console.log("  Created FundAggregate");
    } else if (!aggregate) {
      console.log("  [DRY] Would create FundAggregate");
    } else {
      console.log("  FundAggregate exists");
    }
  }

  // 8. Create Pricing Tiers (6 tranches, 90 total units)
  if (fund && !dryRun) {
    const existingTiers = await prisma.fundPricingTier.findMany({
      where: { fundId: fund.id },
    });

    if (existingTiers.length === 0) {
      const tierData = BFG_CONFIG.pricingTiers.map((t) => ({
        fundId: fund!.id,
        tranche: t.tranche,
        name: t.name,
        pricePerUnit: t.pricePerUnit,
        unitsAvailable: t.units,
        unitsTotal: t.units,
        isActive: t.isActive,
      }));

      // Tranche 1 (GP Formation) is pre-completed — 0 units available
      tierData[0].unitsAvailable = 0;

      await prisma.fundPricingTier.createMany({ data: tierData });
      console.log(
        "  Created 6 pricing tiers (GP Formation through Late-Stage Growth)",
      );
    } else {
      console.log(`  Pricing tiers exist (${existingTiers.length} tiers)`);
    }
  }

  // 8b. Seed sample FundingRound records (for demo/test of startup rounds chart)
  // These are NOT for the BFG fund (which is GP_FUND mode) but demonstrate the model
  // for startup-mode funds. Only created if the fund exists and no rounds exist yet.
  if (fund && org && !dryRun) {
    const existingRounds = await prisma.fundingRound.findMany({
      where: { fundId: fund.id },
    });

    if (existingRounds.length === 0) {
      // Seed demo funding rounds for startup-mode testing.
      // The BFG fund is GP_FUND mode, but these rounds allow the demo to work
      // if the fund is switched to STARTUP mode for testing/demo purposes.
      const demoRounds = [
        {
          roundName: "Pre-Seed",
          roundOrder: 1,
          amountRaised: 500000,
          targetAmount: 500000,
          preMoneyVal: 3000000,
          postMoneyVal: 3500000,
          leadInvestor: "Angel Syndicate",
          investorCount: 4,
          roundDate: new Date("2024-03-15"),
          closeDate: new Date("2024-04-30"),
          status: "COMPLETED" as const,
          instrumentType: "SAFE",
          valuationCap: 5000000,
          discount: 20,
        },
        {
          roundName: "Seed",
          roundOrder: 2,
          amountRaised: 1800000,
          targetAmount: 2000000,
          preMoneyVal: 8000000,
          postMoneyVal: 10000000,
          leadInvestor: "Bermuda Ventures",
          investorCount: 12,
          roundDate: new Date("2024-09-01"),
          closeDate: new Date("2025-01-15"),
          status: "COMPLETED" as const,
          instrumentType: "CONVERTIBLE_NOTE",
          valuationCap: 10000000,
          discount: 15,
        },
        {
          roundName: "Series A",
          roundOrder: 3,
          amountRaised: 2400000,
          targetAmount: 5000000,
          preMoneyVal: 20000000,
          postMoneyVal: 25000000,
          leadInvestor: "FundRoom Capital",
          investorCount: 8,
          roundDate: new Date("2025-06-01"),
          closeDate: null,
          status: "ACTIVE" as const,
          instrumentType: "PRICED_ROUND",
          valuationCap: null,
          discount: null,
        },
        {
          roundName: "Series B",
          roundOrder: 4,
          amountRaised: 0,
          targetAmount: 15000000,
          preMoneyVal: 50000000,
          postMoneyVal: null,
          leadInvestor: null,
          investorCount: 0,
          roundDate: null,
          closeDate: null,
          status: "PLANNED" as const,
          instrumentType: "PRICED_ROUND",
          valuationCap: null,
          discount: null,
        },
        {
          roundName: "Series C",
          roundOrder: 5,
          amountRaised: 0,
          targetAmount: 40000000,
          preMoneyVal: null,
          postMoneyVal: null,
          leadInvestor: null,
          investorCount: 0,
          roundDate: null,
          closeDate: null,
          status: "PLANNED" as const,
          instrumentType: "PRICED_ROUND",
          valuationCap: null,
          discount: null,
        },
      ];

      for (const round of demoRounds) {
        await prisma.fundingRound.create({
          data: {
            fundId: fund.id,
            orgId: org.id,
            ...round,
          },
        });
      }
      console.log(`  Created ${demoRounds.length} demo funding rounds (Pre-Seed → Series C)`);
    }
  }

  // 9. Create Dataroom
  if (team) {
    let dataroom = await prisma.dataroom.findFirst({
      where: { teamId: team.id, name: "Bermuda Franchise Fund I — PPM" },
    });

    if (!dataroom && !dryRun) {
      dataroom = await prisma.dataroom.create({
        data: {
          teamId: team.id,
          pId: "bermuda-club-fund",
          name: "Bermuda Franchise Fund I — PPM",
        },
      });
      console.log(`  Created Dataroom: ${dataroom.name}`);

      // Create a public link for the dataroom
      await prisma.link.create({
        data: {
          dataroomId: dataroom.id,
          slug: "bermuda-club-fund-ppm",
          name: "PPM Access Link",
          emailProtected: true,
          allowDownload: false,
          enableNotification: true,
        },
      });
      console.log("  Created Dataroom link (email-protected)");
    } else if (!dataroom) {
      console.log("  [DRY] Would create Dataroom");
    } else {
      console.log(`  Dataroom exists: ${dataroom.name}`);
    }
  }

  // 10. Create Dataroom Folders for PPM structure
  if (team && !dryRun) {
    const dataroom = await prisma.dataroom.findFirst({
      where: { teamId: team.id, name: "Bermuda Franchise Fund I — PPM" },
    });

    if (dataroom) {
      const existingFolders = await prisma.dataroomFolder.findMany({
        where: { dataroomId: dataroom.id },
      });

      if (existingFolders.length === 0) {
        const folders = [
          { name: "Executive Summary", path: "/executive-summary" },
          { name: "PPM & Legal Documents", path: "/ppm-legal" },
          { name: "Financial Projections", path: "/financials" },
          { name: "Franchise Agreements", path: "/franchise-agreements" },
          { name: "Market Analysis", path: "/market-analysis" },
          { name: "Management Team", path: "/management" },
          { name: "Due Diligence", path: "/due-diligence" },
        ];

        for (const folder of folders) {
          await prisma.dataroomFolder.create({
            data: {
              dataroomId: dataroom.id,
              name: folder.name,
              path: folder.path,
            },
          });
        }
        console.log(`  Created ${folders.length} dataroom folders`);
      } else {
        console.log(
          `  Dataroom folders exist (${existingFolders.length} folders)`,
        );
      }
    }
  }

  // 11. Create Demo LP Investors at various pipeline stages
  if (fund && !dryRun) {
    const lpPassword = await bcrypt.hash("Investor2026!", 12);
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

    const SEC_REPRESENTATIONS = {
      accreditedCert: true,
      investingAsPrincipal: true,
      readOfferingDocs: true,
      riskAwareness: true,
      restrictedSecurities: true,
      amlOfac: true,
      taxConsent: true,
      independentAdvice: true,
      timestamp: now.toISOString(),
    };

    // ── LP 1: Sample Investor (APPLIED stage — existing, enhanced) ──
    const sampleLPEmail = "investor@fundroom.ai";
    let sampleLP = await prisma.user.findUnique({ where: { email: sampleLPEmail } });
    if (!sampleLP) {
      sampleLP = await prisma.user.create({
        data: {
          email: sampleLPEmail,
          name: "Sample Investor",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "INDIVIDUAL",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "INCOME_200K",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "SALARY",
              occupation: "Senior Software Engineer",
              ndaSigned: true,
              ndaSignedAt: daysAgo(5),
              onboardingStep: 5,
              onboardingCompletedAt: daysAgo(5),
              fundId: fund.id,
              addressLine1: "123 Main Street",
              city: "Miami",
              state: "FL",
              postalCode: "33101",
              country: "US",
              entityData: { pepStatus: "NOT_PEP", citizenship: "US" },
              fundData: {
                approvalStage: "APPLIED",
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(5).toISOString(), note: "Completed onboarding" },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 1 (APPLIED): ${sampleLPEmail}`);

      const inv1 = await prisma.investor.findUnique({ where: { userId: sampleLP.id } });
      if (inv1) {
        await prisma.investment.create({
          data: { fundId: fund.id, investorId: inv1.id, commitmentAmount: 0, fundedAmount: 0, status: "APPLIED" },
        });
      }
    } else {
      console.log(`  LP 1 exists: ${sampleLPEmail}`);
    }

    // ── LP 2: Demo Investor (LLC, COMMITTED stage — primary demo account) ──
    const demoLPEmail = "demo-investor@example.com";
    let demoLP = await prisma.user.findUnique({ where: { email: demoLPEmail } });
    if (!demoLP) {
      demoLP = await prisma.user.create({
        data: {
          email: demoLPEmail,
          name: "Acme Capital Partners, LLC",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "LLC",
              entityName: "Acme Capital Partners, LLC",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "ENTITY_ASSETS_5M",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "BUSINESS_INCOME",
              occupation: "Investment Management",
              ndaSigned: true,
              ndaSignedAt: daysAgo(10),
              onboardingStep: 7,
              onboardingCompletedAt: daysAgo(8),
              fundId: fund.id,
              addressLine1: "One Financial Center, Suite 4200",
              city: "Boston",
              state: "MA",
              postalCode: "02111",
              country: "US",
              stateOfFormation: "Delaware",
              dateOfFormation: "2021-03-15",
              authorizedSignatory: "James Chen",
              signatoryTitle: "Managing Member",
              entityData: {
                beneficialOwners: [
                  { name: "James Chen", ownershipPct: 60, title: "Managing Member" },
                  { name: "Sarah Chen", ownershipPct: 40, title: "Member" },
                ],
                pepStatus: "NOT_PEP",
              },
              fundData: {
                approvalStage: "COMMITTED",
                representations: SEC_REPRESENTATIONS,
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(10).toISOString(), note: "Onboarding started" },
                  { stage: "UNDER_REVIEW", timestamp: daysAgo(9).toISOString(), note: "Documents submitted" },
                  { stage: "APPROVED", timestamp: daysAgo(8).toISOString(), note: "GP approved" },
                  { stage: "COMMITTED", timestamp: daysAgo(7).toISOString(), note: "Subscription signed" },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 2 (COMMITTED/LLC): ${demoLPEmail}`);

      const inv2 = await prisma.investor.findUnique({ where: { userId: demoLP.id } });
      if (inv2) {
        await prisma.investment.create({
          data: {
            fundId: fund.id,
            investorId: inv2.id,
            commitmentAmount: new Decimal(90_000),
            fundedAmount: new Decimal(0),
            status: "COMMITTED",
            subscriptionDate: daysAgo(7),
          },
        });
        console.log("  Created Investment: $90,000 committed");
      }
    } else {
      console.log(`  LP 2 exists: ${demoLPEmail}`);
    }

    // ── LP 3: Trust Investor (FUNDED stage — completed lifecycle) ──
    const trustLPEmail = "trust-investor@example.com";
    let trustLP = await prisma.user.findUnique({ where: { email: trustLPEmail } });
    if (!trustLP) {
      trustLP = await prisma.user.create({
        data: {
          email: trustLPEmail,
          name: "Robert & Sandra Williams",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "TRUST",
              entityName: "Williams Family Revocable Trust",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "NET_WORTH_1M",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "INVESTMENT_RETURNS",
              occupation: "Retired — Former CFO",
              ndaSigned: true,
              ndaSignedAt: daysAgo(30),
              onboardingStep: 7,
              onboardingCompletedAt: daysAgo(25),
              fundId: fund.id,
              addressLine1: "456 Palm Beach Drive",
              city: "Palm Beach",
              state: "FL",
              postalCode: "33480",
              country: "US",
              trustType: "REVOCABLE",
              trustDate: "2019-06-01",
              trusteeName: "Robert Williams",
              entityData: {
                pepStatus: "NOT_PEP",
                citizenship: "US",
                grantorAccredited: true,
              },
              fundData: {
                approvalStage: "FUNDED",
                representations: SEC_REPRESENTATIONS,
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(30).toISOString() },
                  { stage: "APPROVED", timestamp: daysAgo(28).toISOString() },
                  { stage: "COMMITTED", timestamp: daysAgo(25).toISOString() },
                  { stage: "DOCS_APPROVED", timestamp: daysAgo(22).toISOString() },
                  { stage: "FUNDED", timestamp: daysAgo(15).toISOString(), note: "Wire confirmed" },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 3 (FUNDED/Trust): ${trustLPEmail}`);

      const inv3 = await prisma.investor.findUnique({ where: { userId: trustLP.id } });
      if (inv3) {
        const investment3 = await prisma.investment.create({
          data: {
            fundId: fund.id,
            investorId: inv3.id,
            commitmentAmount: new Decimal(180_000),
            fundedAmount: new Decimal(180_000),
            status: "FUNDED",
            subscriptionDate: daysAgo(25),
          },
        });
        console.log("  Created Investment: $180,000 funded");

        // Create completed wire transfer transaction
        await prisma.transaction.create({
          data: {
            investorId: inv3.id,
            fundId: fund.id,
            type: "WIRE_TRANSFER",
            amount: new Decimal(180_000),
            status: "COMPLETED",
            description: "Wire transfer — Williams Family Trust",
            initiatedBy: trustLP.id,
            initiatedAt: daysAgo(20),
            expectedAmount: new Decimal(180_000),
            fundsReceivedDate: daysAgo(15),
            confirmedBy: adminUser?.id || "seed",
            confirmedAt: daysAgo(15),
            confirmationMethod: "MANUAL",
            bankReference: "WR-WILLIAMS-001",
            metadata: {
              proofFileName: "williams-wire-confirmation.pdf",
              proofUploadedAt: daysAgo(20).toISOString(),
            },
          },
        });
        console.log("  Created Transaction: COMPLETED wire ($180,000)");
      }
    } else {
      console.log(`  LP 3 exists: ${trustLPEmail}`);
    }

    // ── LP 4: IRA Investor (DOCS_APPROVED stage — awaiting wire) ──
    const iraLPEmail = "ira-investor@example.com";
    let iraLP = await prisma.user.findUnique({ where: { email: iraLPEmail } });
    if (!iraLP) {
      iraLP = await prisma.user.create({
        data: {
          email: iraLPEmail,
          name: "Michael Torres",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "IRA",
              entityName: "Michael Torres Self-Directed IRA",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "INCOME_200K",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "SAVINGS",
              occupation: "Orthopedic Surgeon",
              ndaSigned: true,
              ndaSignedAt: daysAgo(14),
              onboardingStep: 7,
              onboardingCompletedAt: daysAgo(12),
              fundId: fund.id,
              addressLine1: "789 Medical Plaza",
              city: "Atlanta",
              state: "GA",
              postalCode: "30309",
              country: "US",
              accountType: "SELF_DIRECTED_IRA",
              custodianName: "Equity Trust Company",
              entityData: { pepStatus: "NOT_PEP", citizenship: "US" },
              fundData: {
                approvalStage: "DOCS_APPROVED",
                representations: SEC_REPRESENTATIONS,
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(14).toISOString() },
                  { stage: "APPROVED", timestamp: daysAgo(12).toISOString() },
                  { stage: "COMMITTED", timestamp: daysAgo(10).toISOString() },
                  { stage: "DOCS_APPROVED", timestamp: daysAgo(7).toISOString(), note: "All docs signed" },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 4 (DOCS_APPROVED/IRA): ${iraLPEmail}`);

      const inv4 = await prisma.investor.findUnique({ where: { userId: iraLP.id } });
      if (inv4) {
        await prisma.investment.create({
          data: {
            fundId: fund.id,
            investorId: inv4.id,
            commitmentAmount: new Decimal(90_000),
            fundedAmount: new Decimal(0),
            status: "DOCS_APPROVED",
            subscriptionDate: daysAgo(10),
          },
        });
        console.log("  Created Investment: $90,000 docs approved, awaiting wire");
      }
    } else {
      console.log(`  LP 4 exists: ${iraLPEmail}`);
    }

    // ── LP 5: Partnership Investor (UNDER_REVIEW — pending GP approval) ──
    const partnerLPEmail = "partnership-investor@example.com";
    let partnerLP = await prisma.user.findUnique({ where: { email: partnerLPEmail } });
    if (!partnerLP) {
      partnerLP = await prisma.user.create({
        data: {
          email: partnerLPEmail,
          name: "Horizon Ventures LP",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "PARTNERSHIP",
              entityName: "Horizon Ventures, L.P.",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "ENTITY_ASSETS_5M",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "BUSINESS_INCOME",
              occupation: "Venture Capital",
              ndaSigned: true,
              ndaSignedAt: daysAgo(3),
              onboardingStep: 6,
              onboardingCompletedAt: daysAgo(2),
              fundId: fund.id,
              addressLine1: "100 Innovation Drive, Suite 600",
              city: "Austin",
              state: "TX",
              postalCode: "78701",
              country: "US",
              stateOfFormation: "Texas",
              authorizedSignatory: "David Park",
              signatoryTitle: "General Partner",
              entityData: {
                beneficialOwners: [
                  { name: "David Park", ownershipPct: 50, title: "General Partner" },
                  { name: "Emily Nakamura", ownershipPct: 30, title: "Limited Partner" },
                  { name: "Raj Patel", ownershipPct: 20, title: "Limited Partner" },
                ],
                pepStatus: "NOT_PEP",
              },
              fundData: {
                approvalStage: "UNDER_REVIEW",
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(3).toISOString() },
                  { stage: "UNDER_REVIEW", timestamp: daysAgo(2).toISOString(), note: "Submitted for GP review" },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 5 (UNDER_REVIEW/Partnership): ${partnerLPEmail}`);

      const inv5 = await prisma.investor.findUnique({ where: { userId: partnerLP.id } });
      if (inv5) {
        await prisma.investment.create({
          data: {
            fundId: fund.id,
            investorId: inv5.id,
            commitmentAmount: new Decimal(270_000),
            fundedAmount: new Decimal(0),
            status: "APPLIED",
          },
        });
        console.log("  Created Investment: $270,000 under review");
      }
    } else {
      console.log(`  LP 5 exists: ${partnerLPEmail}`);
    }

    // ── LP 6: Wire Proof Uploaded (COMMITTED + PROOF_UPLOADED transaction) ──
    const wireLPEmail = "wire-pending@example.com";
    let wireLP = await prisma.user.findUnique({ where: { email: wireLPEmail } });
    if (!wireLP) {
      wireLP = await prisma.user.create({
        data: {
          email: wireLPEmail,
          name: "Catherine Blake",
          emailVerified: now,
          role: "LP",
          password: lpPassword,
          investorProfile: {
            create: {
              entityType: "INDIVIDUAL",
              accreditationStatus: "SELF_CERTIFIED",
              accreditationCategory: "JOINT_INCOME_300K",
              accreditationMethod: "SELF_ACK",
              sourceOfFunds: "SALARY",
              occupation: "Managing Director, Goldman Sachs",
              ndaSigned: true,
              ndaSignedAt: daysAgo(8),
              onboardingStep: 7,
              onboardingCompletedAt: daysAgo(6),
              fundId: fund.id,
              addressLine1: "500 Park Avenue, Apt 32B",
              city: "New York",
              state: "NY",
              postalCode: "10022",
              country: "US",
              entityData: { pepStatus: "NOT_PEP", citizenship: "US" },
              fundData: {
                approvalStage: "COMMITTED",
                representations: SEC_REPRESENTATIONS,
                approvalHistory: [
                  { stage: "APPLIED", timestamp: daysAgo(8).toISOString() },
                  { stage: "APPROVED", timestamp: daysAgo(7).toISOString() },
                  { stage: "COMMITTED", timestamp: daysAgo(6).toISOString() },
                ],
              },
            },
          },
        },
      });
      console.log(`  Created LP 6 (COMMITTED + wire proof): ${wireLPEmail}`);

      const inv6 = await prisma.investor.findUnique({ where: { userId: wireLP.id } });
      if (inv6) {
        const investment6 = await prisma.investment.create({
          data: {
            fundId: fund.id,
            investorId: inv6.id,
            commitmentAmount: new Decimal(90_000),
            fundedAmount: new Decimal(0),
            status: "COMMITTED",
            subscriptionDate: daysAgo(6),
          },
        });

        // Create PROOF_UPLOADED transaction — shows in GP "Confirm Receipt" tab
        await prisma.transaction.create({
          data: {
            investorId: inv6.id,
            fundId: fund.id,
            type: "WIRE_TRANSFER",
            amount: new Decimal(90_000),
            status: "PROOF_UPLOADED",
            description: "Wire proof uploaded: blake-wire-receipt.pdf",
            initiatedBy: wireLP.id,
            initiatedAt: daysAgo(4),
            expectedAmount: new Decimal(90_000),
            bankReference: "WR-BLAKE-001",
            metadata: {
              proofDocumentKey: "s3://proofs/blake-wire-receipt.pdf",
              proofStorageType: "S3_PATH",
              proofFileType: "application/pdf",
              proofFileName: "blake-wire-receipt.pdf",
              proofUploadedBy: wireLP.id,
              proofUploadedAt: daysAgo(4).toISOString(),
              amountSent: 90000,
            },
          },
        });
        console.log("  Created Transaction: PROOF_UPLOADED ($90,000)");
      }
    } else {
      console.log(`  LP 6 exists: ${wireLPEmail}`);
    }

    // Update FundAggregate with demo totals
    if (fund) {
      await prisma.fundAggregate.updateMany({
        where: { fundId: fund.id },
        data: {
          totalCommitted: 720_000, // 180K + 90K + 90K + 270K + 90K
          totalInbound: 180_000,   // Only the funded trust investment
        },
      });
      console.log("  Updated FundAggregate: $720K committed, $180K funded");
    }
  }

  // 12. Create Custom Domains
  if (team && !dryRun) {
    for (const domainName of BFG_CONFIG.domains) {
      const existing = await prisma.domain.findFirst({
        where: { slug: domainName, teamId: team.id },
      });

      if (!existing) {
        await prisma.domain.create({
          data: {
            slug: domainName,
            teamId: team.id,
            verified: false,
          },
        });
        console.log(`  Created Domain: ${domainName}`);
      } else {
        console.log(`  Domain exists: ${domainName}`);
      }
    }
  }

  // 13. Create Signature Documents for LP Onboarding
  if (fund && team && adminUser && !dryRun) {
    const existingSignDocs = await prisma.signatureDocument.findMany({
      where: { fundId: fund.id, requiredForOnboarding: true },
    });

    if (existingSignDocs.length === 0) {
      // NDA — Non-Disclosure Agreement
      const nda = await prisma.signatureDocument.create({
        data: {
          title: "Non-Disclosure Agreement (NDA)",
          description:
            "Confidentiality agreement required before accessing fund materials and investor information.",
          file: "templates/bermuda-franchise-fund-i-nda.pdf",
          storageType: "S3_PATH",
          numPages: 3,
          status: "SENT",
          sentAt: new Date(),
          documentType: "NDA",
          requiredForOnboarding: true,
          fundId: fund.id,
          teamId: team.id,
          createdById: adminUser.id,
          fields: {
            create: [
              {
                type: "SIGNATURE",
                pageNumber: 3,
                x: 10,
                y: 70,
                width: 30,
                height: 6,
                required: true,
                label: "Investor Signature",
              },
              {
                type: "NAME",
                pageNumber: 3,
                x: 10,
                y: 78,
                width: 30,
                height: 4,
                required: true,
                label: "Printed Name",
              },
              {
                type: "DATE_SIGNED",
                pageNumber: 3,
                x: 10,
                y: 84,
                width: 20,
                height: 4,
                required: true,
                label: "Date",
              },
            ],
          },
        },
      });
      console.log(`  Created NDA SignatureDocument: ${nda.id}`);

      // Subscription Agreement
      const subAg = await prisma.signatureDocument.create({
        data: {
          title: "Subscription Agreement — Bermuda Franchise Fund I",
          description:
            "Limited partnership subscription agreement for Bermuda Franchise Fund I, L.P. Review terms, sign, and commit your investment.",
          file: "templates/bermuda-franchise-fund-i-subscription.pdf",
          storageType: "S3_PATH",
          numPages: 12,
          status: "SENT",
          sentAt: new Date(),
          documentType: "SUBSCRIPTION",
          requiredForOnboarding: true,
          fundId: fund.id,
          teamId: team.id,
          createdById: adminUser.id,
          fields: {
            create: [
              {
                type: "NAME",
                pageNumber: 1,
                x: 50,
                y: 30,
                width: 35,
                height: 4,
                required: true,
                label: "Investor Name",
              },
              {
                type: "EMAIL",
                pageNumber: 1,
                x: 50,
                y: 36,
                width: 35,
                height: 4,
                required: true,
                label: "Email Address",
              },
              {
                type: "TEXT",
                pageNumber: 1,
                x: 50,
                y: 42,
                width: 35,
                height: 4,
                required: true,
                label: "Commitment Amount ($)",
                placeholder: "50,000",
              },
              {
                type: "SIGNATURE",
                pageNumber: 12,
                x: 10,
                y: 60,
                width: 30,
                height: 6,
                required: true,
                label: "Investor Signature",
              },
              {
                type: "NAME",
                pageNumber: 12,
                x: 10,
                y: 68,
                width: 30,
                height: 4,
                required: true,
                label: "Printed Name",
              },
              {
                type: "DATE_SIGNED",
                pageNumber: 12,
                x: 10,
                y: 74,
                width: 20,
                height: 4,
                required: true,
                label: "Date",
              },
              {
                type: "CHECKBOX",
                pageNumber: 11,
                x: 10,
                y: 50,
                width: 4,
                height: 4,
                required: true,
                label: "I confirm I am an accredited investor",
              },
            ],
          },
        },
      });
      console.log(`  Created Subscription Agreement SignatureDocument: ${subAg.id}`);

      // Add sample LP as recipient for both documents (so the test LP sees them)
      const sampleLP = await prisma.user.findUnique({
        where: { email: "investor@fundroom.ai" },
      });

      if (sampleLP) {
        await prisma.signatureRecipient.create({
          data: {
            documentId: nda.id,
            name: sampleLP.name || "Sample Investor",
            email: sampleLP.email!,
            role: "SIGNER",
            signingOrder: 1,
            status: "PENDING",
            signingToken: randomBytes(32).toString("hex"),
          },
        });
        await prisma.signatureRecipient.create({
          data: {
            documentId: subAg.id,
            name: sampleLP.name || "Sample Investor",
            email: sampleLP.email!,
            role: "SIGNER",
            signingOrder: 1,
            status: "PENDING",
            signingToken: randomBytes(32).toString("hex"),
          },
        });
        console.log("  Added sample LP as signing recipient for NDA + Sub Agreement");
      }
    } else {
      console.log(
        `  Signature documents exist (${existingSignDocs.length} required docs)`,
      );
    }
  }

  // 13b. Seed Default Document Templates (HTML with merge fields)
  if (team && fund && !dryRun) {
    const existingTemplates = await prisma.documentTemplate.findMany({
      where: { teamId: team.id, isDefault: true },
    });

    if (existingTemplates.length === 0) {
      const templatesDir = path.join(process.cwd(), "templates");

      // Read HTML template files from disk
      let ndaHtml: string;
      let subAgHtml: string;
      try {
        ndaHtml = readFileSync(path.join(templatesDir, "nda-default.html"), "utf-8");
        subAgHtml = readFileSync(path.join(templatesDir, "subscription-agreement-default.html"), "utf-8");
      } catch {
        console.log("  WARN: Template HTML files not found in /templates/ — skipping DocumentTemplate seed");
        ndaHtml = "";
        subAgHtml = "";
      }

      if (ndaHtml && subAgHtml) {
        await prisma.documentTemplate.create({
          data: {
            name: "NDA / Confidentiality Agreement",
            documentType: "NDA",
            content: ndaHtml,
            version: 1,
            isActive: true,
            isDefault: true,
            templateSource: "PLATFORM",
            teamId: team.id,
            fundId: fund.id,
            createdBy: adminUser?.id || "seed",
          },
        });

        await prisma.documentTemplate.create({
          data: {
            name: "Subscription Agreement",
            documentType: "SUBSCRIPTION",
            content: subAgHtml,
            version: 1,
            isActive: true,
            isDefault: true,
            templateSource: "PLATFORM",
            teamId: team.id,
            fundId: fund.id,
            createdBy: adminUser?.id || "seed",
          },
        });
        console.log("  Created 2 DocumentTemplates (NDA + Subscription Agreement)");
      }
    } else {
      console.log(`  DocumentTemplates exist (${existingTemplates.length} default templates)`);
    }
  }

  // 14. Create FundroomActivation (paywall gate)
  if (team && !dryRun) {
    const existingActivation = await prisma.fundroomActivation.findFirst({
      where: { teamId: team.id },
    });

    if (!existingActivation) {
      await prisma.fundroomActivation.create({
        data: {
          teamId: team.id,
          status: "ACTIVE",
          activatedBy: adminUser?.id || "seed",
          activatedAt: new Date(),
          mode: "GP_FUND",
          ndaGateEnabled: true,
          kycRequired: true,
          accreditationRequired: true,
          wireInstructionsConfigured: true,
          documentsConfigured: true,
          brandingConfigured: true,
          setupProgress: {
            wire: true,
            docs: true,
            branding: true,
            fund: true,
            fundEconomics: true,
            raiseType: true,
            lpOnboarding: true,
            notifications: true,
            teamInvites: true,
          },
          setupCompletedAt: new Date(),
        },
      });
      console.log("  Created FundroomActivation (ACTIVE)");
    } else {
      console.log("  FundroomActivation exists");
    }
  }

  // 15. Create PlatformSettings (paywall bypass for MVP)
  if (!dryRun) {
    const existingSettings = await prisma.platformSettings.findFirst({
      where: { key: "global" },
    });

    if (!existingSettings) {
      await prisma.platformSettings.create({
        data: {
          key: "global",
          paywallEnforced: false,
          paywallBypassUntil: new Date(Date.now() + 90 * 86400000), // 90 days
          registrationOpen: true,
          maintenanceMode: false,
          updatedBy: adminUser?.id || "seed",
        },
      });
      console.log("  Created PlatformSettings (paywall bypassed for 90 days)");
    } else {
      console.log("  PlatformSettings exist");
    }
  }

  // 16. Create sample LP Documents at various review states
  if (fund && !dryRun) {
    const trustInvestor = await prisma.investor.findFirst({
      where: { user: { email: "trust-investor@example.com" } },
    });
    const partnerInvestor = await prisma.investor.findFirst({
      where: { user: { email: "partnership-investor@example.com" } },
    });

    if (trustInvestor && adminUser) {
      const existingDocs = await prisma.lPDocument.findMany({
        where: { investorId: trustInvestor.id, fundId: fund.id },
      });

      if (existingDocs.length === 0) {
        // Trust — approved doc
        await prisma.lPDocument.create({
          data: {
            investorId: trustInvestor.id,
            fundId: fund.id,
            title: "Trust Agreement — Williams Family Revocable Trust",
            documentType: "TRUST_DOCUMENTS",
            status: "APPROVED",
            storageKey: "s3://docs/williams-trust-agreement.pdf",
            storageType: "S3_PATH",
            originalFilename: "williams-trust-agreement.pdf",
            mimeType: "application/pdf",
            uploadedByUserId: trustInvestor.userId,
            uploadSource: "LP_UPLOADED",
            reviewedByUserId: adminUser.id,
            reviewedAt: new Date(Date.now() - 20 * 86400000),
            reviewNotes: "Trust documentation verified — all sections complete.",
          },
        });

        // Trust — approved accreditation doc
        await prisma.lPDocument.create({
          data: {
            investorId: trustInvestor.id,
            fundId: fund.id,
            title: "Accreditation Verification Letter",
            documentType: "ACCREDITATION_PROOF",
            status: "APPROVED",
            storageKey: "s3://docs/williams-accreditation.pdf",
            storageType: "S3_PATH",
            originalFilename: "williams-accreditation-letter.pdf",
            mimeType: "application/pdf",
            uploadedByUserId: trustInvestor.userId,
            uploadSource: "LP_UPLOADED",
            reviewedByUserId: adminUser.id,
            reviewedAt: new Date(Date.now() - 22 * 86400000),
          },
        });
        console.log("  Created 2 LP documents for Trust investor (APPROVED)");
      }
    }

    if (partnerInvestor && adminUser) {
      const existingDocs = await prisma.lPDocument.findMany({
        where: { investorId: partnerInvestor.id, fundId: fund.id },
      });

      if (existingDocs.length === 0) {
        // Partnership — pending review doc
        await prisma.lPDocument.create({
          data: {
            investorId: partnerInvestor.id,
            fundId: fund.id,
            title: "Partnership Agreement — Horizon Ventures LP",
            documentType: "FORMATION_DOCS",
            status: "UPLOADED_PENDING_REVIEW",
            storageKey: "s3://docs/horizon-partnership-agreement.pdf",
            storageType: "S3_PATH",
            originalFilename: "horizon-partnership-agreement.pdf",
            mimeType: "application/pdf",
            uploadedByUserId: partnerInvestor.userId,
            uploadSource: "LP_UPLOADED",
            lpNotes: "Partnership agreement executed in 2022. Please review Section 8 for GP authority.",
          },
        });

        // Partnership — revision requested doc
        await prisma.lPDocument.create({
          data: {
            investorId: partnerInvestor.id,
            fundId: fund.id,
            title: "Certificate of Good Standing",
            documentType: "OTHER",
            status: "REVISION_REQUESTED",
            storageKey: "s3://docs/horizon-good-standing-v1.pdf",
            storageType: "S3_PATH",
            originalFilename: "horizon-good-standing.pdf",
            mimeType: "application/pdf",
            uploadedByUserId: partnerInvestor.userId,
            uploadSource: "LP_UPLOADED",
            reviewedByUserId: adminUser.id,
            reviewedAt: new Date(Date.now() - 1 * 86400000),
            reviewNotes: "Certificate is from 2024. Please upload a current certificate (within 90 days).",
          },
        });
        console.log("  Created 2 LP documents for Partnership investor (PENDING + REVISION)");
      }
    }
  }

  // Summary
  console.log("\n  ==========================================");
  console.log("  Bermuda Franchise Group seed complete!\n");
  console.log("  Tenant Summary:");
  console.log(`    Organization: ${BFG_CONFIG.org.name}`);
  console.log(`    Slug:         ${BFG_CONFIG.org.slug}`);
  console.log(`    Team:         ${team?.name || "[dry run]"}`);
  console.log(`    Fund:         ${fund?.name || "[dry run]"}`);
  console.log(`    Admin:        ${BFG_CONFIG.adminEmail}`);
  console.log(`    Target:       $${BFG_CONFIG.fund.targetRaise.toLocaleString()}`);
  console.log(`    Min Invest:   $${BFG_CONFIG.fund.minimumInvestment.toLocaleString()}`);
  console.log(`    Tranches:     6 (90 total units)`);
  console.log("");
  console.log("  Demo Investors:");
  console.log("    LP 1: investor@fundroom.ai      — APPLIED (Individual)");
  console.log("    LP 2: demo-investor@example.com  — COMMITTED (LLC, $90K)");
  console.log("    LP 3: trust-investor@example.com — FUNDED (Trust, $180K)");
  console.log("    LP 4: ira-investor@example.com   — DOCS_APPROVED (IRA, $90K)");
  console.log("    LP 5: partnership-investor@...    — UNDER_REVIEW (Partnership, $270K)");
  console.log("    LP 6: wire-pending@example.com   — COMMITTED + wire proof ($90K)");
  console.log("    All LP passwords: Investor2026!");
  console.log("");
  console.log("  Demo Credentials:");
  console.log("    GP:  joe@bermudafranchisegroup.com / FundRoom2026!");
  console.log("    LP:  demo-investor@example.com / Investor2026!");

  if (team) {
    console.log(`\n    Team ID:  ${team.id}`);
  }
  if (fund) {
    console.log(`    Fund ID:  ${fund.id}`);
  }
  if (org) {
    console.log(`    Org ID:   ${org.id}`);
  }

  console.log("");
}

async function cleanBFGData() {
  const org = await prisma.organization.findUnique({
    where: { slug: BFG_CONFIG.org.slug },
  });

  if (!org) {
    console.log("  No BFG data found to clean.");
    return;
  }

  const teams = await prisma.team.findMany({
    where: { organizationId: org.id },
  });
  const teamIds = teams.map((t) => t.id);

  // Clean in dependency order
  for (const teamId of teamIds) {
    // Clean LP documents and transactions
    const funds = await prisma.fund.findMany({ where: { teamId } });
    const fundIds = funds.map((f) => f.id);

    if (fundIds.length > 0) {
      // Clean investors and related data
      const investors = await prisma.investor.findMany({
        where: { fundId: { in: fundIds } },
      });
      const investorIds = investors.map((i) => i.id);

      if (investorIds.length > 0) {
        await prisma.lPDocument.deleteMany({ where: { investorId: { in: investorIds } } });
        await prisma.transaction.deleteMany({ where: { investorId: { in: investorIds } } });
        await prisma.investment.deleteMany({ where: { investorId: { in: investorIds } } });
        await prisma.investor.deleteMany({ where: { id: { in: investorIds } } });
      }

      // Clean signature documents
      await prisma.signatureRecipient.deleteMany({
        where: { document: { fundId: { in: fundIds } } },
      });
      await prisma.signatureField.deleteMany({
        where: { document: { fundId: { in: fundIds } } },
      });
      await prisma.signatureDocument.deleteMany({ where: { fundId: { in: fundIds } } });
    }

    await prisma.documentTemplate.deleteMany({ where: { teamId } });
    await prisma.fundingRound.deleteMany({ where: { fund: { teamId } } });
    await prisma.fundPricingTier.deleteMany({ where: { fund: { teamId } } });
    await prisma.fundAggregate.deleteMany({ where: { fund: { teamId } } });
    await prisma.fundroomActivation.deleteMany({ where: { teamId } });
    await prisma.manualInvestment.deleteMany({ where: { teamId } });
    await prisma.link.deleteMany({ where: { dataroom: { teamId } } });
    await prisma.dataroomFolder.deleteMany({ where: { dataroom: { teamId } } });
    await prisma.dataroom.deleteMany({ where: { teamId } });
    await prisma.domain.deleteMany({ where: { teamId } });
    await prisma.fund.deleteMany({ where: { teamId } });
    await prisma.userTeam.deleteMany({ where: { teamId } });
  }

  // Clean platform settings
  await prisma.platformSettings.deleteMany({ where: { key: "global" } });

  await prisma.team.deleteMany({ where: { organizationId: org.id } });
  await prisma.organizationSecurityPolicy.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.organizationDefaults.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log("  Cleaned BFG organization and all related data.");
}

main()
  .catch((e) => {
    console.error("  Error seeding BFG data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
