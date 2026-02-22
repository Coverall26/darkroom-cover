"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ToggleRow, TierBadge, SaveButton } from "../shared";
import type { OrgDefaultsData, TierInfo } from "../shared";

export function LinkDefaultsSection({
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
    linkEmailProtected: orgDefaults?.linkEmailProtected ?? true,
    linkAllowDownload: orgDefaults?.linkAllowDownload ?? true,
    linkEnableNotifications: orgDefaults?.linkEnableNotifications ?? true,
    linkEnableWatermark: orgDefaults?.linkEnableWatermark ?? false,
    linkPasswordRequired: orgDefaults?.linkPasswordRequired ?? false,
    linkExpirationDays: orgDefaults?.linkExpirationDays ?? null as number | null,
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
        label="Email Gate"
        description="Require email to access shared links"
        checked={form.linkEmailProtected}
        onChange={(v) => update({ linkEmailProtected: v })}
        tierSource={tierMap.linkEmailProtected?.source}
      />
      <ToggleRow
        label="Allow Downloads"
        description="Let visitors download documents"
        checked={form.linkAllowDownload}
        onChange={(v) => update({ linkAllowDownload: v })}
        tierSource={tierMap.linkAllowDownload?.source}
      />
      <ToggleRow
        label="Access Notifications"
        description="Email GP when a link is accessed"
        checked={form.linkEnableNotifications}
        onChange={(v) => update({ linkEnableNotifications: v })}
        tierSource={tierMap.linkEnableNotifications?.source}
      />
      <ToggleRow
        label="Dynamic Watermark"
        description="Overlay visitor email on viewed documents"
        checked={form.linkEnableWatermark}
        onChange={(v) => update({ linkEnableWatermark: v })}
        tierSource={tierMap.linkEnableWatermark?.source}
      />
      <ToggleRow
        label="Password Protection"
        description="Require password to access links"
        checked={form.linkPasswordRequired}
        onChange={(v) => update({ linkPasswordRequired: v })}
        tierSource={tierMap.linkPasswordRequired?.source}
      />
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">Link Expiration (days)</p>
          <p className="text-xs text-muted-foreground">
            Auto-expire links after N days (empty = no expiry)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tierMap.linkExpirationDays && <TierBadge source={tierMap.linkExpirationDays.source} />}
          <Input
            type="number"
            value={form.linkExpirationDays ?? ""}
            onChange={(e) => update({
              linkExpirationDays: e.target.value ? parseInt(e.target.value) : null,
            })}
            placeholder="No expiry"
            className="w-28 text-sm"
            min={0}
            max={365}
          />
        </div>
      </div>
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
