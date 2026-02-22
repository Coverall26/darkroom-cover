"use client";

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
import { TAX_CLASSIFICATIONS } from "@/lib/validations/investor-entity";
import AddressFields from "./AddressFields";
import TaxIdField from "./TaxIdField";
import UploadZone from "./UploadZone";
import {
  type EntityFormState,
  type UpdateFieldFn,
  type UpdateAddressFn,
  type HandleBlurFn,
  type HandleAddressBlurFn,
  US_STATES,
  inputCls,
  labelCls,
  errorCls,
  sectionCls,
  sectionTitleCls,
} from "./shared-types";

export interface LLCFormProps {
  form: EntityFormState;
  errors: Record<string, string>;
  addressErrors: Record<string, string>;
  showEin: boolean;
  onToggleShowEin: () => void;
  onFocusEin: () => void;
  onBlurEin: () => void;
  updateField: UpdateFieldFn;
  updateAddress: UpdateAddressFn;
  handleBlur: HandleBlurFn;
  handleAddressBlur: HandleAddressBlurFn;
}

export default function LLCForm({
  form,
  errors,
  addressErrors,
  showEin,
  onToggleShowEin,
  onFocusEin,
  onBlurEin,
  updateField,
  updateAddress,
  handleBlur,
  handleAddressBlur,
}: LLCFormProps) {
  return (
    <div className={sectionCls}>
      <div>
        <Label className={labelCls}>
          LLC Legal Name <span className="text-red-400">*</span>
        </Label>
        <Input
          placeholder="Smith Holdings LLC"
          value={form.llcName}
          onChange={(e) => updateField("llcName", e.target.value)}
          onBlur={() => handleBlur("llcName")}
          className={inputCls}
        />
        {errors.llcName && <p className={errorCls}>{errors.llcName}</p>}
      </div>

      <TaxIdField
        type="ein"
        label="EIN"
        required
        value={form.llcEin}
        onChange={(raw) => updateField("llcEin", raw)}
        showField={showEin}
        onToggleShow={onToggleShowEin}
        onFocus={onFocusEin}
        onBlur={onBlurEin}
        helperText="Encrypted with AES-256. Never stored in plaintext."
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>State of Formation</Label>
          <Select
            value={form.llcStateOfFormation}
            onValueChange={(v) => {
              updateField("llcStateOfFormation", v);
              handleBlur("llcStateOfFormation");
            }}
          >
            <SelectTrigger className={`${inputCls} min-h-[44px]`}>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className={labelCls}>Date of Formation</Label>
          <Input
            type="date"
            value={form.llcDateOfFormation}
            onChange={(e) =>
              updateField("llcDateOfFormation", e.target.value)
            }
            onBlur={() => handleBlur("llcDateOfFormation")}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <Label className={labelCls}>Tax Classification</Label>
        <Select
          value={form.llcTaxClassification}
          onValueChange={(v) => {
            updateField("llcTaxClassification", v);
            handleBlur("llcTaxClassification");
          }}
        >
          <SelectTrigger className={`${inputCls} min-h-[44px]`}>
            <SelectValue placeholder="Select classification" />
          </SelectTrigger>
          <SelectContent>
            {TAX_CLASSIFICATIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AddressFields
        which="physicalAddress"
        label="Entity Address"
        address={form.physicalAddress}
        errors={errors}
        addressErrors={addressErrors}
        updateAddress={updateAddress}
        handleAddressBlur={handleAddressBlur}
        handleBlur={handleBlur}
      />

      <h4 className={sectionTitleCls}>Authorized Signer</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>
            Full Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="Managing Member name"
            value={form.signatoryName}
            onChange={(e) => updateField("signatoryName", e.target.value)}
            onBlur={() => handleBlur("signatoryName")}
            className={inputCls}
          />
          {errors.signatoryName && (
            <p className={errorCls}>{errors.signatoryName}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>
            Title <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="e.g., Managing Member"
            value={form.signatoryTitle}
            onChange={(e) => updateField("signatoryTitle", e.target.value)}
            onBlur={() => handleBlur("signatoryTitle")}
            className={inputCls}
          />
          {errors.signatoryTitle && (
            <p className={errorCls}>{errors.signatoryTitle}</p>
          )}
        </div>
      </div>
      <div>
        <Label className={labelCls}>
          Email <span className="text-red-400">*</span>
        </Label>
        <Input
          type="email"
          placeholder="signer@company.com"
          value={form.signatoryEmail}
          onChange={(e) => updateField("signatoryEmail", e.target.value)}
          onBlur={() => handleBlur("signatoryEmail")}
          className={inputCls}
        />
        {errors.signatoryEmail && (
          <p className={errorCls}>{errors.signatoryEmail}</p>
        )}
      </div>
      <div>
        <Label className={labelCls}>Phone</Label>
        <Input
          type="tel"
          placeholder="(555) 123-4567"
          value={form.signatoryPhone}
          onChange={(e) => updateField("signatoryPhone", e.target.value)}
          onBlur={() => handleBlur("signatoryPhone")}
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-3 min-h-[44px]">
        <Checkbox
          id="signatoryIsAccountHolder"
          checked={form.signatoryIsAccountHolder}
          onCheckedChange={(checked) =>
            updateField("signatoryIsAccountHolder", checked === true)
          }
          className="h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
        />
        <Label
          htmlFor="signatoryIsAccountHolder"
          className="text-gray-300 text-sm cursor-pointer"
        >
          The authorized signer is also the account holder
        </Label>
      </div>

      <UploadZone
        label="Operating Agreement (optional)"
        helper="Required for some funds"
      />
    </div>
  );
}
