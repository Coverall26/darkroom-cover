"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveButton } from "../shared";
import type { OrgData } from "../shared";

export function BrandingSection({
  org,
  team,
  saving,
  onSave,
  onDirty,
}: {
  org: OrgData | null;
  team: { emailFromName: string | null };
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onDirty?: () => void;
}) {
  const [form, setForm] = useState({
    brandColor: org?.brandColor || "#2563eb",
    accentColor: org?.accentColor || "#1e40af",
    emailSenderName: team?.emailFromName || "",
  });
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    if (!dirty) onDirty?.();
    setDirty(true);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Primary Color</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={form.brandColor}
              onChange={(e) => update({ brandColor: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded border dark:border-gray-700"
            />
            <Input
              value={form.brandColor}
              onChange={(e) => update({ brandColor: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Accent Color</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => update({ accentColor: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded border dark:border-gray-700"
            />
            <Input
              value={form.accentColor}
              onChange={(e) => update({ accentColor: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Email Sender Name</Label>
        <Input
          value={form.emailSenderName}
          onChange={(e) => update({ emailSenderName: e.target.value })}
          placeholder="Your Organization"
          className="mt-1 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          &quot;From&quot; name in investor emails
        </p>
      </div>
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
