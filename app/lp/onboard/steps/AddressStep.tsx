"use client";

/**
 * AddressStep — LP Onboarding Step 3.
 * Collects: mailing address (street, city, state, zip, country).
 * Address is optional during onboarding but required before signing.
 * PO Box validation handled by parent via addressError prop.
 * Pure UI — state managed by parent.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormData, UpdateFieldFn } from "./types";
import { US_STATES } from "./types";

interface AddressStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
  addressError?: string;
}

export default function AddressStep({
  formData,
  updateField,
  addressError,
}: AddressStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-300">Street Address</Label>
        <Input
          placeholder="123 Main Street"
          autoComplete="street-address"
          value={formData.street1}
          onChange={(e) => updateField("street1", e.target.value)}
          className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
        />
      </div>
      <div>
        <Label className="text-gray-300">Suite / Unit (optional)</Label>
        <Input
          placeholder="Suite 100"
          value={formData.street2}
          onChange={(e) => updateField("street2", e.target.value)}
          className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-gray-300">City</Label>
          <Input
            placeholder="City"
            autoComplete="address-level2"
            value={formData.city}
            onChange={(e) => updateField("city", e.target.value)}
            className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
          />
        </div>
        <div>
          <Label className="text-gray-300">State</Label>
          <Select value={formData.state} onValueChange={(v) => updateField("state", v)}>
            <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-gray-300">ZIP Code</Label>
          <Input
            placeholder="12345"
            inputMode="numeric"
            autoComplete="postal-code"
            value={formData.zip}
            onChange={(e) => updateField("zip", e.target.value)}
            className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
          />
        </div>
        <div>
          <Label className="text-gray-300">Country</Label>
          <Select value={formData.country} onValueChange={(v) => updateField("country", v)}>
            <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white">
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
      {addressError && (
        <p className="text-red-400 text-sm" role="alert">{addressError}</p>
      )}
      <p className="text-gray-500 text-xs">
        A physical street address is required for SEC filings.
        You can complete this later if needed.
      </p>
    </div>
  );
}
