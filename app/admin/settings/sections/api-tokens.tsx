"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Loader2,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Token {
  id: string;
  name: string;
  partialKey: string;
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ApiTokensSection({ teamId }: { teamId: string }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fetchTokens = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/tokens`);
      if (res.ok) {
        const data = await res.json();
        setTokens(Array.isArray(data) ? data : []);
      }
    } catch {
      // Tokens endpoint may not exist
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleGenerate = async () => {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to generate token");
        return;
      }
      const data = await res.json();
      setNewToken(data.token);
      setName("");
      toast.success("API token generated");
      fetchTokens();
    } catch {
      toast.error("Failed to generate token");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!confirm("Revoke this token? Any services using it will lose access.")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/tokens`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      if (!res.ok) {
        toast.error("Failed to revoke token");
        return;
      }
      toast.success("Token revoked");
      fetchTokens();
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-900/10">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Use API tokens to integrate FundRoom with your applications. Keep tokens
          secure and never share them publicly.
        </p>
      </div>

      {/* Generate New Token */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Token Name</Label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter a name for your token"
            className="flex-1 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !name.trim()}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {/* Newly Generated Token */}
      {newToken && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Copy this token now — it won&apos;t be shown again
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs break-all">
              {newToken}
            </code>
            <button
              onClick={() => copyToClipboard(newToken, "new-token")}
              className="p-1.5 rounded hover:bg-muted shrink-0"
            >
              {copiedField === "new-token" ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Existing Tokens */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Existing Tokens ({tokens.length})
        </p>
        {tokens.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
            <Key className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No API tokens generated yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{token.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <code className="font-mono">{token.partialKey}</code>
                    <span>·</span>
                    <span>{token.user?.name || token.user?.email}</span>
                    <span>·</span>
                    <span>{formatDate(token.createdAt)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => handleRevoke(token.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
