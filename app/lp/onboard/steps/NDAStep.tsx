"use client";

/**
 * NDAStep — LP Onboarding Step 5.
 * Displays: NDA text, acceptance checkbox, signature capture (typed or drawn).
 * Includes review summary of prior steps.
 * Pure UI — canvas state and signature data managed via props.
 */

import { useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ENTITY_TYPE_OPTIONS, ACCREDITATION_METHODS } from "@/lib/entity";
import type { FormData, UpdateFieldFn } from "./types";

interface NDAStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
  /** Current drawn signature data URL (null if no drawing yet) */
  ndaSignatureDataUrl: string | null;
  /** Called when drawn signature data changes */
  onSignatureDataUrlChange: (url: string | null) => void;
}

export default function NDAStep({
  formData,
  updateField,
  ndaSignatureDataUrl,
  onSignatureDataUrlChange,
}: NDAStepProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );
  }, []);

  const draw = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#10B981";
    ctx.lineTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );
    ctx.stroke();
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureDataUrlChange(canvas.toDataURL("image/png"));
      updateField("ndaSignatureMethod", "DRAWN");
    }
  }, [isDrawing, onSignatureDataUrlChange, updateField]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureDataUrlChange(null);
    if (formData.ndaSignatureMethod === "DRAWN") {
      updateField("ndaSignatureMethod", "");
    }
  }, [formData.ndaSignatureMethod, onSignatureDataUrlChange, updateField]);

  return (
    <div className="space-y-4">
      <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 max-h-64 overflow-y-auto">
        <h4 className="text-white font-medium text-sm mb-2">
          Confidentiality & Non-Disclosure Agreement
        </h4>
        <div className="text-gray-400 text-xs space-y-2 leading-relaxed">
          <p>
            This Non-Disclosure Agreement (&quot;Agreement&quot;) is entered into as of {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} by the undersigned investor (&quot;Receiving Party&quot;) for the benefit of the fund and its general partner (&quot;Disclosing Party&quot;).
          </p>
          <p>
            <strong className="text-gray-300">1. Confidential Information.</strong>{" "}
            &quot;Confidential Information&quot; means all non-public information disclosed by the Disclosing Party, including but not limited to: financial data, business plans, investment strategies, portfolio information, investor lists, fund performance data, trade secrets, and proprietary technology.
          </p>
          <p>
            <strong className="text-gray-300">2. Non-Disclosure.</strong>{" "}
            The Receiving Party agrees to keep all Confidential Information strictly confidential and shall not disclose, reproduce, or distribute any Confidential Information to third parties without prior written consent from the Disclosing Party.
          </p>
          <p>
            <strong className="text-gray-300">3. Permitted Use.</strong>{" "}
            Confidential Information may only be used for the purpose of evaluating and managing the Receiving Party&apos;s investment in the fund.
          </p>
          <p>
            <strong className="text-gray-300">4. Duration.</strong>{" "}
            This obligation survives for a period of two (2) years following the Receiving Party&apos;s last access to Confidential Information.
          </p>
          <p>
            <strong className="text-gray-300">5. Remedies.</strong>{" "}
            The Receiving Party acknowledges that any breach of this Agreement may cause irreparable harm and that the Disclosing Party shall be entitled to seek injunctive relief in addition to any other legal remedies.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 min-h-[44px]">
        <Checkbox
          id="ndaAccepted"
          checked={formData.ndaAccepted}
          onCheckedChange={(checked) =>
            updateField("ndaAccepted", checked === true)
          }
          className="mt-1 h-5 w-5 border-gray-500 data-[state=checked]:bg-emerald-600"
        />
        <Label htmlFor="ndaAccepted" className="text-gray-300 text-sm leading-relaxed cursor-pointer">
          I have read and agree to this Non-Disclosure Agreement.
        </Label>
      </div>

      {/* Signature Capture Area */}
      {formData.ndaAccepted && (
        <div className="space-y-3 pt-3 border-t border-gray-700">
          <Label className="text-gray-300 text-sm font-medium">Your Signature</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                updateField("ndaSignatureMethod", "TYPED");
                onSignatureDataUrlChange(null);
              }}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg border text-sm transition-colors ${
                formData.ndaSignatureMethod === "TYPED"
                  ? "border-emerald-500 bg-emerald-500/10 text-white"
                  : "border-gray-600 bg-gray-700/30 text-gray-400 hover:border-gray-500"
              }`}
            >
              Type Name
            </button>
            <button
              type="button"
              onClick={() => {
                updateField("ndaSignatureMethod", "DRAWN");
                updateField("ndaTypedName", "");
              }}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg border text-sm transition-colors ${
                formData.ndaSignatureMethod === "DRAWN"
                  ? "border-emerald-500 bg-emerald-500/10 text-white"
                  : "border-gray-600 bg-gray-700/30 text-gray-400 hover:border-gray-500"
              }`}
            >
              Draw Signature
            </button>
          </div>

          {formData.ndaSignatureMethod === "TYPED" && (
            <div>
              <Input
                type="text"
                placeholder="Type your full legal name"
                value={formData.ndaTypedName}
                onChange={(e) => updateField("ndaTypedName", e.target.value)}
                className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm"
                style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.25rem" }}
              />
              {formData.ndaTypedName && (
                <div className="mt-2 p-3 bg-gray-700/20 border border-gray-600 rounded-lg text-center">
                  <p className="text-emerald-400 text-2xl" style={{ fontFamily: "'Dancing Script', cursive" }}>
                    {formData.ndaTypedName}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          )}

          {formData.ndaSignatureMethod === "DRAWN" && (
            <div>
              <div className="relative bg-gray-700/30 border border-gray-600 rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={160}
                  className="w-full cursor-crosshair touch-none"
                  style={{ msTouchAction: "none" }}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerLeave={stopDrawing}
                />
                {!ndaSignatureDataUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-gray-500 text-sm">Sign here</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-gray-400 text-xs hover:text-white mt-1 min-h-[44px]"
              >
                Clear signature
              </button>
            </div>
          )}

          <p className="text-gray-500 text-xs">
            Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      )}

      <div className="bg-gray-700/20 rounded-lg p-3 border border-gray-700">
        <h4 className="text-white text-sm font-medium mb-1">Review Summary</h4>
        <div className="text-gray-400 text-xs space-y-1">
          <p><span className="text-gray-300">Name:</span> {formData.name}</p>
          <p><span className="text-gray-300">Email:</span> {formData.email}</p>
          <p><span className="text-gray-300">Entity:</span>{" "}
            {formData.entityType === "INDIVIDUAL"
              ? "Individual"
              : `${ENTITY_TYPE_OPTIONS.find((o) => o.value === formData.entityType)?.label} — ${formData.entityName}`}
          </p>
          <p><span className="text-gray-300">Accreditation:</span>{" "}
            {ACCREDITATION_METHODS.find((m) => m.value === formData.accreditationType)?.label || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Validation: can proceed from step 5? */
export function canProceedStep5(
  formData: FormData,
  ndaSignatureDataUrl: string | null,
): boolean {
  const hasNdaSignature =
    (formData.ndaSignatureMethod === "TYPED" && formData.ndaTypedName.trim().length > 0) ||
    (formData.ndaSignatureMethod === "DRAWN" && !!ndaSignatureDataUrl);
  return !!(formData.ndaAccepted && hasNdaSignature);
}
