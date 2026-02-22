import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, PenTool, Send } from "lucide-react";
import { SignaturePad } from "@/components/lp/signature-pad";

interface AccreditationData {
  confirmIncome: boolean;
  confirmNetWorth: boolean;
  confirmAccredited: boolean;
  confirmRiskAware: boolean;
}

interface NdaAccreditationDialogProps {
  open: boolean;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  ndaAccepted: boolean;
  setNdaAccepted: (value: boolean) => void;
  ndaSignature: string | null;
  setNdaSignature: (value: string | null) => void;
  accreditationData: AccreditationData;
  setAccreditationData: React.Dispatch<React.SetStateAction<AccreditationData>>;
  canProceedToStep2: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  showResendConfirmation: boolean;
  onSubmit: () => void;
}

export function NdaAccreditationDialog({
  open,
  wizardStep,
  setWizardStep,
  ndaAccepted,
  setNdaAccepted,
  ndaSignature,
  setNdaSignature,
  accreditationData,
  setAccreditationData,
  canProceedToStep2,
  canSubmit,
  isSubmitting,
  showResendConfirmation,
  onSubmit,
}: NdaAccreditationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-[calc(100vw-2rem)] sm:max-w-xl">
        {showResendConfirmation ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Verification Complete!</h3>
            <p className="text-gray-400 mb-4">
              A confirmation email has been sent to your inbox.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-400 border-emerald-600 hover:bg-emerald-600/20"
              onClick={async () => {
                try {
                  await fetch("/api/lp/complete-gate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ resendConfirmation: true }),
                  });
                } catch (e) {
                  console.error("Resend error:", e);
                }
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Resend Confirmation
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">
                {wizardStep === 1 ? "Non-Disclosure Agreement" : "Accredited Investor Verification"}
              </DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                {wizardStep === 1
                  ? "Step 1 of 2: Review and accept the confidentiality agreement"
                  : "Step 2 of 2: Confirm your accredited investor status (SEC 506(c))"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Verification Progress</span>
                  <span className="text-emerald-400 font-medium font-mono tabular-nums">
                    {wizardStep === 1 ? (ndaAccepted ? "50%" : "0%") : (canSubmit ? "100%" : "75%")}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: wizardStep === 1
                        ? (ndaAccepted ? "50%" : "0%")
                        : (canSubmit ? "100%" : "75%"),
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
                        wizardStep > 1 || (wizardStep === 1 && ndaAccepted) ? "bg-emerald-600" : wizardStep === 1 ? "bg-emerald-600/50 ring-2 ring-emerald-400" : "bg-gray-700"
                      }`}
                    >
                      {wizardStep > 1 ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" /> : "1"}
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-400 mt-1">NDA</span>
                  </div>
                  <div className={`w-12 sm:w-20 h-1 rounded transition-colors ${wizardStep > 1 ? "bg-emerald-600" : "bg-gray-700"}`} />
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
                        canSubmit && wizardStep === 2 ? "bg-emerald-600" : wizardStep === 2 ? "bg-emerald-600/50 ring-2 ring-emerald-400" : "bg-gray-700"
                      }`}
                    >
                      2
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-400 mt-1">Accreditation</span>
                  </div>
                </div>
              </div>

              {wizardStep === 1 ? (
                <>
                  <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600 space-y-4">
                    <div className="flex items-start space-x-3 min-h-[44px]">
                      <Checkbox
                        id="nda"
                        checked={ndaAccepted}
                        onCheckedChange={(checked) => setNdaAccepted(checked as boolean)}
                        className="mt-1 h-5 w-5"
                      />
                      <div>
                        <Label htmlFor="nda" className="text-white font-medium cursor-pointer">
                          I Accept the Non-Disclosure Agreement
                        </Label>
                        <p className="text-gray-400 text-sm mt-2">
                          I agree to keep all fund information, investment terms, and related materials
                          strictly confidential. I will not share, distribute, or disclose any information
                          to third parties without prior written consent from the fund manager.
                        </p>
                      </div>
                    </div>

                    {ndaAccepted && (
                      <div className="pt-4 border-t border-gray-600">
                        <Label className="text-white font-medium mb-3 block">
                          <PenTool className="inline h-4 w-4 mr-2" />
                          Sign Below
                        </Label>
                        <SignaturePad onSignatureChange={setNdaSignature} />
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => setWizardStep(2)}
                    disabled={!canProceedToStep2}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-lg"
                  >
                    Continue to Accreditation
                  </Button>
                </>
              ) : (
                <>
                  <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                    <p className="text-blue-200 text-sm">
                      This is a Rule 506(c) offering. By law, we must take reasonable steps to verify
                      that all investors are accredited. Please confirm your status below.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-white font-medium">Select at least one that applies:</p>

                    <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                      <div className="flex items-start space-x-3 min-h-[44px]">
                        <Checkbox
                          id="income"
                          checked={accreditationData.confirmIncome}
                          onCheckedChange={(checked) =>
                            setAccreditationData((prev) => ({ ...prev, confirmIncome: checked as boolean }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <div>
                          <Label htmlFor="income" className="text-white font-medium cursor-pointer">
                            Income Qualification
                          </Label>
                          <p className="text-gray-400 text-sm mt-1">
                            I have earned individual income exceeding $200,000 (or $300,000 with spouse)
                            in each of the past two years and expect the same this year.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                      <div className="flex items-start space-x-3 min-h-[44px]">
                        <Checkbox
                          id="networth"
                          checked={accreditationData.confirmNetWorth}
                          onCheckedChange={(checked) =>
                            setAccreditationData((prev) => ({ ...prev, confirmNetWorth: checked as boolean }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <div>
                          <Label htmlFor="networth" className="text-white font-medium cursor-pointer">
                            Net Worth Qualification
                          </Label>
                          <p className="text-gray-400 text-sm mt-1">
                            I have a net worth exceeding $1,000,000, either individually or with my spouse,
                            excluding my primary residence.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-white font-medium">Required acknowledgments:</p>

                    <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                      <div className="flex items-start space-x-3 min-h-[44px]">
                        <Checkbox
                          id="confirmAccredited"
                          checked={accreditationData.confirmAccredited}
                          onCheckedChange={(checked) =>
                            setAccreditationData((prev) => ({ ...prev, confirmAccredited: checked as boolean }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <div>
                          <Label htmlFor="confirmAccredited" className="text-white font-medium cursor-pointer">
                            I Confirm I Am an Accredited Investor
                          </Label>
                          <p className="text-gray-400 text-sm mt-1">
                            I certify that I meet the SEC definition of an accredited investor under Rule 501
                            of Regulation D.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                      <div className="flex items-start space-x-3 min-h-[44px]">
                        <Checkbox
                          id="riskAware"
                          checked={accreditationData.confirmRiskAware}
                          onCheckedChange={(checked) =>
                            setAccreditationData((prev) => ({ ...prev, confirmRiskAware: checked as boolean }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <div>
                          <Label htmlFor="riskAware" className="text-white font-medium cursor-pointer">
                            I Understand the Investment Risks
                          </Label>
                          <p className="text-gray-400 text-sm mt-1">
                            I understand that private fund investments are illiquid, carry significant risk
                            of loss, and are suitable only for accredited investors.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStep(1)}
                      className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={onSubmit}
                      disabled={!canSubmit || isSubmitting}
                      className="flex-[2] bg-emerald-600 hover:bg-emerald-700 h-12 text-lg"
                    >
                      {isSubmitting ? "Processing..." : "Confirm & Access Dashboard"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
