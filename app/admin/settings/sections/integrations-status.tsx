"use client";

import { Check } from "lucide-react";

const ACTIVE_ITEMS = [
  { name: "FundRoom Sign", desc: "Native e-signature — built-in, zero cost", icon: "signature" },
  { name: "AES-256 Encryption", desc: "Document and data encryption at rest", icon: "lock" },
  { name: "Audit Logging", desc: "Immutable audit trail for SEC compliance", icon: "shield" },
  { name: "Resend Email", desc: "Org-branded transactional email", icon: "mail" },
  { name: "Manual Wire Transfer", desc: "Wire instructions + proof upload", icon: "wire" },
];

const UPCOMING_ITEMS = [
  { name: "Persona KYC", desc: "Automated identity verification for investors", timeline: "Q2 2026" },
  { name: "Stripe ACH", desc: "Accept ACH payments directly from investors", timeline: "Q2 2026" },
  { name: "QuickBooks", desc: "Sync transactions to QuickBooks automatically", timeline: "Q3 2026" },
  { name: "Wolters Kluwer", desc: "Automated Form D filing and K-1 generation", timeline: "Q3 2026" },
];

export function IntegrationsStatusCard() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {ACTIVE_ITEMS.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Active
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
        {UPCOMING_ITEMS.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-lg border p-3 opacity-60 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {item.timeline}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;ll be notified when upcoming integrations become available for your organization.
      </p>
    </div>
  );
}
