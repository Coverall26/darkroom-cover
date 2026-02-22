/**
 * Setup CRM Stripe Products & Prices
 *
 * One-time script to create CRM subscription products and prices in Stripe.
 * Run after setting STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_LIVE for production).
 *
 * Usage:
 *   npx ts-node scripts/setup-stripe-crm-products.ts
 *   npx ts-node scripts/setup-stripe-crm-products.ts --live   # Production
 *
 * After running, copy the output price IDs to your environment variables:
 *   STRIPE_CRM_PRO_MONTHLY_PRICE_ID=price_xxx
 *   STRIPE_CRM_PRO_YEARLY_PRICE_ID=price_xxx
 *   STRIPE_FUNDROOM_MONTHLY_PRICE_ID=price_xxx
 *   STRIPE_FUNDROOM_YEARLY_PRICE_ID=price_xxx
 *   STRIPE_AI_CRM_MONTHLY_PRICE_ID=price_xxx
 *   STRIPE_AI_CRM_YEARLY_PRICE_ID=price_xxx
 */

import Stripe from "stripe";

const isLive = process.argv.includes("--live");

const apiKey = isLive
  ? process.env.STRIPE_SECRET_KEY_LIVE
  : process.env.STRIPE_SECRET_KEY;

if (!apiKey) {
  console.error(
    `Missing ${isLive ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY"} environment variable.`,
  );
  process.exit(1);
}

const stripe = new Stripe(apiKey, {
  apiVersion: "2024-06-20",
  appInfo: { name: "FundRoom CRM Setup", version: "1.0.0" },
});

interface ProductSpec {
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: {
    nickname: string;
    unitAmount: number; // cents
    interval: "month" | "year";
    envVar: string;
    trialDays?: number;
  }[];
}

const PRODUCTS: ProductSpec[] = [
  {
    name: "FundRoom CRM Pro",
    description: "Full CRM with Kanban, outreach queue, email tracking, and 25 e-sigs/mo",
    metadata: { tier: "CRM_PRO", system: "crm" },
    prices: [
      {
        nickname: "CRM Pro Monthly",
        unitAmount: 2000,
        interval: "month",
        envVar: "STRIPE_CRM_PRO_MONTHLY_PRICE_ID",
      },
      {
        nickname: "CRM Pro Yearly",
        unitAmount: 19200, // $16/mo × 12 = $192/yr
        interval: "year",
        envVar: "STRIPE_CRM_PRO_YEARLY_PRICE_ID",
      },
    ],
  },
  {
    name: "FundRoom Complete",
    description:
      "Complete fund operations — unlimited contacts, e-sigs, LP onboarding, compliance pipeline",
    metadata: { tier: "FUNDROOM", system: "crm" },
    prices: [
      {
        nickname: "FundRoom Monthly",
        unitAmount: 7900,
        interval: "month",
        envVar: "STRIPE_FUNDROOM_MONTHLY_PRICE_ID",
      },
      {
        nickname: "FundRoom Yearly",
        unitAmount: 75600, // $63/mo × 12 = $756/yr
        interval: "year",
        envVar: "STRIPE_FUNDROOM_YEARLY_PRICE_ID",
      },
    ],
  },
  {
    name: "FundRoom AI CRM Add-on",
    description: "AI-powered drafts, sequences, investor digest — stacks on CRM Pro or FundRoom",
    metadata: { addon: "AI_CRM", system: "crm" },
    prices: [
      {
        nickname: "AI CRM Monthly",
        unitAmount: 4900,
        interval: "month",
        envVar: "STRIPE_AI_CRM_MONTHLY_PRICE_ID",
        trialDays: 14,
      },
      {
        nickname: "AI CRM Yearly",
        unitAmount: 46800, // $39/mo × 12 = $468/yr
        interval: "year",
        envVar: "STRIPE_AI_CRM_YEARLY_PRICE_ID",
        trialDays: 14,
      },
    ],
  },
];

async function main() {
  console.log(`\n🔧 Setting up CRM Stripe products (${isLive ? "LIVE" : "TEST"} mode)\n`);

  const envVars: Record<string, string> = {};

  for (const spec of PRODUCTS) {
    console.log(`Creating product: ${spec.name}`);

    // Check if product already exists (by metadata)
    const existing = await stripe.products.search({
      query: `metadata["system"]:"crm" AND metadata["tier"]:"${spec.metadata.tier ?? spec.metadata.addon}"`,
    });

    let product: Stripe.Product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`  → Found existing product: ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: spec.name,
        description: spec.description,
        metadata: spec.metadata,
      });
      console.log(`  → Created product: ${product.id}`);
    }

    for (const priceSpec of spec.prices) {
      // Check for existing price with same nickname on this product
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
        limit: 10,
      });

      const existingPrice = existingPrices.data.find(
        (p) => p.nickname === priceSpec.nickname,
      );

      let price: Stripe.Price;
      if (existingPrice) {
        price = existingPrice;
        console.log(`  → Found existing price: ${price.id} (${priceSpec.nickname})`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: priceSpec.unitAmount,
          currency: "usd",
          recurring: { interval: priceSpec.interval },
          nickname: priceSpec.nickname,
          metadata: {
            system: "crm",
            ...(priceSpec.trialDays ? { trial_days: String(priceSpec.trialDays) } : {}),
          },
        });
        console.log(`  → Created price: ${price.id} (${priceSpec.nickname})`);
      }

      envVars[priceSpec.envVar] = price.id;
    }

    console.log("");
  }

  // Output environment variables
  console.log("━".repeat(60));
  console.log("Add these to your .env / Vercel environment:\n");
  for (const [key, value] of Object.entries(envVars)) {
    console.log(`${key}=${value}`);
  }
  console.log("\n" + "━".repeat(60));
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
