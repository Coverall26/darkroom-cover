"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  ttl?: string;
}

interface DomainConfig {
  configured: boolean;
  domain?: string;
  domainId?: string;
  status?: string;
  region?: string;
  dnsRecords?: DnsRecord[];
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
  verifiedAt?: string;
}

type WizardStep = "enter-domain" | "dns-records" | "verifying" | "from-settings" | "verified";

// ─── Main Component ─────────────────────────────────────────────────────────

export function EmailDomainSection({ teamId }: { teamId: string }) {
  const [config, setConfig] = useState<DomainConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>("enter-domain");
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/email-domain`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.configured) {
          setFromName(data.fromName || "");
          setFromAddress(data.fromAddress || "");
          setReplyTo(data.replyTo || "");
          if (data.status === "verified") {
            setStep("verified");
          } else if (data.status === "pending" || data.status === "temporary_failure") {
            setStep("dns-records");
          } else {
            setStep("verified");
          }
        }
      }
    } catch {
      // No config yet — show setup
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  useEffect(() => {
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [pollInterval]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Create domain ──
  const handleCreateDomain = async () => {
    if (!domain.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/email-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create email domain");
        return;
      }
      const data = await res.json();
      setConfig(data);
      setStep("dns-records");
      toast.success("Domain added. Configure DNS records below.");
    } catch {
      toast.error("Failed to create email domain");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Verify DNS ──
  const handleVerify = async () => {
    setSubmitting(true);
    setStep("verifying");
    try {
      const res = await fetch(`/api/teams/${teamId}/email-domain/verify`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "verified") {
          setConfig((prev) => prev ? { ...prev, status: "verified" } : prev);
          setStep("from-settings");
          toast.success("Domain verified!");
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
      }
      // Start polling
      const interval = setInterval(async () => {
        try {
          const checkRes = await fetch(`/api/teams/${teamId}/email-domain/verify`, {
            method: "POST",
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.status === "verified") {
              clearInterval(interval);
              setPollInterval(null);
              setConfig((prev) => prev ? { ...prev, status: "verified" } : prev);
              setStep("from-settings");
              toast.success("Domain verified!");
            }
          }
        } catch {
          // Continue polling
        }
      }, 5000);
      setPollInterval(interval);
      // Stop after 2 minutes
      setTimeout(() => {
        clearInterval(interval);
        setPollInterval(null);
        setStep("dns-records");
        toast.error("Verification timed out. Please check DNS records and try again.");
      }, 120000);
    } catch {
      toast.error("Verification failed");
      setStep("dns-records");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Save sender settings ──
  const handleSaveSettings = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/email-domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromName: fromName.trim(),
          fromAddress: fromAddress.trim(),
          replyTo: replyTo.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save settings");
        return;
      }
      toast.success("Sender settings saved");
      setStep("verified");
      fetchConfig();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Remove domain ──
  const handleRemove = async () => {
    if (!confirm("Remove email domain? Emails will be sent from @fundroom.ai.")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/email-domain`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to remove domain");
        return;
      }
      setConfig(null);
      setStep("enter-domain");
      setDomain("");
      toast.success("Email domain removed");
    } catch {
      toast.error("Failed to remove domain");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Step: Enter Domain ──
  if (step === "enter-domain" && !config?.configured) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-900/10">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Configure a custom email domain to send investor emails from your own domain
            instead of @fundroom.ai.
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Email Domain</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mail.yourcompany.com"
              className="flex-1 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreateDomain()}
            />
            <Button
              size="sm"
              onClick={handleCreateDomain}
              disabled={submitting || !domain.trim()}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Setup
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We recommend using a subdomain like mail.yourcompany.com
          </p>
        </div>
      </div>
    );
  }

  // ── Step: DNS Records ──
  if (step === "dns-records" && config?.dnsRecords) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">DNS Records for {config.domain}</p>
            <p className="text-xs text-muted-foreground">Add these records to your DNS provider</p>
          </div>
          <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b dark:border-gray-800">
                <th className="pb-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="pb-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="pb-2 text-left font-medium text-muted-foreground">Value</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {config.dnsRecords.map((record, i) => (
                <tr key={i}>
                  <td className="py-2">
                    <Badge variant="secondary" className="text-[10px]">{record.type}</Badge>
                  </td>
                  <td className="py-2 font-mono text-[11px] max-w-[120px] truncate">{record.name}</td>
                  <td className="py-2 font-mono text-[11px] max-w-[200px] truncate">{record.value}</td>
                  <td className="py-2">
                    <button
                      onClick={() => copyToClipboard(record.value, `dns-${i}`)}
                      className="p-1 rounded hover:bg-muted"
                    >
                      {copiedField === `dns-${i}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleRemove} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleVerify}
            disabled={submitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Verify DNS
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Verifying ──
  if (step === "verifying") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <p className="text-sm font-medium">Verifying DNS records...</p>
        <p className="text-xs text-muted-foreground">
          This may take a few moments. Checking every 5 seconds.
        </p>
      </div>
    );
  }

  // ── Step: From Settings ──
  if (step === "from-settings") {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-green-200 bg-green-50/50 px-3 py-2 dark:border-green-800 dark:bg-green-900/10">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-700 dark:text-green-300">
              Domain verified! Configure your sender identity.
            </p>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Sender Name</Label>
          <Input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Your Organization"
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Sender Email</Label>
          <Input
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder={`noreply@${config?.domain || "yourdomain.com"}`}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Reply-To (optional)</Label>
          <Input
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder={`support@${config?.domain || "yourdomain.com"}`}
            className="mt-1 text-sm"
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveSettings}
            disabled={submitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Verified (management view) ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono">{config?.domain}</span>
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3" />
            Active
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 dark:text-red-400"
          onClick={handleRemove}
          disabled={submitting}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Remove
        </Button>
      </div>
      <div className="rounded-md border px-3 py-2 dark:border-gray-800">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">From</p>
            <p className="font-medium">{config?.fromName || "Not set"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-mono text-xs">{config?.fromAddress || "Not set"}</p>
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setStep("from-settings")}
        className="text-xs"
      >
        Edit Sender Settings
      </Button>
    </div>
  );
}
