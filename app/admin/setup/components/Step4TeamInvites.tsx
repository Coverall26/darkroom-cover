"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Users, Info } from "lucide-react";
import type { WizardData } from "../hooks/useWizardState";

interface Step4Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function Step4TeamInvites({ data, updateField }: Step4Props) {
  const emails = data.inviteEmails.length > 0 ? data.inviteEmails : [""];
  const roles = data.inviteRoles.length > 0 ? data.inviteRoles : ["ADMIN"];

  const updateEmail = (index: number, value: string) => {
    const updated = [...emails];
    updated[index] = value;
    updateField("inviteEmails", updated);
  };

  const updateRole = (index: number, value: string) => {
    const updated = [...roles];
    updated[index] = value;
    updateField("inviteRoles", updated);
  };

  const addRow = () => {
    updateField("inviteEmails", [...emails, ""]);
    updateField("inviteRoles", [...roles, "ADMIN"]);
  };

  const removeRow = (index: number) => {
    if (emails.length <= 1) return;
    const updatedEmails = emails.filter((_, i) => i !== index);
    const updatedRoles = roles.filter((_, i) => i !== index);
    updateField("inviteEmails", updatedEmails);
    updateField("inviteRoles", updatedRoles);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Team Invites
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Invited members can help manage your fund and dataroom.
        </p>
      </div>

      <div className="rounded-lg border dark:border-gray-700 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-[#0066FF]" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Invite Team Members
          </h3>
        </div>

        <div className="space-y-3">
          {emails.map((email, index) => {
            const hasValue = email.trim().length > 0;
            const isInvalid = hasValue && !isValidEmail(email);

            return (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  {index === 0 && <Label>Email Address</Label>}
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => updateEmail(index, e.target.value)}
                    className={`text-base sm:text-sm ${isInvalid ? "border-red-400 focus:border-red-500" : ""}`}
                  />
                  {isInvalid && (
                    <p className="text-xs text-red-500">Invalid email format</p>
                  )}
                </div>
                <div className="w-32 space-y-1">
                  {index === 0 && <Label>Role</Label>}
                  <select
                    value={roles[index] || "ADMIN"}
                    onChange={(e) => updateRole(index, e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                </div>
                <div className={`${index === 0 ? "mt-6" : ""}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    disabled={emails.length <= 1}
                    className="h-10 w-10 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="mt-2"
        >
          <Plus size={14} className="mr-1" />
          Add another
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 dark:bg-blue-950/30 dark:border-blue-800">
        <Info size={14} className="shrink-0 mt-0.5 text-blue-600" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Invitations will be sent after setup completes. Team members will receive an email
          with a link to join your organization. You can always add more team members later
          from Settings.
        </p>
      </div>
    </div>
  );
}
