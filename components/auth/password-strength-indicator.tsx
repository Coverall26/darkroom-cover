"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /\d/.test(pw) },
  { label: "One special character", test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

function getStrengthLevel(score: number): {
  label: string;
  color: string;
  barColor: string;
} {
  if (score <= 1) return { label: "Weak", color: "text-red-500", barColor: "bg-red-500" };
  if (score <= 2) return { label: "Fair", color: "text-orange-500", barColor: "bg-orange-500" };
  if (score <= 3) return { label: "Good", color: "text-amber-500", barColor: "bg-amber-500" };
  if (score <= 4) return { label: "Strong", color: "text-emerald-500", barColor: "bg-emerald-500" };
  return { label: "Very Strong", color: "text-green-500", barColor: "bg-green-500" };
}

export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  passedRules: boolean[];
} {
  const passedRules = PASSWORD_RULES.map((rule) => rule.test(password));
  const score = passedRules.filter(Boolean).length;
  // Require at least 8 chars, one number, and one special char per Master Plan spec
  const isValid = passedRules[0] && passedRules[3] && passedRules[4];
  return { isValid, score, passedRules };
}

export function PasswordStrengthIndicator({
  password,
  className,
}: PasswordStrengthIndicatorProps) {
  const { score, passedRules } = useMemo(
    () => validatePasswordStrength(password),
    [password],
  );
  const strength = getStrengthLevel(score);

  if (!password) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-200",
                i < score ? strength.barColor : "bg-gray-700",
              )}
            />
          ))}
        </div>
        <span className={cn("text-xs font-medium", strength.color)}>
          {strength.label}
        </span>
      </div>

      {/* Rules checklist */}
      <ul className="space-y-1">
        {PASSWORD_RULES.map((rule, i) => (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors duration-200",
              passedRules[i] ? "text-green-400" : "text-gray-500",
            )}
          >
            {passedRules[i] ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <X className="h-3 w-3 shrink-0" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
