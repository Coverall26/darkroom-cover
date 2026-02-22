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
  type AddressState,
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

export interface AddressFieldsProps {
  /** Which address object in the form state */
  which: "physicalAddress" | "mailingAddress" | "custodianAddress";
  /** Section heading label */
  label: string;
  /** Current address values */
  address: AddressState;
  /** Validation errors keyed by "which.field" */
  errors: Record<string, string>;
  /** Address-specific validation errors (PO Box) keyed by "which.field" */
  addressErrors: Record<string, string>;
  /** Update a single address field */
  updateAddress: UpdateAddressFn;
  /** Handle blur on street fields (PO Box validation) */
  handleAddressBlur: HandleAddressBlurFn;
  /** Handle blur on non-street fields (auto-save) */
  handleBlur: HandleBlurFn;
}

export default function AddressFields({
  which,
  label,
  address,
  errors,
  addressErrors,
  updateAddress,
  handleAddressBlur,
  handleBlur,
}: AddressFieldsProps) {
  return (
    <div className={sectionCls}>
      <h4 className={sectionTitleCls}>{label}</h4>
      <div>
        <Label className={labelCls}>Street Address Line 1</Label>
        <Input
          placeholder="123 Main Street"
          autoComplete="street-address"
          value={address.street1}
          onChange={(e) => updateAddress(which, "street1", e.target.value)}
          onBlur={() => handleAddressBlur(which, "street1")}
          className={inputCls}
        />
        {addressErrors[`${which}.street1`] && (
          <p className={errorCls}>{addressErrors[`${which}.street1`]}</p>
        )}
        {errors[`${which}.street1`] && (
          <p className={errorCls}>{errors[`${which}.street1`]}</p>
        )}
      </div>
      <div>
        <Label className={labelCls}>Street Address Line 2 (optional)</Label>
        <Input
          placeholder="Suite 100"
          value={address.street2}
          onChange={(e) => updateAddress(which, "street2", e.target.value)}
          onBlur={() => handleAddressBlur(which, "street2")}
          className={inputCls}
        />
        {addressErrors[`${which}.street2`] && (
          <p className={errorCls}>{addressErrors[`${which}.street2`]}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>City</Label>
          <Input
            placeholder="City"
            autoComplete="address-level2"
            value={address.city}
            onChange={(e) => updateAddress(which, "city", e.target.value)}
            onBlur={() => handleBlur(`${which}.city`)}
            className={inputCls}
          />
          {errors[`${which}.city`] && (
            <p className={errorCls}>{errors[`${which}.city`]}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>State</Label>
          <Select
            value={address.state}
            onValueChange={(v) => {
              updateAddress(which, "state", v);
              handleBlur(`${which}.state`);
            }}
          >
            <SelectTrigger className={`${inputCls} min-h-[44px]`}>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors[`${which}.state`] && (
            <p className={errorCls}>{errors[`${which}.state`]}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>ZIP Code</Label>
          <Input
            placeholder="12345"
            inputMode="numeric"
            autoComplete="postal-code"
            value={address.zip}
            onChange={(e) => updateAddress(which, "zip", e.target.value)}
            onBlur={() => handleBlur(`${which}.zip`)}
            className={inputCls}
          />
          {errors[`${which}.zip`] && (
            <p className={errorCls}>{errors[`${which}.zip`]}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>Country</Label>
          <Select
            value={address.country}
            onValueChange={(v) => {
              updateAddress(which, "country", v);
              handleBlur(`${which}.country`);
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
    </div>
  );
}
