/**
 * Tests for Stripe CRM Webhook: Invoice & Subscription Created Events
 *
 * Covers:
 *   - invoice.payment_failed — Sets PAST_DUE status, resolves orgId from invoice or subscription metadata
 *   - invoice.paid — Clears PAST_DUE → ACTIVE (only when PAST_DUE), resolves orgId same as above
 *   - customer.subscription.created — Handles base plan and AI_CRM add-on creation
 *   - Webhook signature verification failure
 */

// ---------------------------------------------------------------------------
// Mock modules (must be before imports)
// ---------------------------------------------------------------------------

const mockStripeSubscriptions = {
  retrieve: jest.fn(),
};
const mockStripeWebhooks = {
  constructEvent: jest.fn(),
};

jest.mock("@/ee/stripe", () => ({
  stripeInstance: jest.fn(() => ({
    subscriptions: mockStripeSubscriptions,
    webhooks: mockStripeWebhooks,
  })),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/tier/crm-tier", () => ({
  invalidateTierCache: jest.fn(),
}));

jest.mock("@/lib/stripe/crm-products", () => ({
  getCrmPlanFromPriceId: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const prisma = require("@/lib/prisma").default;
const { reportError } = require("@/lib/error");
const { invalidateTierCache } = require("@/lib/tier/crm-tier");
const { getCrmPlanFromPriceId } = require("@/lib/stripe/crm-products");
const { logAuditEvent } = require("@/lib/audit/audit-logger");
const { publishServerEvent } = require("@/lib/tracking/server-events");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookRequest(body: string, sig?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sig !== undefined) {
    headers["stripe-signature"] = sig;
  }
  return new Request("http://localhost:5000/api/webhooks/stripe-crm", {
    method: "POST",
    headers,
    body,
  }) as unknown as Request;
}

/**
 * Build a mock Stripe invoice event object.
 */
function makeInvoiceEvent(
  type: "invoice.payment_failed" | "invoice.paid",
  overrides: {
    invoiceId?: string;
    invoiceMetadata?: Record<string, string> | null;
    subscription?: string | null;
    amountDue?: number;
    amountPaid?: number;
    attemptCount?: number;
  } = {},
) {
  return {
    type,
    id: `evt_${type.replace(".", "_")}_${Date.now()}`,
    data: {
      object: {
        id: overrides.invoiceId ?? "in_test_123",
        metadata: overrides.invoiceMetadata ?? null,
        subscription: overrides.subscription ?? null,
        amount_due: overrides.amountDue ?? 2000,
        amount_paid: overrides.amountPaid ?? 0,
        attempt_count: overrides.attemptCount ?? 1,
      },
    },
  };
}

/**
 * Build a mock Stripe subscription.created event object.
 */
function makeSubscriptionCreatedEvent(overrides: {
  subscriptionId?: string;
  metadata?: Record<string, string>;
  priceId?: string;
  customer?: string;
  trialEnd?: number | null;
} = {}) {
  return {
    type: "customer.subscription.created",
    id: `evt_sub_created_${Date.now()}`,
    data: {
      object: {
        id: overrides.subscriptionId ?? "sub_created_123",
        metadata: overrides.metadata ?? { system: "crm", orgId: "org-sub-created" },
        items: {
          data: [
            {
              price: {
                id: overrides.priceId ?? "price_crm_pro_monthly_test",
              },
            },
          ],
        },
        customer: overrides.customer ?? "cus_sub_created",
        trial_end: overrides.trialEnd ?? null,
        status: "active",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let POST: typeof import("@/app/api/webhooks/stripe-crm/route").POST;

beforeAll(async () => {
  const mod = await import("@/app/api/webhooks/stripe-crm/route");
  POST = mod.POST;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_CRM_WEBHOOK_SECRET = "whsec_test_crm_invoices";
});

afterEach(() => {
  delete process.env.STRIPE_CRM_WEBHOOK_SECRET;
});

// ===========================================================================
// 1. invoice.payment_failed
// ===========================================================================

describe("invoice.payment_failed", () => {
  it("sets PAST_DUE when orgId is in invoice metadata", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", {
      invoiceMetadata: { orgId: "org-inv-meta" },
      amountDue: 7900,
      attemptCount: 2,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);

    // Should update org to PAST_DUE
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-inv-meta" },
      data: { subscriptionStatus: "PAST_DUE" },
    });

    // Should invalidate tier cache
    expect(invalidateTierCache).toHaveBeenCalledWith("org-inv-meta");

    // Should publish analytics event
    expect(publishServerEvent).toHaveBeenCalledWith("crm_payment_failed", {
      orgId: "org-inv-meta",
      source: event.data.object.id,
    });

    // Should log audit event
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CRM_PAYMENT_FAILED",
        resourceType: "Organization",
        resourceId: "org-inv-meta",
        metadata: expect.objectContaining({
          invoiceId: event.data.object.id,
          amountDue: 7900,
          attemptCount: 2,
        }),
      }),
    );
  });

  it("resolves orgId from subscription metadata when not in invoice metadata", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", {
      invoiceMetadata: null,
      subscription: "sub_lookup_123",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    // Mock stripe.subscriptions.retrieve to return CRM subscription with orgId
    mockStripeSubscriptions.retrieve.mockResolvedValue({
      metadata: { system: "crm", orgId: "org-from-sub" },
    });

    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should have looked up the subscription
    expect(mockStripeSubscriptions.retrieve).toHaveBeenCalledWith("sub_lookup_123");

    // Should update org from subscription metadata
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-from-sub" },
      data: { subscriptionStatus: "PAST_DUE" },
    });

    expect(invalidateTierCache).toHaveBeenCalledWith("org-from-sub");
    expect(publishServerEvent).toHaveBeenCalledWith("crm_payment_failed", expect.objectContaining({
      orgId: "org-from-sub",
    }));
  });

  it("returns early for non-CRM subscription (system !== 'crm')", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", {
      invoiceMetadata: null,
      subscription: "sub_saas_456",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    // Subscription metadata does NOT have system: "crm"
    mockStripeSubscriptions.retrieve.mockResolvedValue({
      metadata: { system: "saas", orgId: "org-saas" },
    });

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT update any organization
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
    expect(publishServerEvent).not.toHaveBeenCalled();
  });

  it("returns early when no orgId can be resolved (no metadata, no subscription)", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", {
      invoiceMetadata: null,
      subscription: null,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT update any organization
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
    expect(publishServerEvent).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns early when subscription retrieve fails", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", {
      invoiceMetadata: null,
      subscription: "sub_broken",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    // Subscription lookup throws
    mockStripeSubscriptions.retrieve.mockRejectedValue(
      new Error("Stripe API unavailable"),
    );

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT update any organization — graceful fallback
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. invoice.paid
// ===========================================================================

describe("invoice.paid", () => {
  it("recovers PAST_DUE to ACTIVE", async () => {
    const event = makeInvoiceEvent("invoice.paid", {
      invoiceMetadata: { orgId: "org-past-due" },
      amountPaid: 7900,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    // Organization is currently PAST_DUE
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
    });
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should look up the org to check current status
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org-past-due" },
      select: { subscriptionStatus: true },
    });

    // Should set status to ACTIVE
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-past-due" },
      data: { subscriptionStatus: "ACTIVE" },
    });

    // Should invalidate tier cache
    expect(invalidateTierCache).toHaveBeenCalledWith("org-past-due");

    // Should publish recovery analytics
    expect(publishServerEvent).toHaveBeenCalledWith("crm_payment_recovered", {
      orgId: "org-past-due",
      source: event.data.object.id,
    });

    // Should log audit event
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CRM_PAYMENT_RECOVERED",
        resourceType: "Organization",
        resourceId: "org-past-due",
        metadata: expect.objectContaining({
          invoiceId: event.data.object.id,
          amountPaid: 7900,
        }),
      }),
    );
  });

  it("does NOT change ACTIVE status (only clears PAST_DUE)", async () => {
    const event = makeInvoiceEvent("invoice.paid", {
      invoiceMetadata: { orgId: "org-already-active" },
      amountPaid: 2000,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    // Organization is already ACTIVE — normal renewal payment
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
    });

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should look up the org
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org-already-active" },
      select: { subscriptionStatus: true },
    });

    // Should NOT call update — status is already ACTIVE, not PAST_DUE
    expect(prisma.organization.update).not.toHaveBeenCalled();

    // Should NOT invalidate cache or publish analytics
    expect(invalidateTierCache).not.toHaveBeenCalled();
    expect(publishServerEvent).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns early when no orgId can be resolved", async () => {
    const event = makeInvoiceEvent("invoice.paid", {
      invoiceMetadata: null,
      subscription: null,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT look up or update any organization
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
  });

  it("resolves orgId from subscription metadata when not in invoice metadata", async () => {
    const event = makeInvoiceEvent("invoice.paid", {
      invoiceMetadata: null,
      subscription: "sub_paid_lookup",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    mockStripeSubscriptions.retrieve.mockResolvedValue({
      metadata: { system: "crm", orgId: "org-paid-via-sub" },
    });

    prisma.organization.findUnique.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
    });
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    expect(mockStripeSubscriptions.retrieve).toHaveBeenCalledWith("sub_paid_lookup");
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org-paid-via-sub" },
      select: { subscriptionStatus: true },
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-paid-via-sub" },
      data: { subscriptionStatus: "ACTIVE" },
    });
    expect(invalidateTierCache).toHaveBeenCalledWith("org-paid-via-sub");
  });

  it("does NOT change other statuses like CANCELED", async () => {
    const event = makeInvoiceEvent("invoice.paid", {
      invoiceMetadata: { orgId: "org-canceled" },
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    prisma.organization.findUnique.mockResolvedValue({
      subscriptionStatus: "CANCELED",
    });

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT update — only PAST_DUE gets cleared
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. customer.subscription.created
// ===========================================================================

describe("customer.subscription.created", () => {
  it("handles base plan creation (CRM_PRO)", async () => {
    const event = makeSubscriptionCreatedEvent({
      subscriptionId: "sub_new_crm_pro",
      metadata: { system: "crm", orgId: "org-new-pro" },
      priceId: "price_crm_pro_monthly_test",
      customer: "cus_new_pro",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    getCrmPlanFromPriceId.mockReturnValue({ slug: "CRM_PRO", period: "monthly" });
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should update organization with base plan
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-new-pro" },
      data: {
        stripeCustomerId: "cus_new_pro",
        subscriptionTier: "CRM_PRO",
        stripeSubscriptionId: "sub_new_crm_pro",
        subscriptionStatus: "ACTIVE",
      },
    });

    // Should invalidate tier cache
    expect(invalidateTierCache).toHaveBeenCalledWith("org-new-pro");

    // Should log audit event with source: "direct_api"
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CRM_SUBSCRIPTION_CREATED",
        resourceType: "Organization",
        resourceId: "org-new-pro",
        metadata: expect.objectContaining({
          plan: "CRM_PRO",
          subscriptionId: "sub_new_crm_pro",
          source: "direct_api",
        }),
      }),
    );
  });

  it("handles AI_CRM add-on creation with trial", async () => {
    const trialEnd = Math.floor(Date.now() / 1000) + 86400 * 14; // 14 days from now

    const event = makeSubscriptionCreatedEvent({
      subscriptionId: "sub_ai_addon_new",
      metadata: { system: "crm", orgId: "org-ai-new" },
      priceId: "price_ai_crm_monthly_test",
      customer: "cus_ai_new",
      trialEnd,
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    getCrmPlanFromPriceId.mockReturnValue({ slug: "AI_CRM", period: "monthly" });
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should update organization with AI add-on fields
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-ai-new" },
      data: {
        stripeCustomerId: "cus_ai_new",
        aiCrmEnabled: true,
        stripeAiSubscriptionId: "sub_ai_addon_new",
        aiCrmTrialEndsAt: new Date(trialEnd * 1000),
      },
    });

    expect(invalidateTierCache).toHaveBeenCalledWith("org-ai-new");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "CRM_SUBSCRIPTION_CREATED",
        metadata: expect.objectContaining({
          plan: "AI_CRM",
          subscriptionId: "sub_ai_addon_new",
          source: "direct_api",
        }),
      }),
    );
  });

  it("returns early for non-CRM subscription (system !== 'crm')", async () => {
    const event = makeSubscriptionCreatedEvent({
      metadata: { system: "saas", orgId: "org-saas-sub" },
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should NOT update organization or call any side effects
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(getCrmPlanFromPriceId).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns early when orgId is missing from metadata", async () => {
    const event = makeSubscriptionCreatedEvent({
      metadata: { system: "crm" }, // no orgId
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
  });

  it("returns early when getCrmPlanFromPriceId returns null", async () => {
    const event = makeSubscriptionCreatedEvent({
      metadata: { system: "crm", orgId: "org-unknown-price" },
      priceId: "price_unknown_xxx",
    });

    mockStripeWebhooks.constructEvent.mockReturnValue(event);
    getCrmPlanFromPriceId.mockReturnValue(null);

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(invalidateTierCache).not.toHaveBeenCalled();
  });

  it("handles customer as object (not string)", async () => {
    const event = makeSubscriptionCreatedEvent({
      subscriptionId: "sub_obj_cust",
      metadata: { system: "crm", orgId: "org-obj-cust" },
      priceId: "price_fundroom_monthly_test",
    });
    // Override customer to be an object instead of string
    (event.data.object as any).customer = { id: "cus_obj_123" };

    mockStripeWebhooks.constructEvent.mockReturnValue(event);
    getCrmPlanFromPriceId.mockReturnValue({ slug: "FUNDROOM", period: "monthly" });
    prisma.organization.update.mockResolvedValue({});

    const res = await POST(makeWebhookRequest("{}", "valid-sig") as any);

    expect(res.status).toBe(200);

    // Should resolve customerId from object.id
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeCustomerId: "cus_obj_123",
        }),
      }),
    );
  });
});

// ===========================================================================
// 4. Webhook signature verification
// ===========================================================================

describe("Webhook signature verification", () => {
  it("returns 400 when signature verification fails", async () => {
    mockStripeWebhooks.constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeWebhookRequest("{}", "bad-sig") as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Webhook signature verification failed");

    // Should report the error
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        path: "/api/webhooks/stripe-crm",
        action: "webhook_signature_verification",
      }),
    );
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    // Create request WITHOUT stripe-signature header
    const req = new Request("http://localhost:5000/api/webhooks/stripe-crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }) as unknown as Request;

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("stripe-signature");
  });
});
