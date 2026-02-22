"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToggleRow, SaveButton } from "../shared";
import type { OrgDefaultsData, TierInfo } from "../shared";

export function LPOnboardingSection({
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
    accreditationRequired: orgDefaults?.fundroomAccreditationRequired ?? true,
    kycRequired: orgDefaults?.fundroomKycRequired ?? true,
    stagedCommitmentsEnabled: orgDefaults?.fundroomStagedCommitmentsEnabled ?? false,
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
        label="NDA Required"
        description="LP must sign NDA before viewing fund documents"
        checked={form.ndaGateEnabled}
        onChange={(v) => update({ ndaGateEnabled: v })}
        tierSource={tierMap.ndaGateEnabled?.source}
      />
      <ToggleRow
        label="Accreditation Verification"
        description="Self-acknowledgment or third-party verification"
        checked={form.accreditationRequired}
        onChange={(v) => update({ accreditationRequired: v })}
        tierSource={tierMap.accreditationRequired?.source}
      />
      <div className="relative">
        <ToggleRow
          label="KYC Provider (Persona)"
          description="Require KYC/AML identity verification"
          checked={form.kycRequired}
          onChange={(v) => update({ kycRequired: v })}
          tierSource={tierMap.kycRequired?.source}
        />
        <Badge variant="outline" className="absolute top-2 right-14 text-[10px] border-amber-500/30 text-amber-400">
          Coming Soon
        </Badge>
      </div>
      <ToggleRow
        label="Staged Commitments"
        description="Allow multi-tranche capital commitments"
        checked={form.stagedCommitmentsEnabled}
        onChange={(v) => update({ stagedCommitmentsEnabled: v })}
        tierSource={tierMap.stagedCommitmentsEnabled?.source}
      />
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
