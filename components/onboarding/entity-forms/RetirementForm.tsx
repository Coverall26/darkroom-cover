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
import { RETIREMENT_ACCOUNT_TYPES } from "@/lib/validations/investor-entity";
import AddressFields from "./AddressFields";
import TaxIdField from "./TaxIdField";
import UploadZone from "./UploadZone";
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
  sectionTitleCls,
} from "./shared-types";

export interface RetirementFormProps {
  form: EntityFormState;
  errors: Record<string, string>;
  addressErrors: Record<string, string>;
  showSsn: boolean;
  showEin: boolean;
  onToggleShowSsn: () => void;
  onToggleShowEin: () => void;
  onFocusSsn: () => void;
  onFocusEin: () => void;
  onBlurSsn: () => void;
  onBlurEin: () => void;
  updateField: UpdateFieldFn;
  updateAddress: UpdateAddressFn;
  handleBlur: HandleBlurFn;
  handleAddressBlur: HandleAddressBlurFn;
}

export default function RetirementForm({
  form,
  errors,
  addressErrors,
  showSsn,
  showEin,
  onToggleShowSsn,
  onToggleShowEin,
  onFocusSsn,
  onFocusEin,
  onBlurSsn,
  onBlurEin,
  updateField,
  updateAddress,
  handleBlur,
  handleAddressBlur,
}: RetirementFormProps) {
  return (
    <div className={sectionCls}>
      <div>
        <Label className={labelCls}>
          Account Type <span className="text-red-400">*</span>
        </Label>
        <Select
          value={form.retAccountType}
          onValueChange={(v) => {
            updateField("retAccountType", v);
            handleBlur("retAccountType");
          }}
        >
          <SelectTrigger className={`${inputCls} min-h-[44px]`}>
            <SelectValue placeholder="Select account type" />
          </SelectTrigger>
          <SelectContent>
            {RETIREMENT_ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.retAccountType && (
          <p className={errorCls}>{errors.retAccountType}</p>
        )}
      </div>

      <div>
        <Label className={labelCls}>
          Account Title <span className="text-red-400">*</span>
        </Label>
        <Input
          placeholder="FBO John Smith"
          value={form.retAccountTitle}
          onChange={(e) => updateField("retAccountTitle", e.target.value)}
          onBlur={() => handleBlur("retAccountTitle")}
          className={inputCls}
        />
        <p className="text-gray-500 text-xs mt-1">
          Format: FBO [Account Holder Name]
        </p>
        {errors.retAccountTitle && (
          <p className={errorCls}>{errors.retAccountTitle}</p>
        )}
      </div>

      <h4 className={sectionTitleCls}>Custodian Information</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>
            Custodian Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="e.g., Fidelity, Charles Schwab"
            value={form.retCustodianName}
            onChange={(e) =>
              updateField("retCustodianName", e.target.value)
            }
            onBlur={() => handleBlur("retCustodianName")}
            className={inputCls}
          />
          {errors.retCustodianName && (
            <p className={errorCls}>{errors.retCustodianName}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>
            Account Number <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="Account number"
            value={form.retCustodianAccountNumber}
            onChange={(e) =>
              updateField("retCustodianAccountNumber", e.target.value)
            }
            onBlur={() => handleBlur("retCustodianAccountNumber")}
            className={inputCls}
          />
          {errors.retCustodianAccountNumber && (
            <p className={errorCls}>{errors.retCustodianAccountNumber}</p>
          )}
        </div>
      </div>

      <TaxIdField
        type="ein"
        label="Custodian EIN"
        value={form.retCustodianEin}
        onChange={(raw) => updateField("retCustodianEin", raw)}
        showField={showEin}
        onToggleShow={onToggleShowEin}
        onFocus={onFocusEin}
        onBlur={onBlurEin}
      />

      <AddressFields
        which="custodianAddress"
        label="Custodian Address"
        address={form.custodianAddress}
        errors={errors}
        addressErrors={addressErrors}
        updateAddress={updateAddress}
        handleAddressBlur={handleAddressBlur}
        handleBlur={handleBlur}
      />

      <h4 className={sectionTitleCls}>Custodian Contact</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Contact Name</Label>
          <Input
            placeholder="Contact name"
            value={form.retCustodianContactName}
            onChange={(e) =>
              updateField("retCustodianContactName", e.target.value)
            }
            onBlur={() => handleBlur("retCustodianContactName")}
            className={inputCls}
          />
        </div>
        <div>
          <Label className={labelCls}>Contact Phone</Label>
          <Input
            type="tel"
            placeholder="(555) 123-4567"
            value={form.retCustodianContactPhone}
            onChange={(e) =>
              updateField("retCustodianContactPhone", e.target.value)
            }
            onBlur={() => handleBlur("retCustodianContactPhone")}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <Label className={labelCls}>Contact Email</Label>
        <Input
          type="email"
          placeholder="custodian@firm.com"
          value={form.retCustodianContactEmail}
          onChange={(e) =>
            updateField("retCustodianContactEmail", e.target.value)
          }
          onBlur={() => handleBlur("retCustodianContactEmail")}
          className={inputCls}
        />
      </div>

      <h4 className={sectionTitleCls}>Account Holder Information</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>
            Full Name <span className="text-red-400">*</span>
          </Label>
          <Input
            placeholder="John Smith"
            value={form.retAccountHolderName}
            onChange={(e) =>
              updateField("retAccountHolderName", e.target.value)
            }
            onBlur={() => handleBlur("retAccountHolderName")}
            className={inputCls}
          />
          {errors.retAccountHolderName && (
            <p className={errorCls}>{errors.retAccountHolderName}</p>
          )}
        </div>
        <div>
          <Label className={labelCls}>Date of Birth</Label>
          <Input
            type="date"
            value={form.retAccountHolderDob}
            onChange={(e) =>
              updateField("retAccountHolderDob", e.target.value)
            }
            onBlur={() => handleBlur("retAccountHolderDob")}
            className={inputCls}
          />
        </div>
      </div>

      <TaxIdField
        type="ssn"
        label="SSN"
        value={form.retAccountHolderSsn}
        onChange={(raw) => updateField("retAccountHolderSsn", raw)}
        showField={showSsn}
        onToggleShow={onToggleShowSsn}
        onFocus={onFocusSsn}
        onBlur={onBlurSsn}
        helperText="Encrypted with AES-256."
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Phone</Label>
          <Input
            type="tel"
            placeholder="(555) 123-4567"
            value={form.retAccountHolderPhone}
            onChange={(e) =>
              updateField("retAccountHolderPhone", e.target.value)
            }
            onBlur={() => handleBlur("retAccountHolderPhone")}
            className={inputCls}
          />
        </div>
        <div>
          <Label className={labelCls}>Email</Label>
          <Input
            type="email"
            placeholder="holder@email.com"
            value={form.retAccountHolderEmail}
            onChange={(e) =>
              updateField("retAccountHolderEmail", e.target.value)
            }
            onBlur={() => handleBlur("retAccountHolderEmail")}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 min-h-[44px]">
        <Checkbox
          id="custodianCoSign"
          checked={form.retCustodianCoSign}
          onCheckedChange={(checked) =>
            updateField("retCustodianCoSign", checked === true)
          }
          className="h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
        />
        <Label
          htmlFor="custodianCoSign"
          className="text-gray-300 text-sm cursor-pointer"
        >
          Custodian co-signature required on investment documents
        </Label>
      </div>
      <p className="text-gray-500 text-xs -mt-2">
        Most custodians require co-signature on investment documents.
      </p>

      <h4 className={sectionTitleCls}>Documents</h4>
      <UploadZone label="Custodian Statement (recent)" />
      <UploadZone label="Direction of Investment Letter" />
    </div>
  );
}
