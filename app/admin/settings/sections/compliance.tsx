"use client";

import { useState } from "react";
import { ToggleRow, SaveButton } from "../shared";
import type { OrgDefaultsData, TierInfo } from "../shared";

export function ComplianceSection({
  orgDefaults,
  tierMap,
  saving,
  onSave,
  onDirty,
}: {
  orgDefaults: OrgDefaultsData | null;
  tierMap: Record<string, TierInfo>;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onDirty?: () => void;
}) {
  const [form, setForm] = useState({
    ndaGateEnabled: orgDefaults?.fundroomNdaGateEnabled ?? true,
    kycRequired: orgDefaults?.fundroomKycRequired ?? true,
    accreditationRequired: orgDefaults?.fundroomAccreditationRequired ?? true,
    requireMfa: orgDefaults?.requireMfa ?? false,
  });
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    if (!dirty) onDirty?.();
    setDirty(true);
  };

  return (
    <div className="space-y-1">
      <ToggleRow
        label="NDA Gate Required"
        description="Require NDA signature before LP accesses fund documents"
        checked={form.ndaGateEnabled}
        onChange={(v) => update({ ndaGateEnabled: v })}
        tierSource={tierMap.ndaGateEnabled?.source}
      />
      <ToggleRow
        label="Accreditation Required"
        description="Verify accredited investor status (Rule 506(c))"
        checked={form.accreditationRequired}
        onChange={(v) => update({ accreditationRequired: v })}
        tierSource={tierMap.accreditationRequired?.source}
      />
      <ToggleRow
        label="KYC/AML Verification"
        description="Identity verification via Persona"
        checked={form.kycRequired}
        onChange={(v) => update({ kycRequired: v })}
        tierSource={tierMap.kycRequired?.source}
      />
      <ToggleRow
        label="Multi-Factor Auth"
        description="Require MFA for all team members"
        checked={form.requireMfa}
        onChange={(v) => update({ requireMfa: v })}
        tierSource={tierMap.requireMfa?.source}
      />
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
