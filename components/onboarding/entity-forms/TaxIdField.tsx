"use client";

import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EncryptionBadge } from "@/components/ui/encryption-badge";
import {
  inputCls,
  labelCls,
  formatSsn,
  maskSsn,
  formatEin,
  maskEin,
} from "./shared-types";

export interface TaxIdFieldProps {
  /** Whether this is an SSN or EIN field */
  type: "ssn" | "ein";
  /** Label text displayed above the field */
  label: string;
  /** Whether the field is required (shows red asterisk) */
  required?: boolean;
  /** The raw digit string value */
  value: string;
  /** Called with the raw digit string on change */
  onChange: (rawDigits: string) => void;
  /** Whether the field is currently shown in cleartext */
  showField: boolean;
  /** Toggle show/hide */
  onToggleShow: () => void;
  /** Called on focus */
  onFocus: () => void;
  /** Called on blur */
  onBlur: () => void;
  /** Helper text displayed below the field */
  helperText?: string;
}

export default function TaxIdField({
  type,
  label,
  required = false,
  value,
  onChange,
  showField,
  onToggleShow,
  onFocus,
  onBlur,
  helperText,
}: TaxIdFieldProps) {
  const isSsn = type === "ssn";
  const format = isSsn ? formatSsn : formatEin;
  const mask = isSsn ? maskSsn : maskEin;
  const placeholder = isSsn
    ? showField
      ? "XXX-XX-XXXX"
      : "\u2022\u2022\u2022-\u2022\u2022-\u2022\u2022\u2022\u2022"
    : showField
      ? "XX-XXXXXXX"
      : "\u2022\u2022-\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

  return (
    <div>
      <Label className={`${labelCls} flex items-center gap-2`}>
        {label}{" "}
        {required && <span className="text-red-400">*</span>}
        <EncryptionBadge variant="compact" />
      </Label>
      <div className="relative mt-1">
        <Input
          type={showField ? "text" : "password"}
          inputMode="numeric"
          placeholder={placeholder}
          value={showField ? format(value) : mask(value)}
          onChange={(e) => {
            if (showField) {
              const raw = e.target.value.replace(/\D/g, "").slice(0, 9);
              onChange(raw);
            }
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          className={`${inputCls} pr-10`}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
          tabIndex={-1}
        >
          {showField ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {helperText && (
        <p className="text-gray-500 text-xs mt-1">{helperText}</p>
      )}
    </div>
  );
}
