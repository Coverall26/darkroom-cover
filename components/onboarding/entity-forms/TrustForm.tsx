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
import { TRUST_TYPES } from "@/lib/validations/investor-entity";
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

export interface TrustFormProps {
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

export default function TrustForm({
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
}: TrustFormProps) {
  // Trust tax ID has special behavior: revocable trusts use SSN format, others use EIN format
  const isRevocable = form.trustType === "REVOCABLE_LIVING";

  return (
    <div className={sectionCls}>
      <div>
        <Label className={labelCls}>
          Trust Legal Name <span className="text-red-400">*</span>
        </Label>
        <Input
          placeholder="Smith Family Trust"
          value={form.trustName}
          onChange={(e) => updateField("trustName", e.target.value)}
          onBlur={() => handleBlur("trustName")}
          className={inputCls}
        />
        {errors.trustName && (
          <p className={errorCls}>{errors.trustName}</p>
        )}
      </div>

      <div>
        <Label className={labelCls}>Trust Type</Label>
        <Select
          value={form.trustType}
          onValueChange={(v) => {
            updateField("trustType", v);
            handleBlur("trustType");
          }}
        >
          <SelectTrigger className={`${inputCls} min-h-[44px]`}>
            <SelectValue placeholder="Select trust type" />
          </SelectTrigger>
          <SelectContent>
            {TRUST_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trust Tax ID: uses custom rendering because of the SSN/EIN dual format based on trust type */}
      <TaxIdField
        type={isRevocable ? "ssn" : "ein"}
        label={isRevocable ? "Grantor SSN" : "EIN"}
        value={form.trustTaxId}
        onChange={(raw) => updateField("trustTaxId", raw)}
        showField={showEin}
        onToggleShow={onToggleShowEin}
        onFocus={onFocusEin}
        onBlur={onBlurEin}
        helperText={
          isRevocable
            ? "Revocable trusts use the grantor\u2019s SSN"
            : "Irrevocable trusts require their own EIN"
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Date Established</Label>
          <Input
            type="date"
            value={form.trustDateEstablished}
            onChange={(e) =>
              updateField("trustDateEstablished", e.target.value)
            }
            onBlur={() => handleBlur("trustDateEstablished")}
            className={inputCls}
          />
        </div>
        <div>
          <Label className={labelCls}>Governing State</Label>
          <Select
            value={form.trustGoverningState}
            onValueChange={(v) => {
              updateField("trustGoverningState", v);
              handleBlur("trustGoverningState");
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
      </div>

      <AddressFields
        which="physicalAddress"
        label="Trust Address"
        address={form.physicalAddress}
        errors={errors}
        addressErrors={addressErrors}
        updateAddress={updateAddress}
        handleAddressBlur={handleAddressBlur}
        handleBlur={handleBlur}
      />

      <h4 className={sectionTitleCls}>Trustee Information</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>
            Trustee Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="Jane Smith"
            value={form.trusteeName}
            onChange={(e) => updateField("trusteeName", e.target.value)}
            onBlur={() => handleBlur("trusteeName")}
            className={inputCls}
          />
          {errors.trusteeName && (
            <p className={errorCls}>{errors.trusteeName}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>Title</Label>
          <Input
            placeholder="Trustee"
            value={form.trusteeTitle}
            onChange={(e) => updateField("trusteeTitle", e.target.value)}
            onBlur={() => handleBlur("trusteeTitle")}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <Label className={labelCls}>
          Trustee Email <span className="text-red-400">*</span>
        </Label>
        <Input
          type="email"
          placeholder="trustee@email.com"
          value={form.trusteeEmail}
          onChange={(e) => updateField("trusteeEmail", e.target.value)}
          onBlur={() => handleBlur("trusteeEmail")}
          className={inputCls}
        />
        {errors.trusteeEmail && (
          <p className={errorCls}>{errors.trusteeEmail}</p>
        )}
      </div>
      <div>
        <Label className={labelCls}>Trustee Phone</Label>
        <Input
          type="tel"
          placeholder="(555) 123-4567"
          value={form.trusteePhone}
          onChange={(e) => updateField("trusteePhone", e.target.value)}
          onBlur={() => handleBlur("trusteePhone")}
          className={inputCls}
        />
      </div>

      <UploadZone label="Trust Agreement (optional)" />
    </div>
  );
}
