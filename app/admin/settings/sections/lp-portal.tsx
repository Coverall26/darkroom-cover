"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ToggleRow, SaveButton } from "../shared";
import type { OrgDefaultsData } from "../shared";

export function LPPortalSettingsSection({
  orgDefaults,
  saving,
  onSave,
  onDirty,
}: {
  orgDefaults: OrgDefaultsData | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onDirty?: () => void;
}) {
  const [form, setForm] = useState({
    allowExternalDocUpload: orgDefaults?.allowExternalDocUpload ?? true,
    allowGpDocUploadForLp: orgDefaults?.allowGpDocUploadForLp ?? true,
    requireGpApproval: orgDefaults?.requireGpApproval ?? true,
    accreditationMethod: orgDefaults?.accreditationMethod ?? "SELF_ACK",
    minimumInvestThreshold: orgDefaults?.minimumInvestThreshold ?? null as number | null,
  });
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    if (!dirty) onDirty?.();
    setDirty(true);
  };

  return (
    <div className="space-y-3">
      <ToggleRow
        label="LP Document Upload"
        description="Allow LPs to upload documents directly through the portal"
        checked={form.allowExternalDocUpload}
        onChange={(v) => update({ allowExternalDocUpload: v })}
      />
      <ToggleRow
        label="GP Upload on Behalf of LP"
        description="Allow GPs to upload documents on behalf of investors"
        checked={form.allowGpDocUploadForLp}
        onChange={(v) => update({ allowGpDocUploadForLp: v })}
      />
      <ToggleRow
        label="Require GP Approval"
        description="All LP submissions require explicit GP approval before advancing"
        checked={form.requireGpApproval}
        onChange={(v) => update({ requireGpApproval: v })}
      />
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">Accreditation Method</p>
          <p className="text-xs text-muted-foreground">
            How investors verify their accredited status
          </p>
        </div>
        <select
          value={form.accreditationMethod ?? "SELF_ACK"}
          onChange={(e) => update({ accreditationMethod: e.target.value })}
          className="rounded-md border px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="SELF_ACK">Self-Acknowledgment</option>
          <option value="SELF_ACK_MIN_INVEST">Self-Ack + Min Investment</option>
          <option value="THIRD_PARTY">Third-Party Verification</option>
          <option value="PERSONA_KYC" disabled>Persona KYC (Coming Soon)</option>
        </select>
      </div>
      {form.accreditationMethod === "SELF_ACK_MIN_INVEST" && (
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium">Minimum Investment Threshold</p>
            <p className="text-xs text-muted-foreground">
              Minimum amount required for self-acknowledgment accreditation
            </p>
          </div>
          <Input
            type="number"
            value={form.minimumInvestThreshold ?? ""}
            onChange={(e) =>
              update({
                minimumInvestThreshold: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            placeholder="$200,000"
            className="w-36 text-sm"
            min={0}
            max={100000000}
          />
        </div>
      )}
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
