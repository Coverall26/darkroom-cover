"use client";

import { useState } from "react";
import { ToggleRow, SaveButton } from "../shared";
import type { OrgDefaultsData } from "../shared";

export function NotificationsSection({
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
    notifyGpLpOnboardingStart: orgDefaults?.notifyGpLpOnboardingStart ?? true,
    notifyGpCommitment: orgDefaults?.notifyGpCommitment ?? true,
    notifyGpWireUpload: orgDefaults?.notifyGpWireUpload ?? true,
    notifyGpLpInactive: orgDefaults?.notifyGpLpInactive ?? true,
    notifyGpExternalDocUpload: orgDefaults?.notifyGpExternalDocUpload ?? true,
    notifyLpStepComplete: orgDefaults?.notifyLpStepComplete ?? true,
    notifyLpWireConfirm: orgDefaults?.notifyLpWireConfirm ?? true,
    notifyLpNewDocument: orgDefaults?.notifyLpNewDocument ?? true,
    notifyLpChangeRequest: orgDefaults?.notifyLpChangeRequest ?? true,
    notifyLpOnboardingReminder: orgDefaults?.notifyLpOnboardingReminder ?? true,
  });
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    if (!dirty) onDirty?.();
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          GP Notifications (emails sent to fund managers)
        </h3>
        <div className="mt-2 space-y-1">
          <ToggleRow
            label="LP Onboarding Started"
            description="Notify when a new LP begins the onboarding wizard"
            checked={form.notifyGpLpOnboardingStart}
            onChange={(v) => update({ notifyGpLpOnboardingStart: v })}
          />
          <ToggleRow
            label="New Commitment"
            description="Notify when an LP submits a commitment"
            checked={form.notifyGpCommitment}
            onChange={(v) => update({ notifyGpCommitment: v })}
          />
          <ToggleRow
            label="Wire Proof Uploaded"
            description="Notify when an LP uploads proof of wire transfer"
            checked={form.notifyGpWireUpload}
            onChange={(v) => update({ notifyGpWireUpload: v })}
          />
          <ToggleRow
            label="LP Inactive Alert"
            description="Notify when an LP has not progressed in onboarding"
            checked={form.notifyGpLpInactive}
            onChange={(v) => update({ notifyGpLpInactive: v })}
          />
          <ToggleRow
            label="External Document Upload"
            description="Notify when an LP uploads a document for review"
            checked={form.notifyGpExternalDocUpload}
            onChange={(v) => update({ notifyGpExternalDocUpload: v })}
          />
        </div>
      </div>
      <div className="border-t pt-4 dark:border-gray-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          LP Notifications (emails sent to investors)
        </h3>
        <div className="mt-2 space-y-1">
          <ToggleRow
            label="Step Completion Confirmation"
            description="Confirm to LP after each onboarding step completes"
            checked={form.notifyLpStepComplete}
            onChange={(v) => update({ notifyLpStepComplete: v })}
          />
          <ToggleRow
            label="Wire Confirmed"
            description="Notify LP when GP confirms their wire receipt"
            checked={form.notifyLpWireConfirm}
            onChange={(v) => update({ notifyLpWireConfirm: v })}
          />
          <ToggleRow
            label="New Document Available"
            description="Notify LP when a new document is uploaded to their vault"
            checked={form.notifyLpNewDocument}
            onChange={(v) => update({ notifyLpNewDocument: v })}
          />
          <ToggleRow
            label="Change Request"
            description="Notify LP when GP requests profile or document changes"
            checked={form.notifyLpChangeRequest}
            onChange={(v) => update({ notifyLpChangeRequest: v })}
          />
          <ToggleRow
            label="Onboarding Reminder"
            description="Send a reminder if LP has not completed onboarding"
            checked={form.notifyLpOnboardingReminder}
            onChange={(v) => update({ notifyLpOnboardingReminder: v })}
          />
        </div>
      </div>
      <SaveButton saving={saving} dirty={dirty} onClick={() => onSave(form)} />
    </div>
  );
}
