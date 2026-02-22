"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Copy,
  QrCode,
  AlertTriangle,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { WizardData } from "../hooks/useWizardState";

interface Step5Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step5Dataroom({ data, updateField }: Step5Props) {
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; size: number }[]
  >([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-suggest dataroom name
  const suggestedName = data.dataroomName || `${data.companyName || "Company"} — Fund Dataroom`;
  const slug = (data.companyName || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shareableLink = `${data.customDomain || slug}.fundroom.ai/d/${slug}?ref=direct`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${shareableLink}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setUploadedFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ name: f.name, size: f.size })),
    ]);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Dataroom Setup
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure your secure document sharing room.
        </p>
      </div>

      {/* 506(b) Warning */}
      {data.regDExemption === "506B" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/30 dark:border-amber-800">
          <div className="flex gap-3">
            <AlertTriangle
              size={16}
              className="text-amber-600 shrink-0 mt-0.5"
            />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>506(b) Reminder:</strong> Under Rule 506(b), you cannot
              publicly advertise this offering. Only share this link with
              investors you have a pre-existing relationship with.
            </p>
          </div>
        </div>
      )}

      {/* Dataroom Name */}
      <div className="space-y-1.5">
        <Label>
          Dataroom Name <span className="text-red-500">*</span>
        </Label>
        <Input
          placeholder={suggestedName}
          value={data.dataroomName}
          onChange={(e) => updateField("dataroomName", e.target.value)}
          className="text-base sm:text-sm"
        />
      </div>

      {/* File Upload Zone */}
      <div className="space-y-1.5">
        <Label>Documents</Label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="flex flex-col items-center justify-center w-full min-h-[160px] border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#0066FF] hover:bg-blue-50/50 transition-colors dark:border-gray-600 dark:hover:bg-blue-950/20 p-6"
        >
          <Upload size={24} className="text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Drag and drop files here, or{" "}
            <span className="text-[#0066FF] font-medium">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Max 50MB per file. PDF, PPTX, XLSX, DOC, MP4
          </p>
        </div>
        {uploadedFiles.length > 0 && (
          <div className="space-y-2 mt-3">
            {uploadedFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({(file.size / 1024 / 1024).toFixed(1)}MB)
                  </span>
                </div>
                <button
                  onClick={() =>
                    setUploadedFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy Toggles */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Sharing Policies
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              field: "requireEmail" as const,
              label: "Require email",
              desc: "Builds your investor pipeline. Required for engagement scoring.",
            },
            {
              field: "watermark" as const,
              label: "Dynamic watermark",
              desc: "Shows viewer email overlaid on documents.",
            },
            {
              field: "passwordProtection" as const,
              label: "Password protection",
              desc: "Optional additional gate for sensitive materials.",
            },
            {
              field: "linkExpiration" as const,
              label: "Link expiration",
              desc: "Default: 30 days.",
            },
            {
              field: "allowDownloads" as const,
              label: "Allow downloads",
              desc: "Disabled by default for security.",
            },
            {
              field: "investButton" as const,
              label: '"I Want to Invest" button',
              desc: "Visible when fund is configured. Launches LP onboarding.",
            },
          ].map((toggle) => (
            <div
              key={toggle.field}
              className="flex items-center justify-between py-2 px-3 rounded-md border dark:border-gray-700"
            >
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {toggle.label}
                </p>
                <p className="text-xs text-gray-500">{toggle.desc}</p>
              </div>
              <Switch
                checked={data[toggle.field]}
                onCheckedChange={(checked) =>
                  updateField(toggle.field, checked)
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Shareable Link + QR Code */}
      <div className="rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Shareable Link
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-900 border text-sm font-mono text-gray-600 dark:text-gray-400 truncate">
            https://{shareableLink}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQr(!showQr)}
            className={cn(showQr && "bg-blue-50 border-[#0066FF] dark:bg-blue-950/30")}
          >
            <QrCode size={14} />
          </Button>
        </div>
        {showQr && (
          <div className="flex flex-col items-center gap-3 py-3 border-t dark:border-gray-700">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <QRCodeSVG
                value={`https://${shareableLink}`}
                size={160}
                bgColor="#FFFFFF"
                fgColor="#0A1628"
                level="M"
              />
            </div>
            <p className="text-xs text-gray-500">
              Scan to open the dataroom link
            </p>
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Advanced settings
      </button>
      {showAdvanced && (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-1.5">
            <Label>Custom Slug</Label>
            <Input
              placeholder={slug}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
