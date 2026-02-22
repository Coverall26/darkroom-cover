"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { toast } from "sonner";
import {
  CheckCircle2,
  PenIcon,
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  AlertCircleIcon,
  UploadIcon,
  TypeIcon,
  PenTool,
  Maximize2,
  XIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  FileTextIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ESIGN_CONSENT_TEXT } from "@/lib/signature/checksum";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ----- Types -----

export interface SignatureField {
  id: string;
  type:
    | "SIGNATURE"
    | "INITIALS"
    | "TEXT"
    | "CHECKBOX"
    | "DATE_SIGNED"
    | "NAME"
    | "EMAIL"
    | "COMPANY"
    | "TITLE"
    | "ADDRESS";
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label: string | null;
  placeholder: string | null;
  value: string | null;
  recipientId?: string;
}

export interface InvestorAutoFillData {
  investorName: string;
  entityName?: string;
  investmentAmount?: number;
  email?: string;
  address?: string;
  company?: string;
  title?: string;
}

export interface SigningDocument {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fields: SignatureField[];
  recipientId: string;
  recipientStatus: string;
  signingToken: string;
  signedAt: string | null;
}

interface SigningQueueItem {
  id: string;
  title: string;
  status: "pending" | "signing" | "signed";
  signingToken: string;
}

interface FundRoomSignProps {
  /** Single document mode */
  document?: SigningDocument;
  /** Multi-document queue mode */
  documents?: SigningDocument[];
  /** Pre-filled investor data */
  investorData?: InvestorAutoFillData;
  /** Called when all documents are signed */
  onComplete: () => void;
  /** Called on progress update */
  onProgress?: (signed: number, total: number) => void;
  /** Fund ID for API calls */
  fundId?: string;
}

// ----- Signature Capture Component (Draw / Type / Upload) -----

interface SignatureCaptureProps {
  onCapture: (dataUrl: string) => void;
  initialName?: string;
  isInitials?: boolean;
  className?: string;
}

function SignatureCapture({
  onCapture,
  initialName = "",
  isInitials = false,
  className,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"draw" | "type" | "upload">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [typedText, setTypedText] = useState(initialName);
  const [selectedFont, setSelectedFont] = useState("'Dancing Script', cursive");
  const strokesRef = useRef<Array<{ x: number; y: number }[]>>([]);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

  const canvasWidth = isInitials ? 200 : 400;
  const canvasHeight = isInitials ? 100 : 200;

  const fonts = [
    { id: "dancing", font: "'Dancing Script', cursive", label: "Script" },
    { id: "caveat", font: "'Caveat', cursive", label: "Casual" },
    { id: "homemade", font: "'Homemade Apple', cursive", label: "Natural" },
  ];

  useEffect(() => {
    redrawCanvas();
  }, []);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Signature line
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, canvas.height - 16);
    ctx.lineTo(canvas.width - 16, canvas.height - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    // Redraw strokes
    strokesRef.current.forEach((stroke) => {
      if (stroke.length < 2) return;
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    });
  };

  const getCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (mode !== "draw") return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    currentStrokeRef.current = [{ x, y }];
  };

  const continueDraw = (e: React.PointerEvent) => {
    if (!isDrawing || mode !== "draw") return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    currentStrokeRef.current.push({ x, y });
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pts = currentStrokeRef.current;
    if (pts.length >= 2) {
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    setHasContent(true);
  };

  const endDraw = (e?: React.PointerEvent) => {
    if (e) {
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch {}
    }
    if (isDrawing && currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current]);
      currentStrokeRef.current = [];
      emitSignature();
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setHasContent(false);
    setTypedText("");
    redrawCanvas();
  };

  const emitSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onCapture(canvas.toDataURL("image/png"));
    }
  };

  const updateTypedSignature = (text: string, font: string) => {
    setTypedText(text);
    setSelectedFont(font);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Signature line
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, canvas.height - 16);
    ctx.lineTo(canvas.width - 16, canvas.height - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    if (text.trim()) {
      const fontSize = isInitials ? 28 : 36;
      ctx.font = `${fontSize}px ${font}`;
      ctx.fillStyle = "#1a1a2e";
      ctx.textBaseline = "middle";
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, (canvas.width - textWidth) / 2, canvas.height / 2);
      setHasContent(true);
      onCapture(canvas.toDataURL("image/png"));
    } else {
      setHasContent(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a PNG or JPG image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Fit image maintaining aspect ratio
        const scale = Math.min(
          (canvas.width - 32) / img.width,
          (canvas.height - 32) / img.height,
        );
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        setHasContent(true);
        onCapture(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as "draw" | "type" | "upload");
          clearCanvas();
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw" className="min-h-[44px]">
            <PenTool className="h-4 w-4 mr-1.5" />
            Draw
          </TabsTrigger>
          <TabsTrigger value="type" className="min-h-[44px]">
            <TypeIcon className="h-4 w-4 mr-1.5" />
            Type
          </TabsTrigger>
          <TabsTrigger value="upload" className="min-h-[44px]">
            <UploadIcon className="h-4 w-4 mr-1.5" />
            Upload
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "type" && (
        <div className="space-y-2">
          <Input
            value={typedText}
            onChange={(e) => updateTypedSignature(e.target.value, selectedFont)}
            placeholder={isInitials ? "Your initials (e.g. JS)" : "Type your full legal name..."}
            className="text-base"
            autoComplete="name"
          />
          <div className="flex gap-2 flex-wrap">
            {fonts.map((f) => (
              <button
                key={f.id}
                onClick={() => updateTypedSignature(typedText, f.font)}
                className={cn(
                  "px-3 py-1.5 min-h-[44px] rounded text-sm transition-colors",
                  selectedFont === f.font
                    ? "bg-[#0066FF] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
                style={{ fontFamily: f.font }}
                aria-current={selectedFont === f.font ? "true" : undefined}
                aria-label={`${f.label} font style`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
          <UploadIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-2">
            Upload a signature image (PNG or JPG)
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleUpload}
            className="text-sm w-full"
          />
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full rounded-lg border border-gray-200 cursor-crosshair touch-none select-none bg-white"
          role="img"
          aria-label={isInitials ? "Initials drawing area. Use pointer or touch to draw your initials." : "Signature drawing area. Use pointer or touch to draw your signature."}
          style={{
            touchAction: "none",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            msTouchAction: "none",
            minHeight: isInitials ? 80 : 120,
          }}
          onPointerDown={startDraw}
          onPointerMove={continueDraw}
          onPointerUp={endDraw}
          onPointerLeave={() => endDraw()}
          onPointerCancel={() => endDraw()}
        />
        {!hasContent && mode === "draw" && (
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
            {isInitials ? "Draw initials here" : "Draw signature here"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={clearCanvas} className="min-h-[44px]">
          Clear
        </Button>
        {hasContent && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Captured
          </span>
        )}
      </div>
    </div>
  );
}

// ----- Main FundRoomSign Component -----

export default function FundRoomSign({
  document: singleDoc,
  documents: multiDocs,
  investorData,
  onComplete,
  onProgress,
  fundId,
}: FundRoomSignProps) {
  // Normalize to queue
  const allDocs = multiDocs || (singleDoc ? [singleDoc] : []);
  const [queue, setQueue] = useState<SigningQueueItem[]>(() =>
    allDocs.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.signedAt ? "signed" : ("pending" as const),
      signingToken: d.signingToken,
    })),
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeDoc, setActiveDoc] = useState<SigningDocument | null>(null);

  // PDF state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

  // Signing state
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [initialsData, setInitialsData] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const signedCount = queue.filter((q) => q.status === "signed").length;
  const totalCount = queue.length;
  const allSigned = signedCount === totalCount && totalCount > 0;

  // Pre-fill auto-fill fields when doc loads
  const prefillFields = useCallback(
    (doc: SigningDocument) => {
      const values: Record<string, string> = {};
      doc.fields.forEach((field) => {
        switch (field.type) {
          case "NAME":
            values[field.id] = investorData?.investorName || "";
            break;
          case "EMAIL":
            values[field.id] = investorData?.email || "";
            break;
          case "DATE_SIGNED":
            values[field.id] = new Date().toLocaleDateString();
            break;
          case "COMPANY":
            values[field.id] = investorData?.entityName || investorData?.company || "";
            break;
          case "TITLE":
            values[field.id] = investorData?.title || "";
            break;
          case "ADDRESS":
            values[field.id] = investorData?.address || "";
            break;
          default:
            if (field.value) values[field.id] = field.value;
        }
      });
      setFieldValues(values);
    },
    [investorData],
  );

  const openDocument = (index: number) => {
    const doc = allDocs[index];
    if (!doc) return;
    setActiveIndex(index);
    setActiveDoc(doc);
    setCurrentPage(1);
    setScale(1.0);
    setPdfLoading(true);
    setSignatureData(null);
    setInitialsData(null);
    setConsentConfirmed(false);
    prefillFields(doc);
    setQueue((prev) =>
      prev.map((q, i) => (i === index ? { ...q, status: "signing" } : q)),
    );
  };

  const handleFieldClick = (field: SignatureField) => {
    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      setActiveFieldId(field.id);
      setShowSignatureModal(true);
    }
  };

  const handleSignatureCapture = (dataUrl: string) => {
    if (!activeFieldId || !activeDoc) return;
    const field = activeDoc.fields.find((f) => f.id === activeFieldId);
    if (field?.type === "INITIALS") {
      setInitialsData(dataUrl);
    } else {
      setSignatureData(dataUrl);
    }
    setFieldValues((prev) => ({ ...prev, [activeFieldId]: "signed" }));
    setShowSignatureModal(false);
    setActiveFieldId(null);
  };

  const isFieldComplete = (field: SignatureField): boolean => {
    if (field.type === "SIGNATURE") return !!signatureData && !!fieldValues[field.id];
    if (field.type === "INITIALS") return !!initialsData && !!fieldValues[field.id];
    return !!fieldValues[field.id];
  };

  const allRequiredComplete = activeDoc
    ? activeDoc.fields
        .filter((f) => f.required)
        .every((f) => isFieldComplete(f))
    : false;

  const handleSignDocument = () => {
    if (!allRequiredComplete) {
      toast.error("Please complete all required fields before signing");
      return;
    }
    if (!consentConfirmed) {
      toast.error("You must agree to the terms before signing");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSign = async () => {
    if (!activeDoc || activeIndex === null) return;
    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const fieldData = activeDoc.fields.map((f) => ({
        id: f.id,
        value:
          f.type === "SIGNATURE"
            ? signatureData
            : f.type === "INITIALS"
              ? initialsData
              : fieldValues[f.id] || null,
      }));

      const response = await fetch(`/api/sign/${activeDoc.signingToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fieldData,
          signatureImage: signatureData,
          initialsImage: initialsData,
          consentConfirmed: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit signature");
      }

      toast.success(`${activeDoc.title} signed successfully`);

      // Update queue
      const newQueue = queue.map((q, i) =>
        i === activeIndex ? { ...q, status: "signed" as const } : q,
      );
      setQueue(newQueue);

      const newSignedCount = newQueue.filter((q) => q.status === "signed").length;
      onProgress?.(newSignedCount, totalCount);

      // Auto-advance to next unsigned document
      const nextIndex = newQueue.findIndex(
        (q, i) => i > activeIndex && q.status !== "signed",
      );
      if (nextIndex >= 0) {
        openDocument(nextIndex);
      } else {
        // All signed
        setActiveDoc(null);
        setActiveIndex(null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sign document",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get field visual style based on page position
  const getFieldStyle = (field: SignatureField): React.CSSProperties => {
    if (!pageSize) return { display: "none" };
    return {
      position: "absolute",
      left: `${field.x}%`,
      top: `${field.y}%`,
      width: `${field.width}%`,
      height: `${field.height}%`,
      zIndex: 10,
    };
  };

  const getFieldContent = (field: SignatureField) => {
    const complete = isFieldComplete(field);

    if (field.type === "SIGNATURE") {
      if (complete && signatureData) {
        return (
          <div className="relative w-full h-full flex items-center justify-center bg-white/90 rounded border border-green-300">
            <img src={signatureData} alt="Signature" className="max-w-full max-h-full object-contain p-0.5" />
            <CheckCircle2 className="absolute top-0.5 right-0.5 h-3 w-3 text-green-600" />
          </div>
        );
      }
      return (
        <div className="w-full h-full flex items-center justify-center bg-yellow-50/90 border-2 border-dashed border-yellow-400 rounded cursor-pointer hover:bg-yellow-100 transition-colors animate-pulse">
          <div className="flex flex-col items-center gap-0.5">
            <PenIcon className="h-4 w-4 text-yellow-700" />
            <span className="text-[10px] font-medium text-yellow-800">Sign here</span>
          </div>
          {field.required && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
      );
    }

    if (field.type === "INITIALS") {
      if (complete && initialsData) {
        return (
          <div className="relative w-full h-full flex items-center justify-center bg-white/90 rounded border border-green-300">
            <img src={initialsData} alt="Initials" className="max-w-full max-h-full object-contain p-0.5" />
            <CheckCircle2 className="absolute top-0.5 right-0.5 h-3 w-3 text-green-600" />
          </div>
        );
      }
      return (
        <div className="w-full h-full flex items-center justify-center bg-yellow-50/90 border-2 border-dashed border-yellow-400 rounded cursor-pointer hover:bg-yellow-100 transition-colors animate-pulse">
          <span className="text-[10px] font-medium text-yellow-800">Initial</span>
          {field.required && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
      );
    }

    if (field.type === "DATE_SIGNED") {
      return (
        <div className="w-full h-full flex items-center px-1 bg-gray-50/90 border border-gray-300 rounded text-xs text-gray-700">
          {fieldValues[field.id] || new Date().toLocaleDateString()}
        </div>
      );
    }

    if (field.type === "NAME") {
      return (
        <div className="w-full h-full flex items-center px-1 bg-gray-50/90 border border-gray-300 rounded text-xs text-gray-700">
          {fieldValues[field.id] || investorData?.investorName || ""}
        </div>
      );
    }

    if (field.type === "CHECKBOX") {
      return (
        <div className="w-full h-full flex items-center justify-center min-h-[44px] min-w-[44px]">
          <input
            type="checkbox"
            checked={fieldValues[field.id] === "true"}
            onChange={(e) =>
              setFieldValues((prev) => ({
                ...prev,
                [field.id]: e.target.checked ? "true" : "",
              }))
            }
            className="h-5 w-5 rounded border-gray-400 cursor-pointer accent-[#0066FF]"
          />
        </div>
      );
    }

    // TEXT, COMPANY, TITLE, ADDRESS, EMAIL
    return (
      <input
        type="text"
        value={fieldValues[field.id] || ""}
        onChange={(e) =>
          setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
        }
        placeholder={field.placeholder || field.type.toLowerCase().replace("_", " ")}
        className="w-full h-full px-1 text-base bg-white/90 border border-gray-300 rounded focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] outline-none"
        readOnly={
          field.type === "EMAIL" && !!investorData?.email
        }
      />
    );
  };

  const currentPageFields = activeDoc?.fields.filter((f) => f.pageNumber === currentPage) || [];
  const totalRequired = activeDoc?.fields.filter((f) => f.required).length || 0;
  const completedRequired = activeDoc?.fields.filter((f) => f.required && isFieldComplete(f)).length || 0;

  // ----- Completion Screen -----
  if (allSigned) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <CheckCircle2 className="h-20 w-20 text-emerald-500 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-3">All Documents Signed</h2>
        <p className="text-gray-500 text-center max-w-md mb-2">
          You have signed {totalCount} document{totalCount !== 1 ? "s" : ""}.
          Copies have been sent to your email.
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-8">
          <ShieldCheckIcon className="h-4 w-4" />
          Securely signed and recorded via FundRoom Sign
        </div>
        <Button onClick={onComplete} className="min-h-[44px] bg-[#0066FF] hover:bg-[#0052cc]">
          Continue
          <ArrowRightIcon className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  // ----- Document Queue (no active doc) -----
  if (activeIndex === null || !activeDoc) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Documents to Sign</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review and sign each document in order.
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-emerald-600">{signedCount}</span>
            <span className="text-gray-400 text-xl">/{totalCount}</span>
            <p className="text-xs text-gray-500">signed</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-emerald-500 h-2.5 rounded-full transition-all duration-700"
            style={{
              width: `${totalCount > 0 ? (signedCount / totalCount) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Document cards */}
        <div className="space-y-3">
          {queue.map((item, index) => {
            const isSigned = item.status === "signed";
            const isAvailable =
              !isSigned &&
              (index === 0 || queue[index - 1]?.status === "signed");
            const isLocked = !isSigned && !isAvailable;

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-4 min-h-[64px] transition-all",
                  isSigned
                    ? "border-green-200 bg-green-50"
                    : isAvailable
                      ? "border-[#0066FF]/30 bg-blue-50 cursor-pointer hover:border-[#0066FF] hover:shadow-md"
                      : "border-gray-200 bg-gray-50 opacity-50",
                )}
                onClick={() => isAvailable && openDocument(index)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">
                    {isSigned ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    ) : isAvailable ? (
                      <div className="w-8 h-8 rounded-full bg-[#0066FF] text-white flex items-center justify-center">
                        {index + 1}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn(
                        "font-semibold text-sm",
                        isSigned
                          ? "text-green-800"
                          : isAvailable
                            ? "text-gray-900"
                            : "text-gray-500",
                      )}
                    >
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {isSigned
                        ? "Signed"
                        : isAvailable
                          ? "Ready to sign"
                          : "Sign previous document first"}
                    </p>
                  </div>
                  {isAvailable && (
                    <Button
                      size="sm"
                      className="min-h-[44px] bg-[#0066FF] hover:bg-[#0052cc]"
                    >
                      Sign
                      <ArrowRightIcon className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  {isSigned && (
                    <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                      Signed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ----- Active Signing View (Split Screen) -----
  return (
    <div className="flex flex-col h-full">
      {/* Multi-doc progress bar */}
      {totalCount > 1 && (
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600">
            Signing {(activeIndex || 0) + 1} of {totalCount}: {activeDoc.title}
          </span>
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-[#0066FF] h-1.5 rounded-full transition-all"
              style={{
                width: `${((signedCount + 1) / totalCount) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Split-screen layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left panel (60%) — Document viewer */}
        <div className="flex-1 lg:w-[60%] flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r">
          {/* Toolbar */}
          <div className="flex items-center justify-between bg-[#0A1628] px-3 py-2 gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveDoc(null);
                  setActiveIndex(null);
                }}
                className="text-gray-300 hover:text-white min-h-[44px]"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Back</span>
              </Button>
              <span className="text-sm text-gray-400">
                {currentPage}/{numPages}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
                className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-300 hover:bg-gray-700"
              >
                <ZoomOutIcon className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-400 w-10 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
                className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-300 hover:bg-gray-700"
              >
                <ZoomInIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowFullscreen(true)}
                className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-300 hover:bg-gray-700"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {totalRequired > 0 && (
                <span className="text-xs text-gray-400">
                  {completedRequired}/{totalRequired}
                </span>
              )}
              {completedRequired === totalRequired && totalRequired > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : totalRequired > 0 ? (
                <AlertCircleIcon className="h-4 w-4 text-amber-500" />
              ) : null}
            </div>
          </div>

          {/* PDF viewer */}
          <div
            className="flex-1 bg-gray-200 overflow-auto"
            style={{ minHeight: 300, WebkitOverflowScrolling: "touch" }}
          >
            {pdfLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader2Icon className="h-8 w-8 animate-spin text-gray-500" />
              </div>
            )}
            <div className="flex flex-col items-center p-4">
              <Document
                file={activeDoc.fileUrl}
                onLoadSuccess={({ numPages: n }) => {
                  setNumPages(n);
                  setPdfLoading(false);
                }}
                loading={null}
                className="flex flex-col items-center"
              >
                <div className="relative inline-block shadow-lg">
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    onRenderSuccess={(page: any) =>
                      setPageSize({ width: page.width, height: page.height })
                    }
                  />
                  {pageSize &&
                    currentPageFields.map((field) => (
                      <div
                        key={field.id}
                        style={getFieldStyle(field)}
                        onClick={() => handleFieldClick(field)}
                      >
                        {getFieldContent(field)}
                      </div>
                    ))}
                </div>
              </Document>
            </div>
          </div>

          {/* Page nav */}
          {numPages > 1 && (
            <div className="flex items-center justify-center gap-3 bg-gray-100 border-t py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="min-h-[44px]"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Prev</span>
              </Button>
              <span className="text-sm text-gray-600">
                {currentPage} of {numPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className="min-h-[44px]"
              >
                <span className="hidden sm:inline mr-1">Next</span>
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right panel (40%) — Signature & Fields */}
        <div className="lg:w-[40%] flex flex-col bg-white overflow-y-auto sticky bottom-0 lg:sticky lg:top-0">
          <div className="p-4 space-y-5 flex-1">
            {/* Auto-filled fields */}
            {investorData && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  Investor Details
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Name</span>
                    <span className="font-medium">{investorData.investorName}</span>
                  </div>
                  {investorData.entityName && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Entity</span>
                      <span className="font-medium">{investorData.entityName}</span>
                    </div>
                  )}
                  {investorData.investmentAmount && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-medium">
                        ${investorData.investmentAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium">{new Date().toLocaleDateString()}</span>
                  </div>
                  {investorData.address && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Address</span>
                      <span className="font-medium text-right max-w-[180px] truncate">
                        {investorData.address}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Signature capture */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Your Signature
              </h3>
              <SignatureCapture
                onCapture={(data) => setSignatureData(data)}
                initialName={investorData?.investorName}
              />
            </div>

            {/* Initials capture (if doc has initials fields) */}
            {activeDoc.fields.some((f) => f.type === "INITIALS") && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  Your Initials
                </h3>
                <SignatureCapture
                  onCapture={(data) => setInitialsData(data)}
                  initialName={
                    investorData?.investorName
                      ? investorData.investorName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                      : ""
                  }
                  isInitials
                />
              </div>
            )}

            {/* Consent */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start gap-3 min-h-[44px]">
                <Checkbox
                  id="fundroom-sign-consent"
                  checked={consentConfirmed}
                  onCheckedChange={(checked) =>
                    setConsentConfirmed(checked === true)
                  }
                  className="mt-0.5 h-5 w-5"
                />
                <Label
                  htmlFor="fundroom-sign-consent"
                  className="text-xs text-gray-600 leading-relaxed cursor-pointer"
                >
                  I have read and agree to the terms of this {activeDoc.title}.{" "}
                  {ESIGN_CONSENT_TEXT}
                </Label>
              </div>
            </div>
          </div>

          {/* Sign button (sticky bottom) */}
          <div className="border-t bg-white p-4 sticky bottom-0">
            <Button
              onClick={handleSignDocument}
              disabled={isSubmitting || !consentConfirmed || !allRequiredComplete}
              className="w-full min-h-[52px] text-base bg-[#0066FF] hover:bg-[#0052cc] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="h-5 w-5 animate-spin mr-2" />
                  Signing...
                </>
              ) : (
                <>
                  <PenIcon className="h-5 w-5 mr-2" />
                  Sign Document
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Signature Capture Modal (for clicking fields on PDF) */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>
              {activeFieldId &&
              activeDoc?.fields.find((f) => f.id === activeFieldId)?.type ===
                "INITIALS"
                ? "Add Your Initials"
                : "Add Your Signature"}
            </DialogTitle>
          </DialogHeader>
          <SignatureCapture
            onCapture={handleSignatureCapture}
            initialName={investorData?.investorName}
            isInitials={
              activeFieldId
                ? activeDoc?.fields.find((f) => f.id === activeFieldId)?.type ===
                  "INITIALS"
                : false
            }
          />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setShowSignatureModal(false);
                setActiveFieldId(null);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Signature</DialogTitle>
            <DialogDescription>
              You are about to sign <strong>{activeDoc.title}</strong>. This is a
              legally binding electronic signature under ESIGN/UETA.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <ShieldCheckIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-amber-800">
              By confirming, you agree this signature carries the same legal effect
              as a handwritten signature.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSign}
              className="min-h-[44px] bg-[#0066FF] hover:bg-[#0052cc]"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm & Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen PDF Modal */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent className="max-w-[100vw] max-h-[100dvh] w-full h-full p-0 rounded-none sm:rounded-lg sm:max-w-[95vw] sm:max-h-[95vh]">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between bg-gray-900 px-4 py-2">
              <span className="text-sm text-gray-300 truncate mr-2">{activeDoc.title}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullscreen(false)}
                className="text-gray-300 hover:text-white min-h-[44px] min-w-[44px]"
              >
                <XIcon className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-200 p-2 sm:p-4" style={{ WebkitOverflowScrolling: "touch" }}>
              <Document
                file={activeDoc.fileUrl}
                loading={null}
                className="flex flex-col items-center gap-4"
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <Page key={i + 1} pageNumber={i + 1} width={typeof window !== "undefined" ? Math.min(window.innerWidth - 32, 800) : 600} />
                ))}
              </Document>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
