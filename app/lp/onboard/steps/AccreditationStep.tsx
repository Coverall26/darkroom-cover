"use client";

/**
 * AccreditationStep — LP Onboarding Step 4.
 * Collects: accreditation type, investor certifications.
 * When fund is 506(c): additional fields for no-third-party financing,
 * source of funds, and occupation/employer.
 * Pure UI — state managed by parent.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCREDITATION_METHODS } from "@/lib/entity";
import type { FormData, FundContext, UpdateFieldFn } from "./types";

interface AccreditationStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
  fundContext: FundContext | null;
  logCertificationAudit: (
    certificationIndex: number,
    certificationField: string,
    certificationText: string,
    checked: boolean,
    certificationCategory?: string,
  ) => void;
}

export default function AccreditationStep({
  formData,
  updateField,
  fundContext,
  logCertificationAudit,
}: AccreditationStepProps) {
  const is506c = fundContext?.regulationDExemption === "506C";

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-300 mb-2 block">
          How do you qualify as an accredited investor?
        </Label>
        <div className="grid gap-2">
          {ACCREDITATION_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => updateField("accreditationType", method.value)}
              className={`w-full text-left p-3 min-h-[44px] rounded-lg border transition-colors ${
                formData.accreditationType === method.value
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-gray-600 bg-gray-700/30 hover:border-gray-500"
              }`}
            >
              <span className="text-white font-medium text-sm">{method.label}</span>
              <p className="text-gray-400 text-xs mt-0.5">{method.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-700">
        <div className="flex items-start gap-3 min-h-[44px]">
          <Checkbox
            id="confirmAccredited"
            checked={formData.confirmAccredited}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              updateField("confirmAccredited", isChecked);
              logCertificationAudit(
                1,
                "confirmAccredited",
                "I confirm that I meet the SEC definition of an accredited investor under Rule 501 of Regulation D.",
                isChecked,
                "ACCREDITATION",
              );
            }}
            className="mt-1 h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
          />
          <Label htmlFor="confirmAccredited" className="text-gray-300 text-sm leading-relaxed cursor-pointer">
            I confirm that I meet the SEC definition of an accredited investor
            under Rule 501 of Regulation D.
          </Label>
        </div>
        <div className="flex items-start gap-3 min-h-[44px]">
          <Checkbox
            id="confirmRiskAware"
            checked={formData.confirmRiskAware}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              updateField("confirmRiskAware", isChecked);
              logCertificationAudit(
                2,
                "confirmRiskAware",
                "I understand that investments in private securities involve significant risk, including the potential loss of the entire investment.",
                isChecked,
                "ACCREDITATION",
              );
            }}
            className="mt-1 h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
          />
          <Label htmlFor="confirmRiskAware" className="text-gray-300 text-sm leading-relaxed cursor-pointer">
            I understand that investments in private securities involve significant
            risk, including the potential loss of the entire investment.
          </Label>
        </div>
      </div>

      {/* 506(c) Enhanced Certifications — only shown for Rule 506(c) offerings */}
      {is506c && (
        <div className="space-y-4 pt-4 border-t border-gray-700">
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3">
            <p className="text-blue-300 text-xs leading-relaxed">
              This offering is conducted under Rule 506(c) of Regulation D, which requires
              enhanced verification of accredited investor status. The following additional
              certifications are required.
            </p>
          </div>

          <div className="flex items-start gap-3 min-h-[44px]">
            <Checkbox
              id="noThirdPartyFinancing"
              checked={formData.noThirdPartyFinancing}
              onCheckedChange={(checked) => {
                const isChecked = checked === true;
                updateField("noThirdPartyFinancing", isChecked);
                logCertificationAudit(
                  3,
                  "noThirdPartyFinancing",
                  "I certify that my investment is not financed by any third party for the purpose of meeting the accredited investor thresholds.",
                  isChecked,
                  "506C_ENHANCED",
                );
              }}
              className="mt-1 h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
            />
            <Label htmlFor="noThirdPartyFinancing" className="text-gray-300 text-sm leading-relaxed cursor-pointer">
              I certify that my investment is not financed by any third party for the
              purpose of meeting the accredited investor thresholds.
            </Label>
          </div>

          <div>
            <Label className="text-gray-300 text-sm">Source of Funds</Label>
            <Select
              value={formData.sourceOfFunds}
              onValueChange={(v) => updateField("sourceOfFunds", v)}
            >
              <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select source of funds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SALARY">Salary / Employment Income</SelectItem>
                <SelectItem value="INVESTMENT_RETURNS">Investment Returns</SelectItem>
                <SelectItem value="BUSINESS_INCOME">Business Income</SelectItem>
                <SelectItem value="INHERITANCE">Inheritance</SelectItem>
                <SelectItem value="SAVINGS">Personal Savings</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300 text-sm">Occupation / Employer</Label>
            <Input
              placeholder="e.g., Software Engineer at Acme Corp"
              value={formData.occupation}
              onChange={(e) => updateField("occupation", e.target.value)}
              className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm mt-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Validation: can proceed from step 4? */
export function canProceedStep4(formData: FormData, fundContext: FundContext | null): boolean {
  const is506c = fundContext?.regulationDExemption === "506C";
  return !!(
    formData.accreditationType &&
    formData.confirmAccredited &&
    formData.confirmRiskAware &&
    (!is506c || (formData.noThirdPartyFinancing && formData.sourceOfFunds && formData.occupation))
  );
}
