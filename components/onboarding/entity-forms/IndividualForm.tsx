"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AddressFields from "./AddressFields";
import TaxIdField from "./TaxIdField";
import {
  type EntityFormState,
  type UpdateFieldFn,
  type UpdateAddressFn,
  type HandleBlurFn,
  type HandleAddressBlurFn,
  inputCls,
  labelCls,
  errorCls,
  sectionCls,
} from "./shared-types";

export interface IndividualFormProps {
  form: EntityFormState;
  errors: Record<string, string>;
  addressErrors: Record<string, string>;
  showSsn: boolean;
  onToggleShowSsn: () => void;
  onFocusSsn: () => void;
  onBlurSsn: () => void;
  updateField: UpdateFieldFn;
  updateAddress: UpdateAddressFn;
  handleBlur: HandleBlurFn;
  handleAddressBlur: HandleAddressBlurFn;
}

export default function IndividualForm({
  form,
  errors,
  addressErrors,
  showSsn,
  onToggleShowSsn,
  onFocusSsn,
  onBlurSsn,
  updateField,
  updateAddress,
  handleBlur,
  handleAddressBlur,
}: IndividualFormProps) {
  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>
            First Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="John"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            onBlur={() => handleBlur("firstName")}
            className={inputCls}
          />
          {errors.firstName && (
            <p className={errorCls}>{errors.firstName}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>
            Last Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="Smith"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            onBlur={() => handleBlur("lastName")}
            className={inputCls}
          />
          {errors.lastName && (
            <p className={errorCls}>{errors.lastName}</p>
          )}
        </div>
      </div>

      <TaxIdField
        type="ssn"
        label="SSN"
        required
        value={form.ssn}
        onChange={(raw) => updateField("ssn", raw)}
        showField={showSsn}
        onToggleShow={onToggleShowSsn}
        onFocus={onFocusSsn}
        onBlur={onBlurSsn}
        helperText="Encrypted with AES-256. Never stored in plaintext."
      />

      <div>
        <Label className={labelCls}>Date of Birth</Label>
        <Input
          type="date"
          value={form.dateOfBirth}
          onChange={(e) => updateField("dateOfBirth", e.target.value)}
          onBlur={() => handleBlur("dateOfBirth")}
          className={inputCls}
        />
      </div>

      <AddressFields
        which="physicalAddress"
        label="Physical Address"
        address={form.physicalAddress}
        errors={errors}
        addressErrors={addressErrors}
        updateAddress={updateAddress}
        handleAddressBlur={handleAddressBlur}
        handleBlur={handleBlur}
      />

      <div className="flex items-center gap-3 min-h-[44px]">
        <Checkbox
          id="useMailingAddress"
          checked={!form.useMailingAddress}
          onCheckedChange={(checked) =>
            updateField("useMailingAddress", checked !== true)
          }
          className="h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
        />
        <Label
          htmlFor="useMailingAddress"
          className="text-gray-300 text-sm cursor-pointer"
        >
          Mailing address is the same as above
        </Label>
      </div>

      {form.useMailingAddress && (
        <AddressFields
          which="mailingAddress"
          label="Mailing Address"
          address={form.mailingAddress}
          errors={errors}
          addressErrors={addressErrors}
          updateAddress={updateAddress}
          handleAddressBlur={handleAddressBlur}
          handleBlur={handleBlur}
        />
      )}

      <div>
        <Label className={labelCls}>Phone Number</Label>
        <Input
          type="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          value={form.phone}
          onChange={(e) => updateField("phone", e.target.value)}
          onBlur={() => handleBlur("phone")}
          className={inputCls}
        />
      </div>
    </div>
  );
}
