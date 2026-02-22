"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Domain {
  id: string;
  slug: string;
  verified: boolean;
  isDefault?: boolean;
  txtVerification?: string;
  cnameVerification?: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CustomDomainsSection({ teamId }: { teamId: string }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/domains`);
      if (res.ok) {
        const data = await res.json();
        setDomains(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAdd = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || domain.length < 3) {
      toast.error("Domain must be at least 3 characters");
      return;
    }
    if (domain.includes("fundroom")) {
      toast.error('"fundroom" is a reserved domain');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || err.message || "Failed to add domain");
        return;
      }
      toast.success("Domain added. Configure DNS records below.");
      setNewDomain("");
      setShowAddForm(false);
      fetchDomains();
    } catch {
      toast.error("Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Remove domain "${domain.slug}"?`)) return;
    setDeleting(domain.id);
    try {
      const res = await fetch(`/api/teams/${teamId}/domains`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.slug }),
      });
      if (!res.ok) {
        toast.error("Failed to remove domain");
        return;
      }
      toast.success("Domain removed");
      fetchDomains();
    } catch {
      toast.error("Failed to remove domain");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {domains.length} domain{domains.length !== 1 ? "s" : ""} configured
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Domain
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <p className="text-sm font-medium mb-2">Add Custom Domain</p>
          <div className="flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="docs.yourcompany.com"
              className="flex-1 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={adding || !newDomain.trim()}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            After adding, configure a CNAME record pointing to your platform domain.
          </p>
        </div>
      )}

      {/* Domain List */}
      {domains.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
          <Globe className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No custom domains configured. Add a domain to brand your dataroom links.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => (
            <div
              key={domain.id || domain.slug}
              className="flex items-center justify-between rounded-md border px-3 py-2.5 dark:border-gray-800"
            >
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono">{domain.slug}</span>
                {domain.verified ? (
                  <Badge variant="outline" className="gap-1 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800">
                    <Clock className="h-3 w-3" />
                    Pending
                  </Badge>
                )}
                {domain.isDefault && (
                  <Badge variant="secondary" className="text-[10px]">Default</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                onClick={() => handleDelete(domain)}
                disabled={deleting === domain.id}
              >
                {deleting === domain.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
