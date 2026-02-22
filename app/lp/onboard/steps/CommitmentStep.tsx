"use client";

/**
 * CommitmentStep — LP Onboarding Step 6.
 * Handles both tranche-aware mode (unit selection) and flat mode (dollar amount).
 * Includes SEC investor representations (8 checkboxes).
 * Navigation and API calls handled by parent via onCommit callback.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, DollarSign, Loader2 } from "lucide-react";
import type { FormData, FundContext, TrancheData, UpdateFieldFn } from "./types";
import { INVESTOR_REPRESENTATIONS } from "./types";

interface CommitmentStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
  fundContext: FundContext | null;
  trancheData: TrancheData | null;
  trancheLoading: boolean;
  commitUnits: number;
  onCommitUnitsChange: (units: number) => void;
  isLoading: boolean;
  error: string;
  commitError: { type: string; step: number } | null;
  onCommit: () => void;
  onBack: () => void;
  onClearError: () => void;
  onGoToStep: (step: number) => void;
  logCertificationAudit: (
    certificationIndex: number,
    certificationField: string,
    certificationText: string,
    checked: boolean,
    certificationCategory?: string,
  ) => void;
}

export default function CommitmentStep({
  formData,
  updateField,
  fundContext,
  trancheData,
  trancheLoading,
  commitUnits,
  onCommitUnitsChange,
  isLoading,
  error,
  commitError,
  onCommit,
  onBack,
  onClearError,
  onGoToStep,
  logCertificationAudit,
}: CommitmentStepProps) {
  const allRepresentationsChecked =
    formData.repAccreditedCert && formData.repPrincipal && formData.repOfferingDocs &&
    formData.repRiskAware && formData.repRestrictedSecurities && formData.repAmlOfac &&
    formData.repTaxConsent && formData.repIndependentAdvice;

  // Shared SEC representations component
  const renderRepresentations = (idPrefix: string = "") => (
    <div className="space-y-3 pt-4 border-t border-gray-700">
      <h4 className="text-white text-sm font-medium">Investor Representations</h4>
      <p className="text-gray-400 text-xs">
        By checking each box below, you make the following representations in connection with your investment:
      </p>
      {INVESTOR_REPRESENTATIONS.map((rep, idx) => (
        <div key={rep.field} className="flex items-start gap-3 min-h-[44px]">
          <Checkbox
            id={`${idPrefix}${rep.field}`}
            checked={formData[rep.field as keyof FormData] as boolean}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              updateField(rep.field as keyof FormData, isChecked);
              logCertificationAudit(
                idx + 1,
                rep.field,
                rep.label,
                isChecked,
                "SEC_REPRESENTATION",
              );
            }}
            className="mt-1 h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
          />
          <Label htmlFor={`${idPrefix}${rep.field}`} className="text-gray-300 text-xs leading-relaxed cursor-pointer">
            {rep.label}
          </Label>
        </div>
      ))}
    </div>
  );

  // Shared error + navigation component
  const renderErrorAndNav = (commitAmount: number, disableCommit: boolean) => (
    <>
      {error && (
        <div className="space-y-2">
          <p className="text-red-400 text-sm" role="alert">{error}</p>
          {commitError && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                onClearError();
                onGoToStep(commitError.step);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back to {commitError.type === "nda" ? "NDA Agreement" : "Accreditation"} Step
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] text-gray-400 hover:text-white"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
          disabled={isLoading || disableCommit || !allRepresentationsChecked}
          onClick={onCommit}
        >
          {isLoading ? "Processing..." : `Commit $${commitAmount.toLocaleString()}`}
        </Button>
      </div>
    </>
  );

  if (trancheLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading investment details...</p>
      </div>
    );
  }

  // Tranche mode: unit-based commitment
  if (trancheData?.activeTranche) {
    const totalAmount = commitUnits * trancheData.activeTranche.pricePerUnit;

    return (
      <div className="space-y-4">
        <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <span className="text-white font-medium">
              {trancheData.activeTranche.name || `Tranche ${trancheData.activeTranche.tranche}`}
            </span>
          </div>
          <p className="text-emerald-400 text-lg font-semibold">
            ${trancheData.activeTranche.pricePerUnit.toLocaleString()} per unit
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {trancheData.activeTranche.unitsAvailable} of {trancheData.activeTranche.unitsTotal} units available
          </p>
        </div>

        <div>
          <Label className="text-gray-300">Number of Units</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={trancheData.activeTranche.unitsAvailable}
            value={commitUnits}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= trancheData.activeTranche!.unitsAvailable) {
                onCommitUnitsChange(val);
              }
            }}
            className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
          />
        </div>

        <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 space-y-2">
          <h4 className="text-sm text-gray-400 font-medium">Investment Summary</h4>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Commitment Amount</span>
            <span className="text-white font-mono tabular-nums font-semibold text-lg">
              ${totalAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Units</span>
            <span className="text-gray-300 font-mono tabular-nums text-sm">
              {commitUnits} x ${trancheData.activeTranche.pricePerUnit.toLocaleString()}/unit
            </span>
          </div>
          {trancheData.fund.economics.managementFeePct != null && trancheData.fund.economics.managementFeePct > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">
                Management Fee ({((trancheData.fund.economics.managementFeePct) * 100).toFixed(1)}%/yr)
              </span>
              <span className="text-gray-300 font-mono tabular-nums text-sm">
                ${Math.round(totalAmount * trancheData.fund.economics.managementFeePct).toLocaleString()}/yr
              </span>
            </div>
          )}
          {trancheData.fund.economics.carryPct != null && trancheData.fund.economics.carryPct > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Carried Interest</span>
              <span className="text-gray-300 font-mono tabular-nums text-sm">
                {((trancheData.fund.economics.carryPct) * 100).toFixed(0)}% ({trancheData.fund.economics.waterfallType || "European"})
              </span>
            </div>
          )}
          {trancheData.fund.economics.hurdleRate != null && trancheData.fund.economics.hurdleRate > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Preferred Return</span>
              <span className="text-gray-300 font-mono tabular-nums text-sm">
                {((trancheData.fund.economics.hurdleRate) * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {fundContext?.targetRaise && fundContext.targetRaise > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-gray-600">
              <span className="text-gray-400 text-sm">Estimated Ownership</span>
              <span className="text-emerald-400 font-mono tabular-nums text-sm font-medium">
                {((totalAmount / fundContext.targetRaise) * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {renderRepresentations()}
        {renderErrorAndNav(totalAmount, commitUnits < 1)}
      </div>
    );
  }

  // Flat mode: dollar amount commitment
  if (fundContext?.fundId) {
    const parsedAmount = parseFloat(formData.commitmentAmount || "0");

    return (
      <div className="space-y-4">
        <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <span className="text-white font-medium">
              Investment Commitment
            </span>
          </div>
          {fundContext.minimumInvestment ? (
            <p className="text-gray-400 text-sm">
              Minimum investment: ${fundContext.minimumInvestment.toLocaleString()}
            </p>
          ) : null}
        </div>

        <div>
          <Label className="text-gray-300">Commitment Amount ($)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={fundContext.minimumInvestment || 1}
            step="1000"
            placeholder={fundContext.minimumInvestment ? `${fundContext.minimumInvestment.toLocaleString()}` : "Enter amount"}
            value={formData.commitmentAmount}
            onChange={(e) => updateField("commitmentAmount", e.target.value)}
            className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
          />
        </div>

        {formData.commitmentAmount && parsedAmount > 0 && (
          <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 space-y-2">
            <h4 className="text-sm text-gray-400 font-medium">Investment Summary</h4>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Commitment Amount</span>
              <span className="text-white font-mono tabular-nums font-semibold text-lg">
                ${parsedAmount.toLocaleString()}
              </span>
            </div>
            {trancheData?.fund?.economics?.managementFeePct != null && trancheData.fund.economics.managementFeePct > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">
                  Management Fee ({((trancheData.fund.economics.managementFeePct) * 100).toFixed(1)}%/yr)
                </span>
                <span className="text-gray-300 font-mono tabular-nums text-sm">
                  ${Math.round(parsedAmount * trancheData.fund.economics.managementFeePct).toLocaleString()}/yr
                </span>
              </div>
            )}
            {trancheData?.fund?.economics?.carryPct != null && trancheData.fund.economics.carryPct > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">
                  Carried Interest
                </span>
                <span className="text-gray-300 font-mono tabular-nums text-sm">
                  {((trancheData.fund.economics.carryPct) * 100).toFixed(0)}% ({trancheData.fund.economics.waterfallType || "European"})
                </span>
              </div>
            )}
            {trancheData?.fund?.economics?.hurdleRate != null && trancheData.fund.economics.hurdleRate > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">
                  Preferred Return
                </span>
                <span className="text-gray-300 font-mono tabular-nums text-sm">
                  {((trancheData.fund.economics.hurdleRate) * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {fundContext?.targetRaise && fundContext.targetRaise > 0 && (
              <div className="flex justify-between items-center pt-2 border-t border-gray-600">
                <span className="text-gray-400 text-sm">
                  Estimated Ownership
                </span>
                <span className="text-emerald-400 font-mono tabular-nums text-sm font-medium">
                  {((parsedAmount / fundContext.targetRaise) * 100).toFixed(2)}%
                </span>
              </div>
            )}
            {fundContext?.minimumInvestment && parsedAmount < fundContext.minimumInvestment && (
              <div className="text-amber-400 text-xs mt-1 flex items-center gap-1">
                <span>&#x26A0;</span> Minimum investment is ${fundContext.minimumInvestment.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {renderRepresentations("flat-")}
        {renderErrorAndNav(
          parsedAmount,
          !formData.commitmentAmount || parsedAmount <= 0,
        )}
      </div>
    );
  }

  // No fund / no tranche available
  return (
    <div className="text-center py-8">
      <p className="text-gray-400">No active tranche available at this time.</p>
      <p className="text-gray-500 text-sm mt-2">The fund may be fully subscribed.</p>
    </div>
  );
}
