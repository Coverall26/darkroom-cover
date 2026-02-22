"use client";

import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { labelCls } from "./shared-types";

export interface UploadZoneProps {
  /** Label text above the upload area */
  label: string;
  /** Optional helper text below the upload area */
  helper?: string;
}

export default function UploadZone({ label, helper }: UploadZoneProps) {
  return (
    <div className="space-y-1">
      <Label className={labelCls}>{label}</Label>
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-gray-500 transition-colors cursor-pointer">
        <Upload className="h-6 w-6 text-gray-500 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">
          Drag & drop or click to upload
        </p>
        <p className="text-gray-500 text-xs mt-1">PDF, PNG, JPG up to 10MB</p>
      </div>
      {helper && <p className="text-gray-500 text-xs">{helper}</p>}
    </div>
  );
}
