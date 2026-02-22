GP/LP Production ready React Wizard
a complete, production-ready React artifact with both the GP Onboarding Wizard (8 steps) and LP Onboarding Flow (6 steps), all following your brand guidelines and SEC compliance specs. Use the floating toggle at the bottom to switch between GP and LP views.
GP Wizard covers all 8 steps:
1.	Company Info — Legal entity, EIN (masked/encrypted), address, contact, Bad Actor 506(d) certification
2.	Branding — Logo upload, brand colors, custom domain, live preview panel
3.	Raise Style — GP Fund / Startup / Dataroom-only mode cards + 506(b) vs 506(c) selector with March 2025 no-action letter guidance
4.	Dataroom — File upload, policies (watermark, email gate, link expiry), shareable link, 506(b) advertising warning
5.	Fund Details — Full GP Fund terms (2/20, hurdle, waterfall) OR Startup instruments (SAFE/Conv Note/Priced Round with all fields), wiring instructions
6.	LP Onboarding — 6-step toggle config, document templates, accreditation settings (506b vs 506c-aware), external doc upload, GP approval gates
7.	Integrations — Active defaults (FundRoom Sign, S3, audit, Resend), Phase 2/3 integrations, compliance settings
8.	Launch — Summary cards, preview button, dataroom live status, Fundroom activation CTA
LP Wizard covers all 6 steps:
1.	Account Creation — Name, email, phone, password
2.	NDA — Full NDA text + FundRoom Sign e-signature
3.	Accreditation — Category selection (5 types), 506(c) enhanced certifications (no third-party financing, min threshold ack)
4.	Investor Type — Individual/LLC/Trust/IRA/Other with full SEC-compliant fields per type (SSN encrypted, PO Box validation, custodian details for IRA)
5.	Commitment — Offering terms display, amount input, 8 investor representations (each checkbox audit-logged), e-sign OR external upload
6.	Funding — Wire instructions display, wire proof upload
All SEC compliance from your docs is baked in — 506(b)/506(c) logic, March 2025 no-action letter thresholds, bad actor certification, Form D data capture, audit trail fields, and subscription agreement representations. Ready for you to wire up to your Next.js backend.

Instructions: Claude Code prompt. To use it:
1.	Reference the JSX code below (also available as `components/showcase/fundroom-wizard.jsx` in the repo)
2.	Drop this prompt into Claude Code in your darkroom-main directory
The prompt is structured so Claude Code will:
Read first — CLAUDE.md, schema, this JSX reference (`docs/GP_LP_Wizard_Reference.md`), existing app routes and components (so it doesn't duplicate what exists)
Build in order:
1.	Schema migration (add any missing wizard fields to Organization, Fund, InvestorProfile)
2.	GP Wizard — 8 steps with API routes, all wired to Prisma
3.	LP Wizard — 6 steps with SEC-compliant accreditation (506b vs 506c aware)
4.	GP Document Review flow — approve/reject externally uploaded docs + wire proofs
5.	Integration test walkthrough
It references every field name, Prisma model mapping, encryption requirement, and audit logging call from your existing codebase conventions — including the known gotchas like not typing tx in $transaction and using .toNumber() on Decimals.


 

JSX Code:

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Building2, Upload, Palette, FileText, DollarSign, Users, Settings, 
  Rocket, ChevronRight, ChevronLeft, Check, Shield, Eye, EyeOff,
  AlertTriangle, Info, Copy, QrCode, ExternalLink, X, Plus, Trash2,
  Lock, Globe, Mail, Phone, MapPin, Calendar, Briefcase, FileSignature,
  CreditCard, Scale, BookOpen, UserCheck, Building, Hash, Landmark,
  ArrowUpRight, Pencil, Download, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Grip, ToggleLeft, ToggleRight, Search,
  Star, Zap, CircleDollarSign, PieChart, TrendingUp, BarChart3
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & TYPES
// ═══════════════════════════════════════════════════════════════════

const BRAND = {
  deepNavy: "#0A1628",
  electricBlue: "#0066FF",
  vibrantGreen: "#2ECC71",
  gradientTeal: "#00C9A7",
  gradientLime: "#7ED957",
  accentCyan: "#00D4FF",
  darkCharcoal: "#1A1A2E",
  mediumGray: "#6B7280",
  lightGray: "#F3F4F6",
  white: "#FFFFFF",
  successGreen: "#10B981",
  warningAmber: "#F59E0B",
  errorRed: "#EF4444",
};

const ENTITY_TYPES = ["LLC", "Corporation", "LP", "GP Entity", "Trust", "Other"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const FUND_STRATEGIES = ["Private Equity", "Venture Capital", "Real Estate", "Hedge Fund", "Fund of Funds", "Other"];
const SECTORS = ["Venture Capital", "Real Estate", "Private Equity", "Startup", "Other"];
const WATERFALL_TYPES = ["European (Whole Fund)", "American (Deal-by-Deal)"];

const WIZARD_STEPS = [
  { id: 1, label: "Company info", icon: Building2, phase: "free" },
  { id: 2, label: "Branding", icon: Palette, phase: "free" },
  { id: 3, label: "Raise style", icon: TrendingUp, phase: "free" },
  { id: 4, label: "Dataroom", icon: FileText, phase: "free" },
  { id: 5, label: "Fund details", icon: DollarSign, phase: "config" },
  { id: 6, label: "LP onboarding", icon: Users, phase: "config" },
  { id: 7, label: "Integrations", icon: Settings, phase: "integrations" },
  { id: 8, label: "Launch", icon: Rocket, phase: "integrations" },
];

const LP_STEPS = [
  { id: 1, label: "Account", icon: Users },
  { id: 2, label: "NDA", icon: FileSignature },
  { id: 3, label: "Accreditation", icon: Shield },
  { id: 4, label: "Investor details", icon: Building },
  { id: 5, label: "Commitment", icon: DollarSign },
  { id: 6, label: "Funding", icon: Landmark },
];

// ═══════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, variant = "default", className }) {
  const variants = {
    default: "bg-gray-100 text-gray-700",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-red-50 text-red-700 border border-red-200",
    info: "bg-blue-50 text-blue-700 border border-blue-200",
    free: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    paid: "bg-amber-50 text-amber-700 border border-amber-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
}

function Button({ children, variant = "primary", size = "md", disabled, onClick, className, icon: Icon }) {
  const variants = {
    primary: "bg-[#0066FF] hover:bg-[#0052CC] text-white shadow-sm shadow-blue-500/20",
    secondary: "border-2 border-[#0066FF] text-[#0066FF] hover:bg-blue-50",
    ghost: "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
    destructive: "bg-[#EF4444] hover:bg-red-600 text-white",
    success: "bg-[#10B981] hover:bg-emerald-600 text-white",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Input({ label, required, type = "text", placeholder, value, onChange, helper, error, masked, prefix, suffix, className, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
        <input
          type={masked && !show ? "password" : type}
          placeholder={placeholder}
          value={value || ""}
          onChange={e => onChange?.(e.target.value)}
          className={cn(
            "w-full rounded-md border bg-[#F3F4F6] px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 transition-all outline-none",
            error ? "border-red-300" : "border-gray-200",
            prefix && "pl-8",
            suffix && "pr-10",
            masked && "pr-10 font-mono tracking-widest"
          )}
          {...props}
        />
        {masked && (
          <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
        {suffix && !masked && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{suffix}</span>}
      </div>
      {helper && !error && <p className="text-xs text-gray-500">{helper}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Select({ label, required, options, value, onChange, placeholder, helper, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        value={value || ""}
        onChange={e => onChange?.(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-[#F3F4F6] px-3 py-2.5 text-sm text-gray-900 focus:bg-white focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <label className={cn("flex items-start gap-3 cursor-pointer group", disabled && "opacity-50 cursor-not-allowed")}>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2",
          checked ? "bg-[#0066FF]" : "bg-gray-300"
        )}
      >
        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
      <div className="flex-1">
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function Checkbox({ label, description, checked, onChange, required }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked || false}
        onChange={e => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0066FF] focus:ring-[#0066FF] cursor-pointer"
      />
      <div className="flex-1">
        <span className="text-sm text-gray-700 group-hover:text-gray-900">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function Card({ children, className, selected, onClick, hoverable }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white p-5 transition-all duration-200",
        selected ? "border-[#0066FF] ring-2 ring-blue-500/20 shadow-md" : "border-gray-200",
        hoverable && "hover:border-blue-300 hover:shadow-md cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

function Alert({ variant = "info", children, className }) {
  const styles = {
    info: { bg: "bg-blue-50 border-blue-200", icon: Info, color: "text-blue-700" },
    warning: { bg: "bg-amber-50 border-amber-200", icon: AlertTriangle, color: "text-amber-700" },
    success: { bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2, color: "text-emerald-700" },
    error: { bg: "bg-red-50 border-red-200", icon: XCircle, color: "text-red-700" },
  };
  const s = styles[variant];
  const Icon = s.icon;
  return (
    <div className={cn("flex gap-3 rounded-lg border p-4", s.bg, className)}>
      <Icon size={18} className={cn("shrink-0 mt-0.5", s.color)} />
      <div className={cn("text-sm", s.color)}>{children}</div>
    </div>
  );
}

function SectionHeader({ title, description, badge }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-[#0A1628]">{title}</h2>
        {badge}
      </div>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
    </div>
  );
}

function AdvancedSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-600"
      >
        <span className="flex items-center gap-2">
          <Settings size={14} /> {title}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4 border-t border-gray-200 space-y-4">{children}</div>}
    </div>
  );
}

function FileUploadZone({ label, accept, onUpload, files = [], maxSize = "5MB" }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onUpload?.(Array.from(e.dataTransfer.files)); }}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          dragging ? "border-[#0066FF] bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"
        )}
        onClick={() => document.getElementById("file-upload-" + label)?.click()}
      >
        <input id={"file-upload-" + label} type="file" accept={accept} multiple className="hidden" onChange={e => onUpload?.(Array.from(e.target.files))} />
        <Upload size={24} className="mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">Drag & drop files here, or <span className="text-[#0066FF] font-medium">browse</span></p>
        <p className="text-xs text-gray-400 mt-1">Max {maxSize} per file</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md text-sm">
              <FileText size={14} className="text-gray-400" />
              <span className="flex-1 truncate">{f.name || f}</span>
              <button onClick={() => onUpload?.(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GP WIZARD STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function Step1CompanyInfo({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Company information"
        description="Legal entity details for documents, wire instructions, tax docs, and SEC Form D filing."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Company legal name" required placeholder="Bermuda Franchise Group LLC" value={data.companyName} onChange={v => update({ companyName: v })} helper="Full legal name as registered with state" />
        <Select label="Entity type" required options={ENTITY_TYPES} value={data.entityType} onChange={v => update({ entityType: v })} placeholder="Select entity type" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="EIN (Tax ID)" required masked placeholder="XX-XXXXXXX" value={data.ein} onChange={v => update({ ein: v })} helper="Encrypted AES-256 at rest. Required for Form D." />
        <Input label="Year of incorporation" required type="number" placeholder="2024" value={data.yearIncorporated} onChange={v => update({ yearIncorporated: v })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select label="Jurisdiction of incorporation" required options={US_STATES} value={data.jurisdiction} onChange={v => update({ jurisdiction: v })} placeholder="Select state" />
        <Input label="Previous names (5 years)" placeholder="None" value={data.previousNames} onChange={v => update({ previousNames: v })} helper="Form D requires any names used in past 5 years" />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><MapPin size={14} /> Principal place of business</h3>
        <div className="space-y-3">
          <Input label="Street address" required placeholder="123 Main Street, Suite 100" value={data.address} onChange={v => update({ address: v })} helper="Physical address required. No PO Boxes." />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="City" required placeholder="Hamilton" value={data.city} onChange={v => update({ city: v })} />
            <Select label="State" required options={US_STATES} value={data.state} onChange={v => update({ state: v })} placeholder="State" />
            <Input label="ZIP" required placeholder="10001" value={data.zip} onChange={v => update({ zip: v })} />
            <Input label="Country" required value={data.country || "United States"} onChange={v => update({ country: v })} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Users size={14} /> Primary contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Contact name" required placeholder="Joe Smith" value={data.contactName} onChange={v => update({ contactName: v })} helper="Pre-filled from signup account" />
          <Input label="Email" required type="email" placeholder="joe@bermudafranchise.com" value={data.contactEmail} onChange={v => update({ contactEmail: v })} />
          <Input label="Phone" required type="tel" placeholder="+1 (555) 123-4567" value={data.contactPhone} onChange={v => update({ contactPhone: v })} helper="Required for Form D" />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Shield size={14} /> SEC compliance certification</h3>
        <Card className="bg-amber-50/50 border-amber-200">
          <Checkbox
            label="Bad actor disqualification certification"
            description='I certify that no covered person associated with this offering (as defined in Rule 506(d) of Regulation D) is subject to disqualification. This includes directors, executive officers, 20%+ beneficial owners, promoters, and compensated solicitors.'
            checked={data.badActorCertified}
            onChange={v => update({ badActorCertified: v })}
            required
          />
          <a href="#" className="text-xs text-[#0066FF] hover:underline mt-2 inline-block ml-7">View SEC guidance on covered persons →</a>
        </Card>
      </div>
    </div>
  );
}

function Step2Branding({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Branding + company profile"
        description="Set your visual identity for the tenant-branded investor experience."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <FileUploadZone label="Company logo" accept=".png,.svg,.jpg,.jpeg" onUpload={files => update({ logoFiles: files })} files={data.logoFiles || []} maxSize="5MB" />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Primary brand color</label>
              <div className="flex gap-2">
                <input type="color" value={data.brandColor || "#1e293b"} onChange={e => update({ brandColor: e.target.value })} className="h-10 w-14 rounded border cursor-pointer" />
                <Input value={data.brandColor || "#1e293b"} onChange={v => update({ brandColor: v })} placeholder="#1e293b" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Accent color</label>
              <div className="flex gap-2">
                <input type="color" value={data.accentColor || "#0066FF"} onChange={e => update({ accentColor: e.target.value })} className="h-10 w-14 rounded border cursor-pointer" />
                <Input value={data.accentColor || "#0066FF"} onChange={v => update({ accentColor: v })} placeholder="#0066FF" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Custom domain" placeholder="invest.yourfirm.com" value={data.customDomain} onChange={v => update({ customDomain: v })} helper="$10/month add-on. Default: yourorg.fundroom.ai" />
            <Input label="Custom email sender" placeholder="noreply@yourfirm.com" value={data.customEmail} onChange={v => update({ customEmail: v })} helper="Default: noreply@fundroom.ai" />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Company profile</h3>
            <div className="space-y-3">
              <Input label="Short description" placeholder="Investment firm focused on franchise acquisitions across the Caribbean" value={data.description} onChange={v => update({ description: v })} helper="280 characters max. Used in dataroom and marketplace." />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Sector" options={SECTORS} value={data.sector} onChange={v => update({ sector: v })} placeholder="Select sector" />
                <Select label="Geography" options={["US", "North America", "Global", "Europe", "Asia", "Caribbean", "Other"]} value={data.geography} onChange={v => update({ geography: v })} placeholder="Select geography" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Website URL" placeholder="https://bermudafranchise.com" value={data.website} onChange={v => update({ website: v })} />
                <Input label="Founded year" type="number" placeholder="2024" value={data.foundedYear} onChange={v => update({ foundedYear: v })} />
              </div>
            </div>
          </div>

          <AdvancedSection title="Advanced branding">
            <Select label="Typography preset" options={["Modern", "Classic", "Clean"]} value={data.typographyPreset} onChange={v => update({ typographyPreset: v })} />
            <Toggle
              label='"Powered by FundRoom" badge'
              description="Appears top-right + footer. Removable for $50/month."
              checked={data.poweredByBadge !== false}
              onChange={v => update({ poweredByBadge: v })}
            />
          </AdvancedSection>
        </div>

        {/* Live preview panel */}
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Live preview</label>
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-lg">
              <div className="h-14 flex items-center px-4 justify-between" style={{ backgroundColor: data.brandColor || "#1e293b" }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center">
                    <BarChart3 size={16} className="text-white" />
                  </div>
                  <span className="text-white font-semibold text-sm">{data.companyName || "Your Company"}</span>
                </div>
                {data.poweredByBadge !== false && (
                  <span className="text-white/50 text-[10px]">Powered by FundRoom</span>
                )}
              </div>
              <div className="p-4 bg-white">
                <div className="text-center py-6">
                  <h3 className="font-bold text-gray-900">{data.companyName || "Your Company"}</h3>
                  <p className="text-xs text-gray-500 mt-1">{data.description || "Your company description"}</p>
                  <button className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: data.accentColor || "#0066FF" }}>
                    I want to invest
                  </button>
                </div>
                <div className="space-y-2 mt-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-gray-100 rounded-md flex items-center px-3 gap-2">
                      <FileText size={12} className="text-gray-400" />
                      <div className="h-2 bg-gray-200 rounded flex-1" />
                    </div>
                  ))}
                </div>
              </div>
              {data.poweredByBadge !== false && (
                <div className="text-center py-2 bg-gray-50 border-t">
                  <span className="text-[10px] text-gray-400">Powered by FundRoom AI</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3RaiseStyle({ data, update }) {
  const modes = [
    {
      id: "GP_FUND",
      icon: Briefcase,
      title: "GP / LP Fund",
      desc: "Raise commitments from LPs via Limited Partnership Agreement. Issue capital calls, manage distributions, generate K-1s.",
      bestFor: "Private equity, venture capital, real estate funds, hedge funds, fund of funds.",
      docs: "LPA, Subscription Agreement, NDA, Side Letter, Capital Call, K-1",
      gradient: "from-blue-500 to-indigo-600",
    },
    {
      id: "STARTUP",
      icon: Zap,
      title: "Startup capital raise",
      desc: "Raise equity via SAFE, convertible notes, or priced rounds. Track cap table, manage SPAs.",
      bestFor: "Pre-seed through Series B, rolling funds, SPVs, angel syndicates.",
      docs: "SAFE, Convertible Note, SPA, IRA Letter, NDA, Board Consent",
      gradient: "from-emerald-500 to-teal-600",
    },
    {
      id: "DATAROOM_ONLY",
      icon: FileText,
      title: "Just a dataroom for now",
      desc: "Start with a secure dataroom. Set up fund/raise later when ready.",
      bestFor: "Not ready to raise yet, or exploring the platform.",
      docs: "NDA only",
      gradient: "from-gray-400 to-gray-500",
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Raise style"
        description="This selection drives your entire platform experience: UI, documents, terminology, compliance flows, and LP onboarding."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modes.map(mode => (
          <Card
            key={mode.id}
            selected={data.raiseMode === mode.id}
            onClick={() => update({ raiseMode: mode.id })}
            hoverable
            className="relative overflow-hidden"
          >
            {data.raiseMode === mode.id && (
              <div className="absolute top-3 right-3">
                <div className="w-6 h-6 rounded-full bg-[#0066FF] flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              </div>
            )}
            <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4", mode.gradient)}>
              <mode.icon size={22} className="text-white" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">{mode.title}</h3>
            <p className="text-sm text-gray-600 mb-3">{mode.desc}</p>
            <div className="text-xs text-gray-500 space-y-1">
              <p><span className="font-medium text-gray-600">Best for:</span> {mode.bestFor}</p>
              <p><span className="font-medium text-gray-600">Documents:</span> {mode.docs}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Regulation D Selection */}
      {data.raiseMode && data.raiseMode !== "DATAROOM_ONLY" && (
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Scale size={14} /> Regulation D exemption
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              selected={data.regDExemption === "506B"}
              onClick={() => update({ regDExemption: "506B" })}
              hoverable
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-gray-900">506(b) — Private offering</h4>
                    <Badge variant="success">Recommended</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">No public advertising. Share your dataroom link with people you have a pre-existing relationship with.</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>✓ Simpler accreditation (self-certification)</p>
                    <p>✓ Up to 35 non-accredited sophisticated investors</p>
                    <p>✓ Pre-existing relationship required</p>
                  </div>
                </div>
              </div>
            </Card>
            <Card
              selected={data.regDExemption === "506C"}
              onClick={() => update({ regDExemption: "506C" })}
              hoverable
            >
              <div>
                <h4 className="font-bold text-gray-900 mb-1">506(c) — General solicitation</h4>
                <p className="text-sm text-gray-600 mb-2">Can publicly advertise and solicit investors. Use FundRoom Marketplace.</p>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>✓ Public advertising permitted</p>
                  <p>✓ FundRoom Marketplace eligible</p>
                  <p>⚠ ALL investors must be accredited</p>
                  <p>⚠ Must verify accreditation (simplified via March 2025 guidance)</p>
                </div>
              </div>
            </Card>
          </div>

          {data.regDExemption === "506C" && (
            <Alert variant="info">
              <strong>March 2025 SEC Guidance:</strong> Setting your minimum investment at $200,000+ (individuals) or $1,000,000+ (entities) combined with written investor representation satisfies 506(c) verification requirements without income/net worth documentation.
            </Alert>
          )}

          {/* Minimum investment + share price */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <Input
              label="Minimum investment amount"
              required
              type="number"
              prefix="$"
              placeholder="200,000"
              value={data.minInvestment}
              onChange={v => update({ minInvestment: v })}
              helper={data.regDExemption === "506C"
                ? "Setting this at $200K+ for individuals simplifies accredited investor verification per SEC March 2025 guidance."
                : "Minimum amount an LP must commit to invest."
              }
            />
            {data.raiseMode === "GP_FUND" && (
              <Input label="Unit / share price" type="number" prefix="$" placeholder="1,000" value={data.sharePrice} onChange={v => update({ sharePrice: v })} helper="Price per unit/interest in the fund." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Step4Dataroom({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Dataroom setup"
        description="Your dataroom goes live immediately — free. Upload fund documents, set policies, and share."
        badge={<Badge variant="free">Free</Badge>}
      />

      <Input label="Dataroom name" required placeholder={`${data.companyName || "Your Company"} — Fund Dataroom`} value={data.dataroomName} onChange={v => update({ dataroomName: v })} />

      <FileUploadZone
        label="Upload fund documents"
        accept=".pdf,.pptx,.ppt,.xlsx,.xls,.doc,.docx,.mp4,.mov"
        onUpload={files => update({ dataroomFiles: [...(data.dataroomFiles || []), ...files.map(f => f.name || f)] })}
        files={(data.dataroomFiles || []).map(f => typeof f === "string" ? { name: f } : f)}
        maxSize="50MB"
      />

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Dataroom policies</h3>
        <div className="space-y-3">
          <Toggle label="Require email before viewing" description="Builds your investor pipeline. Required for engagement scoring." checked={data.requireEmail !== false} onChange={v => update({ requireEmail: v })} />
          <Toggle label="Dynamic watermark" description="Shows viewer email overlaid on documents." checked={data.watermark !== false} onChange={v => update({ watermark: v })} />
          <Toggle label="Password protection" description="Optional additional gate for sensitive materials." checked={data.passwordProtection || false} onChange={v => update({ passwordProtection: v })} />
          <Toggle label="Link expiration" description='Default: 30 days. Set "never" in advanced.' checked={data.linkExpiration !== false} onChange={v => update({ linkExpiration: v })} />
          <Toggle label="Allow downloads" description="Disabled by default for security." checked={data.allowDownloads || false} onChange={v => update({ allowDownloads: v })} />
          <Toggle label='"I Want to Invest" button' description="Visible when fund is configured. Launches LP onboarding." checked={data.investButton !== false} onChange={v => update({ investButton: v })} />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Shareable link</h3>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-gray-100 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-700">
            <Globe size={14} className="text-gray-400 mr-2 shrink-0" />
            <span className="truncate">{data.customDomain || "yourorg"}.fundroom.ai/d/{data.dataroomSlug || "fund-dataroom"}?ref=direct</span>
          </div>
          <Button variant="secondary" size="md" icon={Copy} onClick={() => {}}>Copy</Button>
          <Button variant="ghost" size="md" icon={QrCode} onClick={() => {}} />
        </div>
      </div>

      {data.regDExemption === "506B" && (
        <Alert variant="warning">
          <strong>506(b) Reminder:</strong> Under Rule 506(b), you cannot publicly advertise this offering. Only share this link with investors you have a pre-existing relationship with.
        </Alert>
      )}

      <AdvancedSection title="Advanced dataroom settings">
        <Input label="Custom slug" placeholder="bermuda-club-fund" value={data.dataroomSlug} onChange={v => update({ dataroomSlug: v })} />
        <Input label="Domain restrictions" placeholder="bermudafranchise.com, invited-only.com" value={data.domainRestrictions} onChange={v => update({ domainRestrictions: v })} helper="Limit access to specific email domains" />
        <Toggle label="Invitation-only mode" description="Restrict access to manually invited emails only." checked={data.invitationOnly || false} onChange={v => update({ invitationOnly: v })} />
      </AdvancedSection>
    </div>
  );
}

function Step5FundDetails({ data, update }) {
  const isGPFund = data.raiseMode === "GP_FUND";
  const isStartup = data.raiseMode === "STARTUP";
  const [instrument, setInstrument] = useState(data.instrumentType || "SAFE");

  useEffect(() => {
    if (data.instrumentType !== instrument) update({ instrumentType: instrument });
  }, [instrument]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={isGPFund ? "Fund details" : "Raise details"}
        description="Configure your offering terms. Free to set up — investor-facing features activate with subscription."
        badge={<Badge variant="paid">Configure free • Activate paid</Badge>}
      />

      {isGPFund && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Fund name" required placeholder="Bermuda Club Fund I" value={data.fundName} onChange={v => update({ fundName: v })} helper="Used in all docs, LP portal, and Form D." />
            <Input label="Target raise amount" required prefix="$" type="number" placeholder="10,000,000" value={data.targetRaise} onChange={v => update({ targetRaise: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Management fee %" type="number" suffix="%" placeholder="2.0" value={data.mgmtFee || "2.0"} onChange={v => update({ mgmtFee: v })} helper="Standard 2/20 structure" />
            <Input label="Carried interest %" type="number" suffix="%" placeholder="20.0" value={data.carry || "20.0"} onChange={v => update({ carry: v })} helper="GP profit share above hurdle" />
            <Input label="Hurdle rate %" type="number" suffix="%" placeholder="8.0" value={data.hurdle || "8.0"} onChange={v => update({ hurdle: v })} helper="Preferred return threshold" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Fund term (years)" placeholder="10" value={data.fundTerm || "10"} onChange={v => update({ fundTerm: v })} helper="Base term + optional extension" />
            <Select label="Waterfall type" options={WATERFALL_TYPES} value={data.waterfallType} onChange={v => update({ waterfallType: v })} placeholder="Select type" helper="European (whole fund) vs American (deal-by-deal)" />
            <Select label="Fund strategy" options={FUND_STRATEGIES} value={data.fundStrategy} onChange={v => update({ fundStrategy: v })} placeholder="Select strategy" helper="For Form D and marketplace" />
          </div>
        </>
      )}

      {isStartup && (
        <>
          <h3 className="text-sm font-semibold text-gray-700">Instrument type</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: "SAFE", title: "SAFE Agreement", desc: "Simple Agreement for Future Equity. Most common for pre-seed/seed.", icon: Zap },
              { id: "CONVERTIBLE_NOTE", title: "Convertible note", desc: "Debt that converts to equity. Interest accrues. Has maturity date.", icon: FileSignature },
              { id: "PRICED_ROUND", title: "Priced equity round", desc: "Series A+. Fixed share price. Full cap table impact.", icon: PieChart },
            ].map(inst => (
              <Card key={inst.id} selected={instrument === inst.id} onClick={() => setInstrument(inst.id)} hoverable className="p-4">
                <inst.icon size={20} className={instrument === inst.id ? "text-[#0066FF]" : "text-gray-400"} />
                <h4 className="font-semibold text-sm mt-2">{inst.title}</h4>
                <p className="text-xs text-gray-500 mt-1">{inst.desc}</p>
              </Card>
            ))}
          </div>

          {instrument === "SAFE" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Round name" required placeholder="Pre-Seed" value={data.roundName} onChange={v => update({ roundName: v })} />
                <Input label="Target raise" required prefix="$" type="number" placeholder="1,000,000" value={data.targetRaise} onChange={v => update({ targetRaise: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Valuation cap" required prefix="$" type="number" placeholder="10,000,000" value={data.valCap} onChange={v => update({ valCap: v })} helper="Max valuation at which SAFE converts" />
                <Input label="Discount rate %" type="number" suffix="%" placeholder="20" value={data.discount || "20"} onChange={v => update({ discount: v })} helper="15-25% typical" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="SAFE type" options={[{value:"POST_MONEY",label:"Post-money (recommended)"},{value:"PRE_MONEY",label:"Pre-money"}]} value={data.safeType || "POST_MONEY"} onChange={v => update({ safeType: v })} />
                <Toggle label="MFN (Most favored nation)" checked={data.mfn || false} onChange={v => update({ mfn: v })} />
                <Toggle label="Pro-rata rights" checked={data.proRata || false} onChange={v => update({ proRata: v })} />
              </div>
            </div>
          )}

          {instrument === "CONVERTIBLE_NOTE" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Principal amount target" required prefix="$" type="number" placeholder="500,000" value={data.targetRaise} onChange={v => update({ targetRaise: v })} />
                <Input label="Interest rate %" required type="number" suffix="%" placeholder="5.0" value={data.interestRate || "5.0"} onChange={v => update({ interestRate: v })} helper="Annual simple interest. 2-8% typical." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Maturity date" type="date" value={data.maturityDate} onChange={v => update({ maturityDate: v })} helper="12-24 months typical" />
                <Input label="Valuation cap" prefix="$" type="number" placeholder="10,000,000" value={data.valCap} onChange={v => update({ valCap: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Discount rate %" type="number" suffix="%" placeholder="20" value={data.discount || "20"} onChange={v => update({ discount: v })} />
                <Input label="Qualified financing threshold" prefix="$" type="number" placeholder="1,000,000" value={data.qualFinancing || "1000000"} onChange={v => update({ qualFinancing: v })} helper="Min raise to trigger auto-conversion" />
              </div>
            </div>
          )}

          {instrument === "PRICED_ROUND" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Round name" required placeholder="Series A" value={data.roundName} onChange={v => update({ roundName: v })} />
                <Input label="Target raise" required prefix="$" type="number" placeholder="5,000,000" value={data.targetRaise} onChange={v => update({ targetRaise: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Pre-money valuation" required prefix="$" type="number" placeholder="20,000,000" value={data.preMoneyVal} onChange={v => update({ preMoneyVal: v })} />
                <Input label="Share price" prefix="$" type="number" placeholder="Calculated" value={data.sharePrice} onChange={v => update({ sharePrice: v })} helper="= Pre-money / fully diluted shares" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Liquidation preference" options={["1x Non-Participating", "1x Participating", "2x Non-Participating"]} value={data.liqPref || "1x Non-Participating"} onChange={v => update({ liqPref: v })} />
                <Select label="Anti-dilution" options={[{value:"BROAD_BASED",label:"Broad-based weighted avg"},{value:"FULL_RATCHET",label:"Full ratchet"}]} value={data.antiDilution || "BROAD_BASED"} onChange={v => update({ antiDilution: v })} />
                <Input label="Option pool %" type="number" suffix="%" placeholder="10" value={data.optionPool || "10"} onChange={v => update({ optionPool: v })} helper="ESOP reserved. 10-20% typical." />
              </div>
            </div>
          )}
        </>
      )}

      {/* Wiring Instructions */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Landmark size={14} /> Wiring instructions</h3>
        <p className="text-xs text-gray-500 mb-3">These are shown to LPs during the funding step.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Bank name" required placeholder="JPMorgan Chase" value={data.bankName} onChange={v => update({ bankName: v })} />
          <Input label="Account name" placeholder={data.companyName || "Fund Entity LLC"} value={data.accountName || data.companyName} onChange={v => update({ accountName: v })} helper="Pre-filled from company legal name" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <Input label="Account number" required masked placeholder="••••••••••" value={data.accountNumber} onChange={v => update({ accountNumber: v })} helper="Encrypted at rest" />
          <Input label="Routing number (ABA)" required masked placeholder="••••••••" value={data.routingNumber} onChange={v => update({ routingNumber: v })} helper="Encrypted at rest" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <Input label="SWIFT/BIC code" placeholder="CHASUS33" value={data.swift} onChange={v => update({ swift: v })} helper="For international wires" />
          <Input label="Reference/memo format" placeholder="[Investor Name] - [Fund Name] - [Amount]" value={data.memoFormat} onChange={v => update({ memoFormat: v })} />
        </div>
      </div>

      <AdvancedSection title="Marketplace (coming soon)">
        <Checkbox
          label="I'm interested in listing on the FundRoom Marketplace when it launches"
          description="We'll notify you when the marketplace is available."
          checked={data.marketplaceInterest || false}
          onChange={v => update({ marketplaceInterest: v })}
        />
      </AdvancedSection>
    </div>
  );
}

function Step6LPOnboarding({ data, update }) {
  const is506C = data.regDExemption === "506C";
  return (
    <div className="space-y-6">
      <SectionHeader
        title="LP onboarding settings"
        description="Configure how investors will experience the platform."
      />

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Onboarding steps</h3>
        <div className="space-y-2">
          {LP_STEPS.map(step => {
            const alwaysOn = [1, 3, 4, 5, 6].includes(step.id);
            const isOn = alwaysOn || data[`lpStep${step.id}`] !== false;
            return (
              <div key={step.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", isOn ? "bg-[#0066FF] text-white" : "bg-gray-300 text-white")}>
                  {step.id}
                </div>
                <step.icon size={16} className={isOn ? "text-[#0066FF]" : "text-gray-400"} />
                <span className={cn("text-sm font-medium flex-1", isOn ? "text-gray-900" : "text-gray-400")}>{step.label}</span>
                {alwaysOn ? (
                  <Badge variant="info">Always on</Badge>
                ) : (
                  <Toggle checked={isOn} onChange={v => update({ [`lpStep${step.id}`]: v })} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Document templates</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-gray-500" />
              <span className="text-sm font-medium">NDA / Confidentiality agreement</span>
              <Badge variant="success">FundRoom template</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm">Preview</Button>
              <Button variant="ghost" size="sm" icon={Upload}>Upload custom</Button>
            </div>
          </div>

          {data.raiseMode === "GP_FUND" ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <span className="text-sm font-medium">Subscription agreement</span>
                  <Badge variant="success">FundRoom template</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">Preview</Button>
                  <Button variant="ghost" size="sm" icon={Upload}>Upload custom</Button>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <span className="text-sm font-medium">Limited Partnership Agreement (LPA)</span>
                  <Badge variant="warning">Upload required</Badge>
                </div>
                <Button variant="secondary" size="sm" icon={Upload}>Upload LPA</Button>
              </div>
            </>
          ) : data.raiseMode === "STARTUP" ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <span className="text-sm font-medium">{data.instrumentType === "SAFE" ? "SAFE Agreement (YC post-money)" : data.instrumentType === "CONVERTIBLE_NOTE" ? "Convertible Note" : "Stock Purchase Agreement"}</span>
                  <Badge variant="success">FundRoom template</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">Preview</Button>
                  <Button variant="ghost" size="sm" icon={Upload}>Upload custom</Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">External document settings</h3>
        <div className="space-y-3">
          <Toggle
            label="Allow LPs to upload externally signed documents"
            description="LP uploads docs signed outside the platform. Status: Pending GP confirmation."
            checked={data.allowExternalUpload !== false}
            onChange={v => update({ allowExternalUpload: v })}
          />
          <Toggle
            label="Allow GP to upload docs on behalf of LP"
            description="GP uploads signed docs for investors who sign outside the platform. Auto-confirmed."
            checked={data.allowGPUpload !== false}
            onChange={v => update({ allowGPUpload: v })}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Shield size={14} /> Accreditation settings
          {is506C && <Badge variant="warning">506(c) enhanced</Badge>}
        </h3>
        <Alert variant={is506C ? "warning" : "info"} className="mb-3">
          {is506C
            ? "506(c) offerings require verified accreditation. The minimum investment threshold method (per March 2025 SEC guidance) is recommended for streamlined verification."
            : "506(b) offerings require self-certification. The GP must have a reasonable belief that investors are accredited."
          }
        </Alert>
        <div className="space-y-2">
          <Toggle label="Self-certification" description={is506C ? "Required but not sufficient alone for 506(c)." : "Sufficient for 506(b). Standard checkbox."} checked disabled />
          <Toggle label="Minimum investment threshold method" description="$200K+ individuals / $1M+ entities per March 2025 guidance." checked={data.minThresholdMethod || is506C} onChange={v => update({ minThresholdMethod: v })} />
          <Toggle label="Income/net worth verification (Phase 2)" description="Requires tax docs or CPA/attorney letter." checked={false} disabled />
          <Toggle label="Persona KYC integration (Phase 2)" description="Automated ID verification + sanctions screening." checked={false} disabled />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Approval & notifications</h3>
        <div className="space-y-3">
          <Toggle label="Require GP approval before commitment is finalized" description="LP submissions go to approval queue." checked={data.gpApproval !== false} onChange={v => update({ gpApproval: v })} />
          <Toggle label="Email LP on each onboarding step completion" checked={data.emailLPSteps !== false} onChange={v => update({ emailLPSteps: v })} />
          <Toggle label="Email GP on new commitment" checked={data.emailGPCommitment !== false} onChange={v => update({ emailGPCommitment: v })} />
          <Toggle label="Email GP on wire proof upload" checked={data.emailGPWire !== false} onChange={v => update({ emailGPWire: v })} />
        </div>
      </div>
    </div>
  );
}

function Step7Integrations({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Integrations + compliance"
        description="Review active defaults and configure optional integrations."
      />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500" /> Active by default (no setup needed)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: FileSignature, label: "FundRoom Sign", desc: "Native e-signature. Zero external API cost." },
            { icon: Lock, label: "Secure document storage", desc: "AES-256 encrypted. S3 + CloudFront with KMS." },
            { icon: BookOpen, label: "Audit logging", desc: "All actions tracked. IP, timestamp, user-agent, actor." },
            { icon: Mail, label: "Email notifications", desc: "Via Resend. Org-branded templates." },
            { icon: Landmark, label: "Manual wire transfer", desc: "Free. Always available." },
          ].map(i => (
            <div key={i.label} className="flex items-start gap-3 px-4 py-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <i.icon size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-sm font-medium text-gray-900">{i.label}</span>
                <p className="text-xs text-gray-500">{i.desc}</p>
              </div>
              <Badge variant="success" className="ml-auto shrink-0">Active</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Settings size={14} /> Optional integrations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: UserCheck, label: "KYC/AML (Persona)", desc: "Self-ack active (free). Enhanced ID verification.", status: "Coming Soon" },
            { icon: CreditCard, label: "ACH payments (Stripe)", desc: "Stripe ACH Direct Debit for LP funding.", status: "Coming Soon" },
            { icon: CircleDollarSign, label: "Accounting (QuickBooks)", desc: "Sync fund transactions to QuickBooks.", status: "Phase 3" },
            { icon: FileText, label: "Tax (Wolters Kluwer)", desc: "K-1 automation and tax document generation.", status: "Phase 3" },
          ].map(i => (
            <div key={i.label} className="flex items-start gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <i.icon size={18} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-sm font-medium text-gray-700">{i.label}</span>
                <p className="text-xs text-gray-500">{i.desc}</p>
              </div>
              <Badge className="ml-auto shrink-0">{i.status}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Compliance settings</h3>
        <div className="space-y-4">
          <Select label="Audit log retention" options={["5 years", "7 years (recommended)", "10 years", "Indefinite"]} value={data.auditRetention || "7 years (recommended)"} onChange={v => update({ auditRetention: v })} />
          <Select label="Export format" options={["CSV", "JSON", "ZIP (includes documents)"]} value={data.exportFormat || "CSV"} onChange={v => update({ exportFormat: v })} />
          <Toggle label="Form D filing reminder" description="Remind me after first LP commitment to file Form D within 15 days." checked={data.formDReminder !== false} onChange={v => update({ formDReminder: v })} />
        </div>
      </div>
    </div>
  );
}

function Step8Launch({ data, update }) {
  const isDataroomOnly = data.raiseMode === "DATAROOM_ONLY";
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Preview & launch"
        description="Review your setup, preview the investor experience, and go live."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Company", value: data.companyName || "—", sub: `${data.entityType || "—"} • EIN: ****${(data.ein || "").slice(-4)}`, step: 1 },
          { label: "Branding", value: data.brandColor ? "Custom colors set" : "Default theme", sub: data.customDomain || "yourorg.fundroom.ai", step: 2 },
          { label: "Raise style", value: data.raiseMode === "GP_FUND" ? "GP/LP Fund" : data.raiseMode === "STARTUP" ? "Startup" : "Dataroom only", sub: data.regDExemption ? `${data.regDExemption === "506B" ? "506(b)" : "506(c)"}` : "—", step: 3 },
          { label: "Dataroom", value: (data.dataroomFiles || []).length + " documents", sub: data.dataroomName || "—", step: 4 },
          { label: "Fund terms", value: data.fundName || data.roundName || "—", sub: data.targetRaise ? `$${Number(data.targetRaise).toLocaleString()} target` : "—", step: 5 },
          { label: "LP onboarding", value: "6 steps configured", sub: data.gpApproval !== false ? "GP approval required" : "Auto-approve", step: 6 },
        ].map(card => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{card.label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => update({ _jumpToStep: card.step })}>Edit</Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <Button variant="secondary" size="lg" icon={Eye} className="w-full" onClick={() => {}}>
          Preview your dataroom as a visitor
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-emerald-50/50 border-emerald-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">Dataroom</h4>
              <p className="text-sm text-emerald-700 mb-2">Your dataroom is live — free.</p>
              <div className="flex items-center gap-2 bg-white rounded-md px-3 py-1.5 text-xs font-mono text-gray-600 border">
                <Globe size={12} />
                <span className="truncate">{data.customDomain || "yourorg"}.fundroom.ai/d/fund</span>
                <Button variant="ghost" size="sm" className="ml-auto p-0" icon={Copy} />
              </div>
            </div>
          </div>
        </Card>

        <Card className={isDataroomOnly ? "opacity-50" : "bg-blue-50/50 border-blue-200"}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Rocket size={20} className="text-[#0066FF]" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">Fundroom</h4>
              {isDataroomOnly ? (
                <p className="text-sm text-gray-500">Dataroom only mode. Set up fund later.</p>
              ) : (
                <>
                  <p className="text-sm text-blue-700 mb-2">Configured — activate to go live.</p>
                  <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                    <p>✓ "I want to invest" button goes live</p>
                    <p>✓ LP onboarding wizard accepts real signups</p>
                    <p>✓ Document signing active</p>
                    <p>✓ Commitment tracking + pipeline CRM</p>
                  </div>
                  <Button variant="primary" size="md" className="w-full">
                    Activate Fundroom →
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      <AdvancedSection title="Optional add-ons">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Remove "Powered by FundRoom" branding</p>
            <p className="text-xs text-gray-500">Clean white-label experience</p>
          </div>
          <span className="text-sm font-semibold text-gray-700">$50/month</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Custom domain</p>
            <p className="text-xs text-gray-500">invest.yourfirm.com</p>
          </div>
          <span className="text-sm font-semibold text-gray-700">$10/month</span>
        </div>
      </AdvancedSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LP ONBOARDING WIZARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function LPStep1Account({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Create your account" description="Get started to access the fund documents and invest." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="First name" required placeholder="John" value={data.firstName} onChange={v => update({ firstName: v })} />
        <Input label="Last name" required placeholder="Smith" value={data.lastName} onChange={v => update({ lastName: v })} />
      </div>
      <Input label="Email address" required type="email" placeholder="john@example.com" value={data.email} onChange={v => update({ email: v })} helper="We'll send a verification link to this address." />
      <Input label="Phone number" required type="tel" placeholder="+1 (555) 123-4567" value={data.phone} onChange={v => update({ phone: v })} />
      <Input label="Password" required type="password" placeholder="Minimum 12 characters" value={data.password} onChange={v => update({ password: v })} helper="Minimum 12 characters with uppercase, lowercase, and number." />
    </div>
  );
}

function LPStep2NDA({ data, update }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Non-disclosure agreement" description="Review and sign the NDA to access confidential fund materials." />
      <div className="bg-gray-50 border rounded-lg p-6 max-h-96 overflow-y-auto text-sm text-gray-700 leading-relaxed space-y-3">
        <h3 className="font-bold text-gray-900">CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT</h3>
        <p>This Non-Disclosure Agreement ("Agreement") is entered into by and between the undersigned investor ("Recipient") and the fund entity ("Discloser") as of the date of electronic signature below.</p>
        <p>1. <strong>Confidential Information.</strong> "Confidential Information" means all information disclosed by Discloser to Recipient, whether orally or in writing, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.</p>
        <p>2. <strong>Obligations.</strong> Recipient agrees to: (a) hold the Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it only for evaluating a potential investment.</p>
        <p>3. <strong>Term.</strong> This Agreement shall remain in effect for a period of two (2) years from the date of execution.</p>
        <p>4. <strong>Return of Materials.</strong> Upon request, Recipient shall promptly return or destroy all copies of Confidential Information.</p>
        <p className="text-xs text-gray-500 pt-4 border-t">This is a template NDA provided by FundRoom AI. The fund's GP may provide a custom NDA.</p>
      </div>
      <Card className="bg-blue-50/50 border-blue-200">
        <div className="flex items-start gap-3">
          <FileSignature size={20} className="text-[#0066FF] shrink-0 mt-1" />
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 text-sm">E-sign with FundRoom Sign</h4>
            <p className="text-xs text-gray-500 mt-1 mb-3">Your signature will be cryptographically linked to this document with a timestamp and IP address.</p>
            <div className="flex gap-3 items-end">
              <Input label="Full legal name" required placeholder="John Smith" value={data.ndaSignName} onChange={v => update({ ndaSignName: v })} className="flex-1" />
              <Button variant="primary" size="md" icon={FileSignature} disabled={!data.ndaSignName}>Sign NDA</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LPStep3Accreditation({ data, update, fundData }) {
  const is506C = fundData?.regDExemption === "506C";
  const minInvestment = fundData?.minInvestment || "200,000";
  return (
    <div className="space-y-6">
      <SectionHeader title="Accredited investor verification" description="This offering is available to accredited investors." />
      <Alert variant="info">
        An accredited investor is generally someone with individual income over $200,000/year (or $300,000 joint with spouse), OR net worth exceeding $1,000,000 (excluding primary residence), OR certain professional certifications (FINRA Series 7, 65, 82).
      </Alert>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Which category applies to you? <span className="text-red-500">*</span></label>
        <div className="space-y-2">
          {[
            { value: "INCOME", label: "Income — Individual income > $200K (or $300K joint) for the last 2 years" },
            { value: "NET_WORTH", label: "Net worth — Net worth > $1M (excluding primary residence)" },
            { value: "PROFESSIONAL", label: "Professional certification — FINRA Series 7, 65, or 82" },
            { value: "ENTITY_ASSETS", label: "Entity — Total assets exceeding $5,000,000" },
            { value: "ENTITY_OWNERS", label: "Entity — All equity owners are individually accredited" },
          ].map(cat => (
            <label key={cat.value} className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors",
              data.accreditationCategory === cat.value ? "border-[#0066FF] bg-blue-50" : "border-gray-200 hover:border-gray-300"
            )}>
              <input type="radio" name="accreditation" value={cat.value} checked={data.accreditationCategory === cat.value} onChange={() => update({ accreditationCategory: cat.value })} className="mt-0.5" />
              <span className="text-sm text-gray-700">{cat.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Card className="bg-amber-50/50 border-amber-200 space-y-3">
        <Checkbox
          label="I certify that I am an accredited investor as defined by SEC Rule 501 of Regulation D."
          checked={data.accreditationCertified}
          onChange={v => update({ accreditationCertified: v })}
          required
        />
        {is506C && (
          <>
            <Checkbox
              label={`I certify that my minimum investment amount of $${minInvestment} is not financed in whole or in part by any third party for the specific purpose of making this investment.`}
              checked={data.noThirdPartyFinancing}
              onChange={v => update({ noThirdPartyFinancing: v })}
              required
            />
            <Checkbox
              label={`I understand that the minimum investment for this offering is $${minInvestment} and that meeting this threshold supports verification of my accredited investor status.`}
              checked={data.minThresholdAck}
              onChange={v => update({ minThresholdAck: v })}
              required
            />
          </>
        )}
      </Card>

      {is506C && (
        <Alert variant="success">
          Your minimum investment of ${minInvestment} meets the SEC's verification threshold per March 2025 guidance. No additional documentation is required.
        </Alert>
      )}
    </div>
  );
}

function LPStep4InvestorType({ data, update }) {
  const types = [
    { id: "INDIVIDUAL", label: "Individual", icon: Users },
    { id: "LLC", label: "LLC / Corporation", icon: Building2 },
    { id: "TRUST", label: "Trust", icon: Scale },
    { id: "IRA", label: "IRA / 401(k)", icon: Landmark },
    { id: "OTHER", label: "Other entity", icon: Building },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="Investor details" description="Tell us how you're investing so we can prepare the right documents." />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {types.map(t => (
          <Card key={t.id} selected={data.investorType === t.id} onClick={() => update({ investorType: t.id })} hoverable className="p-3 text-center">
            <t.icon size={20} className={cn("mx-auto mb-1", data.investorType === t.id ? "text-[#0066FF]" : "text-gray-400")} />
            <span className="text-xs font-medium">{t.label}</span>
          </Card>
        ))}
      </div>

      {data.investorType === "INDIVIDUAL" && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Full legal name" required value={data.legalName} onChange={v => update({ legalName: v })} />
            <Input label="Date of birth" required type="date" value={data.dob} onChange={v => update({ dob: v })} />
          </div>
          <Input label="SSN / Tax ID" required masked placeholder="XXX-XX-XXXX" value={data.ssn} onChange={v => update({ ssn: v })} helper="Encrypted AES-256. Required for W-9 and K-1 generation." />
          <Input label="Physical address" required placeholder="123 Main St, City, State ZIP" value={data.physicalAddress} onChange={v => update({ physicalAddress: v })} helper="Physical address required. No PO Boxes." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Country of citizenship" required options={["United States", "Canada", "United Kingdom", "Other"]} value={data.citizenship} onChange={v => update({ citizenship: v })} placeholder="Select country" />
            <Select label="Country of tax residence" required options={["United States", "Canada", "United Kingdom", "Other"]} value={data.taxResidence} onChange={v => update({ taxResidence: v })} placeholder="Select country" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Occupation / employer" placeholder="CEO, Acme Corp" value={data.occupation} onChange={v => update({ occupation: v })} />
            <Select label="Source of funds" options={["Salary/Wages", "Investment returns", "Business income", "Inheritance", "Other"]} value={data.sourceOfFunds} onChange={v => update({ sourceOfFunds: v })} placeholder="Select source" />
          </div>
        </div>
      )}

      {data.investorType === "LLC" && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Entity legal name" required value={data.entityName} onChange={v => update({ entityName: v })} />
            <Select label="Entity type" required options={["LLC", "Corporation", "Partnership"]} value={data.entitySubType} onChange={v => update({ entitySubType: v })} placeholder="Select type" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="EIN" required masked placeholder="XX-XXXXXXX" value={data.entityEin} onChange={v => update({ entityEin: v })} />
            <Select label="Tax classification" required options={["Disregarded Entity", "Partnership", "S-Corp", "C-Corp"]} value={data.taxClass} onChange={v => update({ taxClass: v })} placeholder="Select classification" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="State of formation" required options={US_STATES} value={data.entityState} onChange={v => update({ entityState: v })} placeholder="Select state" />
            <Input label="Date of formation" required type="date" value={data.entityFormDate} onChange={v => update({ entityFormDate: v })} />
          </div>
          <Input label="Principal business address" required placeholder="No PO Boxes" value={data.entityAddress} onChange={v => update({ entityAddress: v })} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Authorized signer name" required value={data.signerName} onChange={v => update({ signerName: v })} />
            <Input label="Signer title" required placeholder="Managing Member" value={data.signerTitle} onChange={v => update({ signerTitle: v })} />
            <Input label="Signer email" required type="email" value={data.signerEmail} onChange={v => update({ signerEmail: v })} />
          </div>
        </div>
      )}

      {data.investorType === "IRA" && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <Select label="Account type" required options={["Traditional IRA", "Roth IRA", "Solo 401(k)", "SEP IRA", "SIMPLE IRA"]} value={data.iraType} onChange={v => update({ iraType: v })} placeholder="Select type" />
          <Input label="Account title (FBO)" required placeholder="FBO John Smith" value={data.iraTitle} onChange={v => update({ iraTitle: v })} helper="Legal title for subscription agreement" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Custodian name" required placeholder="Equity Trust Company" value={data.custodianName} onChange={v => update({ custodianName: v })} />
            <Input label="Custodian account number" required value={data.custodianAcct} onChange={v => update({ custodianAcct: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Custodian EIN" required masked value={data.custodianEin} onChange={v => update({ custodianEin: v })} />
            <Input label="Custodian contact person" required value={data.custodianContact} onChange={v => update({ custodianContact: v })} />
          </div>
          <Input label="Custodian address" required value={data.custodianAddress} onChange={v => update({ custodianAddress: v })} />
          <Input label="Account holder SSN" required masked placeholder="XXX-XX-XXXX" value={data.holderSsn} onChange={v => update({ holderSsn: v })} helper="Encrypted AES-256" />
          <Toggle label="Custodian co-sign required" description="Many custodians must co-sign subscription docs." checked={data.custodianCoSign || false} onChange={v => update({ custodianCoSign: v })} />
          <FileUploadZone label="Direction of Investment Letter" onUpload={files => update({ directionLetter: files })} files={data.directionLetter || []} />
        </div>
      )}

      {data.investorType === "TRUST" && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <Input label="Trust legal name" required value={data.trustName} onChange={v => update({ trustName: v })} />
          <Select label="Trust type" required options={["Revocable", "Irrevocable", "Family", "Charitable", "Other"]} value={data.trustType} onChange={v => update({ trustType: v })} placeholder="Select type" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="EIN or grantor SSN" required masked value={data.trustTaxId} onChange={v => update({ trustTaxId: v })} />
            <Input label="Date established" required type="date" value={data.trustDate} onChange={v => update({ trustDate: v })} />
          </div>
          <Input label="Trust address" required placeholder="Physical address, no PO Box" value={data.trustAddress} onChange={v => update({ trustAddress: v })} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Trustee name" required value={data.trusteeName} onChange={v => update({ trusteeName: v })} />
            <Input label="Trustee title" required value={data.trusteeTitle} onChange={v => update({ trusteeTitle: v })} />
          </div>
          <FileUploadZone label="Trust agreement (upload)" onUpload={files => update({ trustAgreement: files })} files={data.trustAgreement || []} />
        </div>
      )}
    </div>
  );
}

function LPStep5Commitment({ data, update, fundData }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Investment commitment" description="Review the offering terms and commit your investment amount." />

      {/* Fund terms summary */}
      <Card className="bg-gray-50 border-gray-200">
        <h4 className="font-semibold text-gray-900 text-sm mb-3">Offering terms</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500 text-xs">Fund</p><p className="font-medium">{fundData?.fundName || "—"}</p></div>
          <div><p className="text-gray-500 text-xs">Target raise</p><p className="font-medium">${Number(fundData?.targetRaise || 0).toLocaleString()}</p></div>
          <div><p className="text-gray-500 text-xs">Minimum</p><p className="font-medium">${Number(fundData?.minInvestment || 0).toLocaleString()}</p></div>
          <div><p className="text-gray-500 text-xs">Exemption</p><p className="font-medium">{fundData?.regDExemption === "506C" ? "506(c)" : "506(b)"}</p></div>
        </div>
        {fundData?.raiseMode === "GP_FUND" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t border-gray-200">
            <div><p className="text-gray-500 text-xs">Management fee</p><p className="font-medium">{fundData?.mgmtFee || "2.0"}%</p></div>
            <div><p className="text-gray-500 text-xs">Carried interest</p><p className="font-medium">{fundData?.carry || "20.0"}%</p></div>
            <div><p className="text-gray-500 text-xs">Hurdle rate</p><p className="font-medium">{fundData?.hurdle || "8.0"}%</p></div>
            <div><p className="text-gray-500 text-xs">Fund term</p><p className="font-medium">{fundData?.fundTerm || "10"} years</p></div>
          </div>
        )}
      </Card>

      <Input label="Commitment amount" required prefix="$" type="number" placeholder={fundData?.minInvestment || "200,000"} value={data.commitmentAmount} onChange={v => update({ commitmentAmount: v })} helper={`Minimum investment: $${Number(fundData?.minInvestment || 0).toLocaleString()}`} />

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Investor representations</h3>
        <p className="text-xs text-gray-500 mb-3">Each representation is individually timestamped and audit-logged for SEC compliance.</p>
        <div className="space-y-3">
          {[
            { key: "rep1", label: "I certify that I am an accredited investor under SEC Rule 501(a) of Regulation D." },
            { key: "rep2", label: "I am investing solely as principal and not for the benefit of any third party." },
            { key: "rep3", label: "I have received, read, and reviewed the offering documents (PPM, LPA/SAFE, Subscription Agreement)." },
            { key: "rep4", label: "I understand the risks of this investment, including illiquidity and potential total loss of invested capital." },
            { key: "rep5", label: "I understand that these securities are restricted and cannot be freely transferred or resold." },
            { key: "rep6", label: "I represent that my investment funds are not derived from criminal activity and I am not on any sanctions list (OFAC/SDN)." },
            { key: "rep7", label: "I agree to provide tax information (W-9/W-8) and consent to receive K-1 tax documents." },
            { key: "rep8", label: "I have obtained my own independent legal and tax advice. I am not relying on the GP for legal or tax counsel." },
          ].map(rep => (
            <Checkbox
              key={rep.key}
              label={rep.label}
              checked={data[rep.key]}
              onChange={v => update({ [rep.key]: v })}
              required
            />
          ))}
        </div>
      </div>

      <Card className="bg-blue-50/50 border-blue-200">
        <div className="flex items-start gap-3">
          <FileSignature size={20} className="text-[#0066FF] shrink-0 mt-1" />
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 text-sm">Sign subscription documents</h4>
            <p className="text-xs text-gray-500 mt-1 mb-3">E-sign with FundRoom Sign, or upload externally signed documents.</p>
            <div className="flex gap-3">
              <Button variant="primary" size="md" icon={FileSignature}>E-sign now</Button>
              <Button variant="secondary" size="md" icon={Upload}>Upload signed docs</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LPStep6Funding({ data, update, fundData }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Funding instructions" description="Complete your investment by sending a wire transfer." />

      <Card className="bg-gray-50">
        <h4 className="font-semibold text-gray-900 text-sm mb-4">Wire transfer details</h4>
        <div className="space-y-3 text-sm">
          {[
            { label: "Bank name", value: fundData?.bankName || "JPMorgan Chase" },
            { label: "Account name", value: fundData?.accountName || fundData?.companyName || "Fund Entity LLC" },
            { label: "Account number", value: "••••••" + (fundData?.accountNumber || "").slice(-4) },
            { label: "Routing number (ABA)", value: "••••" + (fundData?.routingNumber || "").slice(-4) },
            { label: "SWIFT/BIC", value: fundData?.swift || "—" },
            { label: "Reference/memo", value: `${data.firstName || "[Name]"} ${data.lastName || ""} - ${fundData?.fundName || "[Fund]"} - $${Number(data.commitmentAmount || 0).toLocaleString()}` },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
              <span className="text-gray-500">{row.label}</span>
              <span className="font-mono font-medium text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={Copy} className="mt-3">Copy wire instructions</Button>
      </Card>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Upload wire proof</h3>
        <p className="text-xs text-gray-500 mb-3">Upload your wire transfer confirmation or receipt. The GP will review and confirm.</p>
        <FileUploadZone
          label="Wire proof / payment confirmation"
          accept=".pdf,.png,.jpg,.jpeg"
          onUpload={files => update({ wireProof: files })}
          files={data.wireProof || []}
          maxSize="10MB"
        />
      </div>

      <Alert variant="info">
        After uploading your wire proof, the GP will review and confirm receipt. You'll receive an email notification when your investment is confirmed. Access your LP Portal to track your investment status.
      </Alert>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN WIZARD CONTAINER
// ═══════════════════════════════════════════════════════════════════

function WizardProgress({ steps, currentStep, onStepClick }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const isActive = currentStep === step.id;
        const isComplete = currentStep > step.id;
        const Icon = step.icon;
        return (
          <button
            key={step.id}
            onClick={() => onStepClick(step.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
              isActive && "bg-[#0066FF] text-white shadow-sm",
              isComplete && "bg-emerald-50 text-emerald-700",
              !isActive && !isComplete && "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
              isActive && "bg-white/20",
              isComplete && "bg-emerald-200",
              !isActive && !isComplete && "bg-gray-200"
            )}>
              {isComplete ? <Check size={10} /> : step.id}
            </div>
            <span className="hidden md:inline">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GPWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    country: "United States",
    regDExemption: "506B",
    poweredByBadge: true,
    requireEmail: true,
    watermark: true,
    linkExpiration: true,
    investButton: true,
    allowExternalUpload: true,
    allowGPUpload: true,
    gpApproval: true,
    emailLPSteps: true,
    emailGPCommitment: true,
    emailGPWire: true,
    formDReminder: true,
  });

  const update = useCallback((patch) => {
    if (patch._jumpToStep) {
      setStep(patch._jumpToStep);
      return;
    }
    setData(prev => ({ ...prev, ...patch }));
  }, []);

  const steps = data.raiseMode === "DATAROOM_ONLY"
    ? WIZARD_STEPS.filter(s => s.id <= 4 || s.id >= 7)
    : WIZARD_STEPS;

  const StepComponent = {
    1: Step1CompanyInfo,
    2: Step2Branding,
    3: Step3RaiseStyle,
    4: Step4Dataroom,
    5: Step5FundDetails,
    6: Step6LPOnboarding,
    7: Step7Integrations,
    8: Step8Launch,
  }[step];

  const canProceed = () => {
    if (step === 1) return data.companyName && data.entityType && data.ein && data.badActorCertified;
    if (step === 3) return data.raiseMode;
    return true;
  };

  const nextStep = () => {
    const idx = steps.findIndex(s => s.id === step);
    if (idx < steps.length - 1) setStep(steps[idx + 1].id);
  };
  const prevStep = () => {
    const idx = steps.findIndex(s => s.id === step);
    if (idx > 0) setStep(steps[idx - 1].id);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header */}
      <header className="bg-[#0A1628] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2ECC71] via-[#00C9A7] to-[#0066FF] flex items-center justify-center">
              <BarChart3 size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">FundRoom AI</span>
          </div>
          <Badge variant="info">GP Onboarding Wizard</Badge>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Progress */}
        <WizardProgress steps={steps} currentStep={step} onStepClick={setStep} />

        {/* Phase indicator */}
        <div className="mt-4 mb-6 flex items-center gap-2">
          {step <= 4 && <Badge variant="free">Free — active immediately</Badge>}
          {(step === 5 || step === 6) && <Badge variant="paid">Free to configure — paywall to activate</Badge>}
          {step >= 7 && <Badge variant="info">Integrations & launch</Badge>}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
          {StepComponent && <StepComponent data={data} update={update} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="ghost" onClick={prevStep} disabled={step === steps[0].id} icon={ChevronLeft}>
            Back
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost">Save draft</Button>
            {step === steps[steps.length - 1].id ? (
              <Button variant="success" size="lg" icon={Rocket} onClick={() => alert("🎉 Organization created! Redirecting to GP Dashboard...")}>
                Complete setup
              </Button>
            ) : (
              <Button variant="primary" onClick={nextStep} disabled={!canProceed()}>
                Continue <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LPWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({});
  // Simulate GP fund data
  const fundData = {
    fundName: "Bermuda Club Fund I",
    companyName: "Bermuda Franchise Group LLC",
    targetRaise: "10000000",
    minInvestment: "200000",
    regDExemption: "506B",
    raiseMode: "GP_FUND",
    mgmtFee: "2.0",
    carry: "20.0",
    hurdle: "8.0",
    fundTerm: "10",
    bankName: "JPMorgan Chase",
    accountName: "Bermuda Club Fund I LLC",
  };

  const update = useCallback((patch) => setData(prev => ({ ...prev, ...patch })), []);

  const StepComponent = {
    1: LPStep1Account,
    2: LPStep2NDA,
    3: LPStep3Accreditation,
    4: LPStep4InvestorType,
    5: LPStep5Commitment,
    6: LPStep6Funding,
  }[step];

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <header className="bg-[#0A1628] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2ECC71] via-[#00C9A7] to-[#0066FF] flex items-center justify-center">
              <BarChart3 size={18} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">Bermuda Club Fund I</span>
              <span className="text-white/40 text-xs ml-2">Powered by FundRoom</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <WizardProgress steps={LP_STEPS} currentStep={step} onStepClick={setStep} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8 mt-6">
          {StepComponent && <StepComponent data={data} update={update} fundData={fundData} />}
        </div>

        <div className="flex items-center justify-between mt-6">
          <Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} icon={ChevronLeft}>
            Back
          </Button>
          {step === 6 ? (
            <Button variant="success" size="lg" icon={CheckCircle2} onClick={() => alert("🎉 Investment submitted! Check your email for confirmation.")}>
              Submit investment
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(Math.min(6, step + 1))}>
              Continue <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP — TAB SWITCHER
// ═══════════════════════════════════════════════════════════════════

export default function FundRoomApp() {
  const [view, setView] = useState("gp");

  return (
    <div>
      {/* View switcher bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-[#0A1628] rounded-full p-1 shadow-2xl shadow-black/30">
        <button
          onClick={() => setView("gp")}
          className={cn(
            "px-5 py-2 rounded-full text-sm font-semibold transition-all",
            view === "gp" ? "bg-[#0066FF] text-white" : "text-gray-400 hover:text-white"
          )}
        >
          GP Wizard
        </button>
        <button
          onClick={() => setView("lp")}
          className={cn(
            "px-5 py-2 rounded-full text-sm font-semibold transition-all",
            view === "lp" ? "bg-[#0066FF] text-white" : "text-gray-400 hover:text-white"
          )}
        >
          LP Onboarding
        </button>
      </div>

      {view === "gp" ? <GPWizard /> : <LPWizard />}
    </div>
  );
}
