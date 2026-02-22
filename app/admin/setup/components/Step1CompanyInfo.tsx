"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Shield, Info, Plus, Trash2, Users } from "lucide-react";
import { EncryptionBadge } from "@/components/ui/encryption-badge";
import type { WizardData } from "../hooks/useWizardState";

const ENTITY_TYPES = ["LLC", "Corporation", "LP", "GP Entity", "Trust", "Other"];
const RELATIONSHIP_TYPES = [
  "Executive Officer",
  "Director",
  "Promoter",
  "Control Person",
  "Managing Member",
  "General Partner",
];
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

interface Step1Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step1CompanyInfo({ data, updateField }: Step1Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Company Information
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Legal entity details. Required for SEC Form D filing.
        </p>
      </div>

      {/* Legal Name & Entity Type */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            Legal Company Name <span className="text-red-500">*</span>
          </Label>
          <Input
            placeholder="Acme Capital LLC"
            value={data.companyName}
            onChange={(e) => updateField("companyName", e.target.value)}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-gray-500">
            Full legal name as registered with state
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>
            Entity Type <span className="text-red-500">*</span>
          </Label>
          <select
            value={data.entityType}
            onChange={(e) => updateField("entityType", e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="">Select entity type</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* EIN & Year */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            EIN <span className="text-red-500">*</span>
            <EncryptionBadge variant="compact" />
          </Label>
          <Input
            placeholder="XX-XXXXXXX"
            value={data.ein}
            onChange={(e) => {
              // Format as XX-XXXXXXX
              const raw = e.target.value.replace(/\D/g, "").slice(0, 9);
              const formatted =
                raw.length > 2 ? `${raw.slice(0, 2)}-${raw.slice(2)}` : raw;
              updateField("ein", formatted);
            }}
            className="font-mono text-base sm:text-sm"
          />
          <p className="text-xs text-gray-500">
            Encrypted AES-256 at rest. Required for Form D.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>
            Year Incorporated <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            placeholder="2024"
            value={data.yearIncorporated}
            onChange={(e) => updateField("yearIncorporated", e.target.value)}
            min={1900}
            max={new Date().getFullYear()}
            className="text-base sm:text-sm"
          />
        </div>
      </div>

      {/* Jurisdiction & Previous Names */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            State of Formation <span className="text-red-500">*</span>
          </Label>
          <select
            value={data.jurisdiction}
            onChange={(e) => updateField("jurisdiction", e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Previous Names</Label>
          <Input
            placeholder="None"
            value={data.previousNames}
            onChange={(e) => updateField("previousNames", e.target.value)}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-gray-500">
            Form D requires any names used in past 5 years
          </p>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Principal Business Address
        </h3>
        <div className="space-y-1.5">
          <Label>
            Street Address <span className="text-red-500">*</span>
          </Label>
          <Input
            placeholder="123 Main Street, Suite 100"
            value={data.address}
            onChange={(e) => updateField("address", e.target.value)}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-gray-500">
            Physical address required. No PO Boxes.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>
              City <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Hamilton"
              value={data.city}
              onChange={(e) => updateField("city", e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              State <span className="text-red-500">*</span>
            </Label>
            <select
              value={data.state}
              onChange={(e) => updateField("state", e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>
              ZIP <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="10001"
              value={data.zip}
              onChange={(e) => updateField("zip", e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input
              value={data.country}
              onChange={(e) => updateField("country", e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Primary Contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Joe Smith"
              value={data.contactName}
              onChange={(e) => updateField("contactName", e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              type="email"
              placeholder="joe@company.com"
              value={data.contactEmail}
              onChange={(e) => updateField("contactEmail", e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Phone <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={data.contactPhone}
              onChange={(e) => updateField("contactPhone", e.target.value)}
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-gray-500">Required for Form D</p>
          </div>
        </div>
      </div>

      {/* Related Persons — Form D Section 3 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Users size={16} className="text-gray-400" />
              Related Persons
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Form D Section 3 — Executive officers, directors, and promoters associated with the offering.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateField("relatedPersons", [
                ...data.relatedPersons,
                { name: "", title: "", relationship: "" },
              ])
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#0066FF] border border-[#0066FF] rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors min-h-[36px]"
          >
            <Plus size={14} />
            Add Person
          </button>
        </div>

        {data.relatedPersons.length === 0 && (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-4 py-3">
            <Info size={14} className="text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500">
              No related persons added. Click "Add Person" to list executive officers, directors, or promoters.
            </p>
          </div>
        )}

        {data.relatedPersons.map((person, idx) => (
          <div
            key={idx}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end rounded-md border dark:border-gray-700 p-3"
          >
            <div className="space-y-1">
              <Label className="text-xs">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Jane Doe"
                value={person.name}
                onChange={(e) => {
                  const updated = [...data.relatedPersons];
                  updated[idx] = { ...updated[idx], name: e.target.value };
                  updateField("relatedPersons", updated);
                }}
                className="text-base sm:text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="Managing Director"
                value={person.title}
                onChange={(e) => {
                  const updated = [...data.relatedPersons];
                  updated[idx] = { ...updated[idx], title: e.target.value };
                  updateField("relatedPersons", updated);
                }}
                className="text-base sm:text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Relationship <span className="text-red-500">*</span>
              </Label>
              <select
                value={person.relationship}
                onChange={(e) => {
                  const updated = [...data.relatedPersons];
                  updated[idx] = { ...updated[idx], relationship: e.target.value };
                  updateField("relatedPersons", updated);
                }}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="">Select</option>
                {RELATIONSHIP_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                const updated = data.relatedPersons.filter((_, i) => i !== idx);
                updateField("relatedPersons", updated);
              }}
              className="flex items-center justify-center h-10 w-10 text-gray-400 hover:text-red-500 transition-colors min-h-[44px]"
              aria-label={`Remove ${person.name || "person"}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Bad Actor Certification */}
      <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/30 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Rule 506(d) — Bad Actor Certification
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                This certification is individually timestamped and immutably audit-logged for SEC compliance.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer group">
              <Checkbox
                checked={data.badActorCertified}
                onCheckedChange={(checked) =>
                  updateField("badActorCertified", checked === true)
                }
                className="mt-0.5 h-5 w-5"
              />
              <span className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                I certify that no covered person associated with this offering
                (as defined in Rule 506(d) of Regulation D) is subject to
                disqualification.{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
            {data.badActorCertified && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <Info size={14} />
                Certified — timestamp and IP will be recorded on save
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
