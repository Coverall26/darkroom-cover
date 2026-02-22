"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TAX_CLASSIFICATIONS,
  OTHER_ENTITY_TYPES,
} from "@/lib/validations/investor-entity";
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

export interface OtherEntityFormProps {
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

export default function OtherEntityForm({
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
}: OtherEntityFormProps) {
  return (
    <div className={sectionCls}>
      <div>
        <Label className={labelCls}>
          Entity Legal Name <span className="text-red-400">*</span>
        </Label>
        <Input
          placeholder="Entity name"
          value={form.otherEntityName}
          onChange={(e) => updateField("otherEntityName", e.target.value)}
          onBlur={() => handleBlur("otherEntityName")}
          className={inputCls}
        />
        {errors.otherEntityName && (
          <p className={errorCls}>{errors.otherEntityName}</p>
        )}
      </div>

      <div>
        <Label className={labelCls}>Entity Type</Label>
        <Select
          value={form.otherEntityType}
          onValueChange={(v) => {
            updateField("otherEntityType", v);
            handleBlur("otherEntityType");
          }}
        >
          <SelectTrigger className={`${inputCls} min-h-[44px]`}>
            <SelectValue placeholder="Select entity type" />
          </SelectTrigger>
          <SelectContent>
            {OTHER_ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TaxIdField
        type="ein"
        label="EIN"
        required
        value={form.otherEin}
        onChange={(raw) => updateField("otherEin", raw)}
        showField={showEin}
        onToggleShow={onToggleShowEin}
        onFocus={onFocusEin}
        onBlur={onBlurEin}
        helperText="Encrypted with AES-256."
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>State of Formation</Label>
          <Select
            value={form.otherStateOfFormation}
            onValueChange={(v) => {
              updateField("otherStateOfFormation", v);
              handleBlur("otherStateOfFormation");
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
          <Label className={labelCls}>Country of Formation</Label>
          <Select
            value={form.otherCountryOfFormation}
            onValueChange={(v) => {
              updateField("otherCountryOfFormation", v);
              handleBlur("otherCountryOfFormation");
            }}
          >
            <SelectTrigger className={`${inputCls} min-h-[44px]`}>
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="CA">Canada</SelectItem>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Date of Formation</Label>
          <Input
            type="date"
            value={form.otherDateOfFormation}
            onChange={(e) =>
              updateField("otherDateOfFormation", e.target.value)
            }
            onBlur={() => handleBlur("otherDateOfFormation")}
            className={inputCls}
          />
        </div>
        <div>
          <Label className={labelCls}>Tax Classification</Label>
          <Select
            value={form.otherTaxClassification}
            onValueChange={(v) => {
              updateField("otherTaxClassification", v);
              handleBlur("otherTaxClassification");
            }}
          >
            <SelectTrigger className={`${inputCls} min-h-[44px]`}>
              <SelectValue placeholder="Classification" />
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
            placeholder="Authorized representative"
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
            placeholder="e.g., Director, President"
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
          placeholder="signer@entity.com"
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

      <UploadZone label="Formation Documents (optional)" />
    </div>
  );
}
