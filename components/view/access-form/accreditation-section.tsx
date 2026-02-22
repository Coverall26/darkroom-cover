import { Dispatch, SetStateAction } from "react";

import { Brand, DataroomBrand } from "@prisma/client";

import { determineTextColor } from "@/lib/utils/determine-text-color";

import { Checkbox } from "@/components/ui/checkbox";

import { DEFAULT_ACCESS_FORM_TYPE } from ".";

/**
 * Accreditation gate section rendered in the access form.
 * Mirrors the AgreementSection pattern but with accredited-investor-specific checkboxes.
 *
 * Three gate types:
 * - SELF_CERTIFICATION: 3 checkboxes (accredited, risk aware, own research)
 * - QUALIFIED_PURCHASER: 2 checkboxes (qualified purchaser, knowledgeable employee)
 * - ACCREDITED_ONLY: 1 checkbox (I am an accredited investor)
 */
export default function AccreditationSection({
  data,
  setData,
  accreditationType,
  accreditationMessage,
  brand,
}: {
  data: DEFAULT_ACCESS_FORM_TYPE;
  setData: Dispatch<SetStateAction<DEFAULT_ACCESS_FORM_TYPE>>;
  accreditationType: string;
  accreditationMessage?: string | null;
  brand?: Partial<Brand> | Partial<DataroomBrand> | null;
}) {
  const textColor = determineTextColor(brand?.accentColor);
  const checkboxStyle = {
    borderColor: textColor,
    color: brand?.accentColor || undefined,
    "--dynamic-accent-color": textColor,
  } as React.CSSProperties;

  const checkboxClassName =
    "border border-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--dynamic-accent-color)] data-[state=checked]:bg-[var(--dynamic-accent-color)] data-[state=checked]:text-[var(--dynamic-accent-color)]";

  const labelStyle = { color: textColor };

  // Track individual checkbox states to compute the composite confirmation
  const handleCheckChange = (field: string, checked: boolean) => {
    setData((prevData) => {
      const updatedChecks = {
        ...(prevData._accreditationChecks || {}),
        [field]: checked,
      };

      // Determine if all required checks are satisfied based on gate type
      let allConfirmed = false;
      if (accreditationType === "ACCREDITED_ONLY") {
        allConfirmed = !!updatedChecks.accredited;
      } else if (accreditationType === "QUALIFIED_PURCHASER") {
        allConfirmed =
          !!updatedChecks.qualifiedPurchaser &&
          !!updatedChecks.knowledgeableEmployee;
      } else {
        // SELF_CERTIFICATION (default)
        allConfirmed =
          !!updatedChecks.accredited &&
          !!updatedChecks.riskAware &&
          !!updatedChecks.ownResearch;
      }

      return {
        ...prevData,
        _accreditationChecks: updatedChecks,
        hasConfirmedAccreditation: allConfirmed,
      };
    });
  };

  const checks = (data._accreditationChecks || {}) as Record<string, boolean>;

  return (
    <div className="space-y-3 pt-5">
      {/* Optional custom message from GP */}
      {accreditationMessage && (
        <p
          className="text-xs leading-5 opacity-80"
          style={labelStyle}
        >
          {accreditationMessage}
        </p>
      )}

      {accreditationType === "ACCREDITED_ONLY" && (
        <div className="flex items-start space-x-2">
          <Checkbox
            id="accredited"
            checked={!!checks.accredited}
            onCheckedChange={(checked) =>
              handleCheckChange("accredited", checked as boolean)
            }
            className={checkboxClassName}
            style={checkboxStyle}
          />
          <label
            htmlFor="accredited"
            className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            style={labelStyle}
          >
            I confirm that I am an accredited investor as defined under SEC Rule
            501(a) of Regulation D.
          </label>
        </div>
      )}

      {accreditationType === "QUALIFIED_PURCHASER" && (
        <>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="qualifiedPurchaser"
              checked={!!checks.qualifiedPurchaser}
              onCheckedChange={(checked) =>
                handleCheckChange("qualifiedPurchaser", checked as boolean)
              }
              className={checkboxClassName}
              style={checkboxStyle}
            />
            <label
              htmlFor="qualifiedPurchaser"
              className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              style={labelStyle}
            >
              I confirm that I am a &ldquo;qualified purchaser&rdquo; as defined
              under Section 2(a)(51) of the Investment Company Act of 1940 (i.e.,
              I own not less than $5,000,000 in investments).
            </label>
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="knowledgeableEmployee"
              checked={!!checks.knowledgeableEmployee}
              onCheckedChange={(checked) =>
                handleCheckChange("knowledgeableEmployee", checked as boolean)
              }
              className={checkboxClassName}
              style={checkboxStyle}
            />
            <label
              htmlFor="knowledgeableEmployee"
              className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              style={labelStyle}
            >
              I acknowledge that I have sufficient knowledge and experience in
              financial matters to evaluate the risks and merits of this
              investment.
            </label>
          </div>
        </>
      )}

      {/* SELF_CERTIFICATION — default / fallback */}
      {(accreditationType === "SELF_CERTIFICATION" ||
        !accreditationType) && (
        <>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="accredited"
              checked={!!checks.accredited}
              onCheckedChange={(checked) =>
                handleCheckChange("accredited", checked as boolean)
              }
              className={checkboxClassName}
              style={checkboxStyle}
            />
            <label
              htmlFor="accredited"
              className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              style={labelStyle}
            >
              I confirm that I am an accredited investor as defined under SEC
              Rule 501(a) of Regulation D.
            </label>
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="riskAware"
              checked={!!checks.riskAware}
              onCheckedChange={(checked) =>
                handleCheckChange("riskAware", checked as boolean)
              }
              className={checkboxClassName}
              style={checkboxStyle}
            />
            <label
              htmlFor="riskAware"
              className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              style={labelStyle}
            >
              I understand that investments in private securities involve a high
              degree of risk including the potential loss of my entire
              investment.
            </label>
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox
              id="ownResearch"
              checked={!!checks.ownResearch}
              onCheckedChange={(checked) =>
                handleCheckChange("ownResearch", checked as boolean)
              }
              className={checkboxClassName}
              style={checkboxStyle}
            />
            <label
              htmlFor="ownResearch"
              className="text-sm font-normal leading-5 text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              style={labelStyle}
            >
              I confirm that I have conducted my own independent research and
              due diligence regarding this investment opportunity.
            </label>
          </div>
        </>
      )}
    </div>
  );
}
