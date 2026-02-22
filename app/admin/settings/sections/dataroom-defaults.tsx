"use client";

import { useState } from "react";
import { ToggleRow, SaveButton } from "../shared";
import type { OrgDefaultsData, TierInfo } from "../shared";

export function DataroomDefaultsSection({
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
    dataroomConversationsEnabled: orgDefaults?.dataroomConversationsEnabled ?? false,
    dataroomAllowBulkDownload: orgDefaults?.dataroomAllowBulkDownload ?? true,
    dataroomShowLastUpdated: orgDefaults?.dataroomShowLastUpdated ?? true,
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
        label="Q&A Conversations"
        description="Enable investor Q&A within datarooms"
        checked={form.dataroomConversationsEnabled}
        onChange={(v) => update({ dataroomConversationsEnabled: v })}
        tierSource={tierMap.dataroomConversationsEnabled?.source}
      />
      <ToggleRow
        label="Bulk Download"
        description="Allow visitors to download all files at once"
        checked={form.dataroomAllowBulkDownload}
        onChange={(v) => update({ dataroomAllowBulkDownload: v })}
        tierSource={tierMap.dataroomAllowBulkDownload?.source}
      />
      <ToggleRow
        label="Show Last Updated"
        description="Display document update timestamps"
        checked={form.dataroomShowLastUpdated}
        onChange={(v) => update({ dataroomShowLastUpdated: v })}
        tierSource={tierMap.dataroomShowLastUpdated?.source}
      />
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
