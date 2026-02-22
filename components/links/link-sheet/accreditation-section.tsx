import { useEffect, useState } from "react";

import { motion } from "motion/react";

import { FADE_IN_ANIMATION_SETTINGS } from "@/lib/constants";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { DEFAULT_LINK_TYPE } from ".";
import LinkItem from "./link-item";
import { LinkUpgradeOptions } from "./link-options";

const ACCREDITATION_TYPES = [
  {
    value: "SELF_CERTIFICATION",
    label: "Self-Certification (3 checkboxes)",
    description:
      "Visitor confirms: accredited investor, risk awareness, own due diligence",
  },
  {
    value: "QUALIFIED_PURCHASER",
    label: "Qualified Purchaser (3(c)(7) funds)",
    description:
      "Visitor confirms: qualified purchaser status, knowledgeable employee",
  },
  {
    value: "ACCREDITED_ONLY",
    label: "Simple Accredited (1 checkbox)",
    description:
      "Single confirmation: I am an accredited investor under SEC Rule 501(a)",
  },
];

export default function AccreditationSection({
  data,
  setData,
  isAllowed,
  handleUpgradeStateChange,
}: {
  data: DEFAULT_LINK_TYPE;
  setData: React.Dispatch<React.SetStateAction<DEFAULT_LINK_TYPE>>;
  isAllowed: boolean;
  handleUpgradeStateChange: ({
    state,
    trigger,
    plan,
    highlightItem,
  }: LinkUpgradeOptions) => void;
}) {
  const { enableAccreditation, accreditationType, accreditationMessage } = data;
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(!!enableAccreditation);
  }, [enableAccreditation]);

  const handleToggle = () => {
    const updated = !enabled;
    setData({
      ...data,
      enableAccreditation: updated,
      // Auto-enable email protection when accreditation gate is on
      emailProtected: updated ? true : data.emailProtected,
      // Set default type when first enabled
      accreditationType: updated
        ? accreditationType || "SELF_CERTIFICATION"
        : accreditationType,
    });
    setEnabled(updated);
  };

  const handleTypeChange = (value: string) => {
    setData({ ...data, accreditationType: value });
  };

  const handleMessageChange = (value: string) => {
    setData({ ...data, accreditationMessage: value || null });
  };

  return (
    <div className="pb-5">
      <LinkItem
        title="Require accreditation confirmation"
        link="https://www.fundroom.ai/help/accreditation-gate"
        tooltipContent="Visitors must confirm they are accredited investors before accessing the content."
        enabled={enabled}
        action={handleToggle}
        isAllowed={isAllowed}
        requiredPlan="datarooms"
        upgradeAction={() =>
          handleUpgradeStateChange({
            state: true,
            trigger: "link_sheet_accreditation_section",
            plan: "Data Rooms",
            highlightItem: ["accreditation"],
          })
        }
      />

      {enabled && (
        <motion.div
          className="relative mt-4 space-y-3"
          {...FADE_IN_ANIMATION_SETTINGS}
        >
          <div className="w-full space-y-4">
            {/* Accreditation type selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Accreditation Type
              </label>
              <Select
                onValueChange={handleTypeChange}
                defaultValue={accreditationType || "SELF_CERTIFICATION"}
              >
                <SelectTrigger className="focus:ring-offset-3 flex w-full rounded-md border-0 bg-background py-1.5 text-foreground shadow-sm ring-1 ring-inset ring-input placeholder:text-muted-foreground focus:ring-2 focus:ring-gray-400 sm:text-sm sm:leading-6">
                  <SelectValue placeholder="Select accreditation type" />
                </SelectTrigger>
                <SelectContent>
                  {ACCREDITATION_TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Show description for selected type */}
              {accreditationType && (
                <p className="text-xs text-muted-foreground">
                  {
                    ACCREDITATION_TYPES.find(
                      (t) => t.value === accreditationType,
                    )?.description
                  }
                </p>
              )}
            </div>

            {/* Custom message / disclaimer */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Custom Message{" "}
                <span className="text-xs text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                value={accreditationMessage || ""}
                onChange={(e) => handleMessageChange(e.target.value)}
                placeholder="Add a custom disclaimer or instructions shown above the checkboxes..."
                rows={3}
                className="text-sm"
                maxLength={500}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
