"use client";

/**
 * PersonalInfoStep — LP Onboarding Step 1.
 * Collects: full name, email, phone, optional password with strength indicator.
 * Pure UI + validation — state managed by parent.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import {
  PasswordStrengthIndicator,
  validatePasswordStrength,
} from "@/components/auth/password-strength-indicator";
import type { FormData, UpdateFieldFn } from "./types";

interface PersonalInfoStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
}

export default function PersonalInfoStep({
  formData,
  updateField,
}: PersonalInfoStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name" className="text-gray-300">Full Name</Label>
        <div className="relative mt-1">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="John Smith"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="email" className="text-gray-300">Email Address</Label>
        <div className="relative mt-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="phone" className="text-gray-300">Phone (optional)</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+1 (555) 123-4567"
          value={formData.phone}
          onChange={(e) => updateField("phone", e.target.value)}
          className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
        />
      </div>

      {/* Password fields */}
      <div className="pt-2 border-t border-gray-700">
        <Label htmlFor="password" className="text-gray-300">Password</Label>
        <p className="text-gray-500 text-xs mb-1">Set a password to access your investor portal. Leave blank to use email magic links instead.</p>
        <div className="relative mt-1">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Min 8 chars, 1 number, 1 special"
            value={formData.password}
            onChange={(e) => updateField("password", e.target.value)}
            className="pl-10 pr-10 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-3"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {formData.password && (
          <PasswordStrengthIndicator password={formData.password} className="mt-2" />
        )}
      </div>

      {formData.password && (
        <div>
          <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              className="pl-10 pr-10 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-3"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Validation: can proceed from step 1? */
export function canProceedStep1(formData: FormData): boolean {
  const passwordValid = formData.password
    ? validatePasswordStrength(formData.password).isValid && formData.password === formData.confirmPassword
    : true; // Password is optional — if not provided, magic link will be used
  return !!(formData.name.trim() && formData.email.trim() && passwordValid);
}
