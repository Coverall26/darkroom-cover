/**
 * E-Signature Field Type Definitions & Validation
 *
 * Supports all 16 field types including new ones:
 * DROPDOWN, RADIO, NUMERIC, CURRENCY, ATTACHMENT, FORMULA
 *
 * Each field type has:
 * - Validation rules
 * - Default dimensions
 * - Auto-fill capability
 * - Rendering hints for the UI
 */

export type FieldType =
  | "SIGNATURE"
  | "INITIALS"
  | "DATE_SIGNED"
  | "TEXT"
  | "CHECKBOX"
  | "NAME"
  | "EMAIL"
  | "COMPANY"
  | "TITLE"
  | "ADDRESS"
  | "DROPDOWN"
  | "RADIO"
  | "NUMERIC"
  | "CURRENCY"
  | "ATTACHMENT"
  | "FORMULA";

export interface FieldTypeConfig {
  type: FieldType;
  label: string;
  icon: string; // Lucide icon name
  description: string;
  category: "signature" | "auto-fill" | "input" | "advanced";
  isAutoFill: boolean; // Can be auto-filled from signer data
  requiresOptions: boolean; // Needs options array (dropdown, radio)
  requiresFormat: boolean; // Needs fieldFormat (numeric, currency)
  defaultWidth: number; // Default width as % of page
  defaultHeight: number; // Default height as % of page
  minWidth: number;
  minHeight: number;
}

export const FIELD_TYPE_CONFIGS: Record<FieldType, FieldTypeConfig> = {
  SIGNATURE: {
    type: "SIGNATURE",
    label: "Signature",
    icon: "Pen",
    description: "Hand-drawn, typed, or uploaded signature",
    category: "signature",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 5,
    minWidth: 10,
    minHeight: 3,
  },
  INITIALS: {
    type: "INITIALS",
    label: "Initials",
    icon: "Type",
    description: "Signer's initials",
    category: "signature",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 8,
    defaultHeight: 4,
    minWidth: 5,
    minHeight: 3,
  },
  DATE_SIGNED: {
    type: "DATE_SIGNED",
    label: "Date Signed",
    icon: "Calendar",
    description: "Auto-filled with signing date",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 15,
    defaultHeight: 3,
    minWidth: 10,
    minHeight: 2,
  },
  TEXT: {
    type: "TEXT",
    label: "Text",
    icon: "AlignLeft",
    description: "Free text input field",
    category: "input",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 3,
    minWidth: 5,
    minHeight: 2,
  },
  CHECKBOX: {
    type: "CHECKBOX",
    label: "Checkbox",
    icon: "CheckSquare",
    description: "Single checkbox (checked/unchecked)",
    category: "input",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 3,
    defaultHeight: 3,
    minWidth: 2,
    minHeight: 2,
  },
  NAME: {
    type: "NAME",
    label: "Full Name",
    icon: "User",
    description: "Auto-filled from signer profile",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 3,
    minWidth: 10,
    minHeight: 2,
  },
  EMAIL: {
    type: "EMAIL",
    label: "Email",
    icon: "Mail",
    description: "Auto-filled from signer email",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 3,
    minWidth: 10,
    minHeight: 2,
  },
  COMPANY: {
    type: "COMPANY",
    label: "Company",
    icon: "Building2",
    description: "Company or entity name",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 3,
    minWidth: 10,
    minHeight: 2,
  },
  TITLE: {
    type: "TITLE",
    label: "Title",
    icon: "Briefcase",
    description: "Job title or role",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 15,
    defaultHeight: 3,
    minWidth: 8,
    minHeight: 2,
  },
  ADDRESS: {
    type: "ADDRESS",
    label: "Address",
    icon: "MapPin",
    description: "Mailing or physical address",
    category: "auto-fill",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 25,
    defaultHeight: 5,
    minWidth: 15,
    minHeight: 3,
  },
  // === NEW FIELD TYPES ===
  DROPDOWN: {
    type: "DROPDOWN",
    label: "Dropdown",
    icon: "ChevronDown",
    description: "Select from predefined options",
    category: "input",
    isAutoFill: false,
    requiresOptions: true,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 3,
    minWidth: 10,
    minHeight: 2,
  },
  RADIO: {
    type: "RADIO",
    label: "Radio Group",
    icon: "Circle",
    description: "Select one from a group of options",
    category: "input",
    isAutoFill: false,
    requiresOptions: true,
    requiresFormat: false,
    defaultWidth: 3,
    defaultHeight: 3,
    minWidth: 2,
    minHeight: 2,
  },
  NUMERIC: {
    type: "NUMERIC",
    label: "Number",
    icon: "Hash",
    description: "Numeric input (integer, decimal, or percentage)",
    category: "input",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: true,
    defaultWidth: 15,
    defaultHeight: 3,
    minWidth: 8,
    minHeight: 2,
  },
  CURRENCY: {
    type: "CURRENCY",
    label: "Currency",
    icon: "DollarSign",
    description: "Currency amount with formatting",
    category: "input",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: true,
    defaultWidth: 15,
    defaultHeight: 3,
    minWidth: 8,
    minHeight: 2,
  },
  ATTACHMENT: {
    type: "ATTACHMENT",
    label: "Attachment",
    icon: "Paperclip",
    description: "Request a file upload from signer",
    category: "advanced",
    isAutoFill: false,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 20,
    defaultHeight: 5,
    minWidth: 15,
    minHeight: 4,
  },
  FORMULA: {
    type: "FORMULA",
    label: "Formula",
    icon: "Calculator",
    description: "Auto-calculated from other fields",
    category: "advanced",
    isAutoFill: true,
    requiresOptions: false,
    requiresFormat: false,
    defaultWidth: 15,
    defaultHeight: 3,
    minWidth: 8,
    minHeight: 2,
  },
};

// ============================================================================
// Field Validation
// ============================================================================

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFieldValue(
  type: FieldType,
  value: string | null | undefined,
  options?: {
    required?: boolean;
    fieldOptions?: string[]; // For DROPDOWN/RADIO
    fieldFormat?: string; // For NUMERIC/CURRENCY
    minValue?: number;
    maxValue?: number;
  }
): FieldValidationResult {
  // Required check
  if (options?.required && (!value || value.trim() === "")) {
    return { valid: false, error: "This field is required" };
  }

  // Empty non-required field is valid
  if (!value || value.trim() === "") {
    return { valid: true };
  }

  switch (type) {
    case "DROPDOWN":
      if (options?.fieldOptions && !options.fieldOptions.includes(value)) {
        return { valid: false, error: "Please select a valid option" };
      }
      return { valid: true };

    case "RADIO":
      if (options?.fieldOptions && !options.fieldOptions.includes(value)) {
        return { valid: false, error: "Please select a valid option" };
      }
      return { valid: true };

    case "NUMERIC": {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return { valid: false, error: "Please enter a valid number" };
      }
      if (options?.fieldFormat === "integer" && !Number.isInteger(num)) {
        return { valid: false, error: "Please enter a whole number" };
      }
      if (options?.fieldFormat === "percentage" && (num < 0 || num > 100)) {
        return { valid: false, error: "Percentage must be between 0 and 100" };
      }
      if (options?.minValue !== undefined && num < options.minValue) {
        return { valid: false, error: `Minimum value is ${options.minValue}` };
      }
      if (options?.maxValue !== undefined && num > options.maxValue) {
        return { valid: false, error: `Maximum value is ${options.maxValue}` };
      }
      return { valid: true };
    }

    case "CURRENCY": {
      // Strip currency symbols and commas
      const cleaned = value.replace(/[$€£¥,\s]/g, "");
      const amount = parseFloat(cleaned);
      if (isNaN(amount)) {
        return { valid: false, error: "Please enter a valid amount" };
      }
      if (amount < 0) {
        return { valid: false, error: "Amount cannot be negative" };
      }
      if (options?.minValue !== undefined && amount < options.minValue) {
        return { valid: false, error: `Minimum amount is ${options.minValue}` };
      }
      if (options?.maxValue !== undefined && amount > options.maxValue) {
        return { valid: false, error: `Maximum amount is ${options.maxValue}` };
      }
      return { valid: true };
    }

    case "EMAIL": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: "Please enter a valid email address" };
      }
      return { valid: true };
    }

    case "CHECKBOX":
      if (value !== "true" && value !== "false" && value !== "checked" && value !== "unchecked") {
        return { valid: false, error: "Invalid checkbox value" };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

// ============================================================================
// Format field value for display
// ============================================================================

export function formatFieldValue(
  type: FieldType,
  value: string | null | undefined,
  fieldFormat?: string
): string {
  if (!value) return "";

  switch (type) {
    case "CURRENCY": {
      const cleaned = value.replace(/[$€£¥,\s]/g, "");
      const amount = parseFloat(cleaned);
      if (isNaN(amount)) return value;
      const currencyCode = fieldFormat || "USD";
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currencyCode,
        }).format(amount);
      } catch {
        return `$${amount.toFixed(2)}`;
      }
    }

    case "NUMERIC": {
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      if (fieldFormat === "percentage") return `${num}%`;
      if (fieldFormat === "integer") return Math.round(num).toString();
      return num.toLocaleString();
    }

    case "DATE_SIGNED":
      try {
        return new Date(value).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      } catch {
        return value;
      }

    case "CHECKBOX":
      return value === "true" || value === "checked" ? "✓" : "";

    default:
      return value;
  }
}

// ============================================================================
// Evaluate formula field
// ============================================================================

export function evaluateFormula(
  formula: string,
  fieldValues: Record<string, string>
): string {
  try {
    // Simple formula evaluation: supports +, -, *, /
    // Replace field references with their numeric values
    let expression = formula;
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      const numValue = parseFloat(value.replace(/[$€£¥,\s]/g, ""));
      if (!isNaN(numValue)) {
        expression = expression.replace(new RegExp(fieldId, "g"), numValue.toString());
      }
    }

    // Only allow safe characters: numbers, operators, parentheses, spaces, decimals
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return "ERROR";
    }

    // Use Function constructor for safe-ish evaluation (no access to globals)
    const result = new Function(`"use strict"; return (${expression})`)();
    if (typeof result !== "number" || isNaN(result) || !isFinite(result)) {
      return "ERROR";
    }

    return result.toString();
  } catch {
    return "ERROR";
  }
}

// ============================================================================
// Get fields grouped by category for the field palette
// ============================================================================

export function getFieldPalette(): {
  category: string;
  label: string;
  fields: FieldTypeConfig[];
}[] {
  const categories = [
    { category: "signature", label: "Signature Fields" },
    { category: "auto-fill", label: "Auto-Fill Fields" },
    { category: "input", label: "Input Fields" },
    { category: "advanced", label: "Advanced Fields" },
  ];

  return categories.map((cat) => ({
    ...cat,
    fields: Object.values(FIELD_TYPE_CONFIGS).filter(
      (f) => f.category === cat.category
    ),
  }));
}
