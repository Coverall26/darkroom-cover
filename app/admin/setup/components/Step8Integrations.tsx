"use client";

import { Switch } from "@/components/ui/switch";
import {
  FileSignature,
  Shield,
  Lock,
  Mail,
  CreditCard,
  Check,
  Clock,
  Settings,
  Fingerprint,
  Building,
  FileSpreadsheet,
  Bell,
} from "lucide-react";
import type { WizardData } from "../hooks/useWizardState";

const ACTIVE_INTEGRATIONS = [
  {
    name: "FundRoom Sign",
    desc: "Native e-signature. Zero external API cost.",
    icon: FileSignature,
  },
  {
    name: "Secure Document Storage",
    desc: "AES-256 encrypted. S3 + CloudFront with KMS.",
    icon: Lock,
  },
  {
    name: "Audit Logging",
    desc: "All actions tracked. IP, timestamp, user-agent, actor.",
    icon: Shield,
  },
  {
    name: "Email Notifications",
    desc: "Via Resend. Org-branded templates.",
    icon: Mail,
  },
  {
    name: "Manual Wire Transfer",
    desc: "Free. Always available.",
    icon: CreditCard,
  },
];

const PHASE2_INTEGRATIONS = [
  {
    name: "Persona KYC/AML",
    desc: "Automated identity verification for investors. Government ID + selfie verification with real-time results.",
    icon: Fingerprint,
    timeline: "Coming Q2 2026",
    phase: "Phase 2",
  },
  {
    name: "Stripe ACH",
    desc: "Accept ACH payments directly from investors. Lower fees than wire transfers with automated reconciliation.",
    icon: CreditCard,
    timeline: "Coming Q2 2026",
    phase: "Phase 2",
  },
  {
    name: "QuickBooks",
    desc: "Sync transactions, capital calls, and distributions to QuickBooks automatically.",
    icon: Building,
    timeline: "Coming Q3 2026",
    phase: "Phase 3",
  },
  {
    name: "Wolters Kluwer",
    desc: "Automated Form D filing and K-1 generation. SEC compliance on autopilot.",
    icon: FileSpreadsheet,
    timeline: "Coming Q3 2026",
    phase: "Phase 3",
  },
];

interface Step8Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step8Integrations({ data, updateField }: Step8Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Integrations &amp; Compliance
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Review your active services and configure compliance settings.
        </p>
      </div>

      {/* Active Integrations */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Active by Default
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIVE_INTEGRATIONS.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              >
                <div className="h-8 w-8 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {integration.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {integration.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase 2 / Phase 3 Integrations */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Upcoming Integrations
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PHASE2_INTEGRATIONS.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60 cursor-default"
              >
                <div className="h-8 w-8 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {integration.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {integration.timeline}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {integration.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <Bell size={12} aria-hidden="true" />
          You&apos;ll be notified when these integrations become available.
        </p>
      </div>

      {/* Compliance Settings */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Compliance Settings
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Audit Log Retention
            </label>
            <select
              value={data.auditRetention}
              onChange={(e) => updateField("auditRetention", e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              <option value="5">5 years</option>
              <option value="7">7 years (recommended)</option>
              <option value="10">10 years</option>
              <option value="99">Indefinite</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Export Format
            </label>
            <select
              value={data.exportFormat}
              onChange={(e) => updateField("exportFormat", e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              <option value="CSV">CSV</option>
              <option value="JSON">JSON</option>
              <option value="ZIP">ZIP (includes documents)</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Form D Filing Reminder
            </p>
            <p className="text-xs text-gray-500">
              Remind after first LP commitment to file Form D within 15 days.
            </p>
          </div>
          <Switch
            checked={data.formDReminder}
            onCheckedChange={(v) => updateField("formDReminder", v)}
          />
        </div>
      </div>
    </div>
  );
}
