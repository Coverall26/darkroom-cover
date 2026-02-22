"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveButton } from "../shared";
import type { OrgData } from "../shared";

export function CompanySection({
  org,
  saving,
  onSave,
  onDirty,
}: {
  org: OrgData | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onDirty?: () => void;
}) {
  const [form, setForm] = useState({
    name: org?.name || "",
    description: org?.description || "",
    entityType: org?.entityType || "",
    phone: org?.phone || "",
    addressLine1: org?.addressLine1 || "",
    addressLine2: org?.addressLine2 || "",
    addressCity: org?.addressCity || "",
    addressState: org?.addressState || "",
    addressZip: org?.addressZip || "",
    addressCountry: org?.addressCountry || "US",
    companyDescription: org?.companyDescription || "",
    sector: org?.sector || "",
    geography: org?.geography || "",
    website: org?.website || "",
    foundedYear: org?.foundedYear || null as number | null,
  });
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    if (!dirty) onDirty?.();
    setDirty(true);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Organization Name</Label>
          <Input
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Entity Type</Label>
          <select
            value={form.entityType}
            onChange={(e) => update({ entityType: e.target.value })}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Not set</option>
            <option value="LLC">LLC</option>
            <option value="CORPORATION">Corporation</option>
            <option value="LP">Limited Partnership</option>
            <option value="GP_ENTITY">GP Entity</option>
            <option value="TRUST">Trust</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Phone</Label>
          <Input
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Founded Year</Label>
          <Input
            type="number"
            value={form.foundedYear ?? ""}
            onChange={(e) => update({ foundedYear: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="e.g. 2020"
            min={1900}
            max={new Date().getFullYear()}
            className="mt-1 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Address Line 1</Label>
        <Input
          value={form.addressLine1}
          onChange={(e) => update({ addressLine1: e.target.value })}
          placeholder="Street address"
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Address Line 2</Label>
        <Input
          value={form.addressLine2}
          onChange={(e) => update({ addressLine2: e.target.value })}
          placeholder="Suite, unit, etc. (optional)"
          className="mt-1 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">City</Label>
          <Input
            value={form.addressCity}
            onChange={(e) => update({ addressCity: e.target.value })}
            placeholder="City"
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">State</Label>
          <Input
            value={form.addressState}
            onChange={(e) => update({ addressState: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="ST"
            maxLength={2}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">ZIP</Label>
          <Input
            value={form.addressZip}
            onChange={(e) => update({ addressZip: e.target.value })}
            placeholder="12345"
            className="mt-1 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Country</Label>
          <Input
            value={form.addressCountry}
            onChange={(e) => update({ addressCountry: e.target.value })}
            placeholder="US"
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Geography</Label>
          <Input
            value={form.geography}
            onChange={(e) => update({ geography: e.target.value })}
            placeholder="e.g. North America"
            className="mt-1 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Sector</Label>
          <select
            value={form.sector}
            onChange={(e) => update({ sector: e.target.value })}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Not set</option>
            <option>Venture Capital</option>
            <option>Real Estate</option>
            <option>Private Equity</option>
            <option>Startup</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="https://..."
            className="mt-1 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Short Description</Label>
        <Input
          value={form.companyDescription}
          onChange={(e) => update({ companyDescription: e.target.value.slice(0, 280) })}
          placeholder="Brief description..."
          className="mt-1 text-sm"
        />
      </div>
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
