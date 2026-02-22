"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Eye, Globe, Mail, Palette } from "lucide-react";
import type { WizardData } from "../hooks/useWizardState";

const SECTORS = [
  "Venture Capital",
  "Real Estate",
  "Private Equity",
  "Startup",
  "Other",
];
const GEOGRAPHIES = [
  "US",
  "North America",
  "Global",
  "Europe",
  "Asia",
  "Caribbean",
  "Other",
];

interface Step2Props {
  data: WizardData;
  updateField: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

export default function Step2Branding({ data, updateField }: Step2Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Logo must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/setup/upload-logo", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { url } = await res.json();
        updateField("logoUrl", url);
      } else {
        toast.error("Failed to upload logo. Please try again.");
      }
    } catch {
      toast.error("Network error uploading logo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex gap-8">
      {/* Form Panel */}
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Branding &amp; Company Profile
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Customize your investor-facing experience.
          </p>
        </div>

        {/* Logo Upload */}
        <div className="space-y-1.5">
          <Label>Company Logo</Label>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#0066FF] hover:bg-blue-50/50 transition-colors dark:border-gray-600 dark:hover:bg-blue-950/20"
          >
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo"
                className="h-16 object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <Upload size={20} />
                <span className="text-xs">
                  {uploading ? "Uploading..." : "Click to upload logo"}
                </span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <p className="text-xs text-gray-500">PNG, SVG, or JPG. Max 5MB.</p>
        </div>

        {/* Colors */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Brand Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.brandColor}
                onChange={(e) => updateField("brandColor", e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={data.brandColor}
                onChange={(e) => updateField("brandColor", e.target.value)}
                placeholder="#0A1628"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Accent Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.accentColor}
                onChange={(e) => updateField("accentColor", e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={data.accentColor}
                onChange={(e) => updateField("accentColor", e.target.value)}
                placeholder="#0066FF"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Domain & Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Custom Domain</Label>
            <Input
              placeholder="invest.yourfirm.com"
              value={data.customDomain}
              onChange={(e) => updateField("customDomain", e.target.value)}
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-gray-500">
              $10/month add-on. Default: yourorg.fundroom.ai
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Custom Email</Label>
            <Input
              placeholder="noreply@yourfirm.com"
              value={data.customEmail}
              onChange={(e) => updateField("customEmail", e.target.value)}
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-gray-500">
              Default: noreply@fundroom.ai
            </p>
          </div>
        </div>

        {/* Company Profile */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Company Profile
          </h3>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Investment firm focused on franchise acquisitions..."
              value={data.description}
              onChange={(e) => updateField("description", e.target.value)}
              maxLength={280}
              rows={3}
            />
            <p className="text-xs text-gray-500">
              {data.description.length}/280 characters. Used in dataroom and marketplace.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <select
                value={data.sector}
                onChange={(e) => updateField("sector", e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="">Select sector</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Geography</Label>
              <select
                value={data.geography}
                onChange={(e) => updateField("geography", e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="">Select geography</option>
                {GEOGRAPHIES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                placeholder="https://yourfirm.com"
                value={data.website}
                onChange={(e) => updateField("website", e.target.value)}
                className="text-base sm:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Founded Year</Label>
              <Input
                type="number"
                placeholder="2024"
                value={data.foundedYear}
                onChange={(e) => updateField("foundedYear", e.target.value)}
                className="text-base sm:text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview Panel */}
      <div className="hidden lg:block w-[360px] shrink-0">
        <div className="sticky top-8">
          <div className="rounded-lg border bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div
              className="p-4"
              style={{ backgroundColor: data.brandColor || "#0A1628" }}
            >
              <div className="flex items-center gap-3">
                {data.logoUrl ? (
                  <img
                    src={data.logoUrl}
                    alt="Logo preview"
                    className="h-8 w-8 rounded object-contain bg-white/10"
                  />
                ) : (
                  <div className="h-8 w-8 rounded bg-white/20 flex items-center justify-center">
                    <Palette size={16} className="text-white/60" />
                  </div>
                )}
                <span className="text-white font-semibold text-sm">
                  {data.companyName || "Your Company"}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dataroom Preview
              </div>
              <div className="space-y-2">
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
              <button
                className="w-full py-2.5 rounded-lg text-white text-sm font-semibold"
                style={{
                  backgroundColor: data.accentColor || "#0066FF",
                }}
              >
                I Want to Invest
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">
            Live preview
          </p>
        </div>
      </div>
    </div>
  );
}
