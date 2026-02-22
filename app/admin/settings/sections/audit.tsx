"use client";

import { useState } from "react";
import { TierBadge, SaveButton } from "../shared";
import type { OrgDefaultsData, TierInfo } from "../shared";

export function AuditSection({
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
    auditLogRetentionDays: orgDefaults?.auditLogRetentionDays ?? 2555,
  });
  const [dirty, setDirty] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">Audit Log Retention</p>
          <p className="text-xs text-muted-foreground">
            SEC/FINRA requires 7 years minimum for regulated offerings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tierMap.auditLogRetentionDays && (
            <TierBadge source={tierMap.auditLogRetentionDays.source} />
          )}
          <select
            value={form.auditLogRetentionDays}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, auditLogRetentionDays: parseInt(e.target.value) }));
              if (!dirty) onDirty?.();
              setDirty(true);
            }}
            className="rounded-md border px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value={365}>1 year</option>
            <option value={1095}>3 years</option>
            <option value={1825}>5 years</option>
            <option value={2555}>7 years (recommended)</option>
            <option value={3650}>10 years</option>
          </select>
        </div>
      </div>
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
