"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Sparkles,
  Shield,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Main Component ─────────────────────────────────────────────────────────

export function AISettingsSection({ teamId }: { teamId: string }) {
  const [agentsEnabled, setAgentsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [featureAvailable, setFeatureAvailable] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/ai-settings`);
      if (res.ok) {
        const data = await res.json();
        setAgentsEnabled(data.agentsEnabled ?? false);
        setFeatureAvailable(true);
      } else if (res.status === 404) {
        setFeatureAvailable(false);
      }
    } catch {
      setFeatureAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (enabled: boolean) => {
    if (!teamId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentsEnabled: enabled }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update AI settings");
        return;
      }
      setAgentsEnabled(enabled);
      toast.success(`AI Agents ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update AI settings");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureAvailable) {
    return (
      <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
        <Bot className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          AI features are not available for your team.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Contact support to enable AI-powered document chat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Beta badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          Beta
        </Badge>
        <p className="text-xs text-muted-foreground">
          AI-powered chat for your documents and datarooms
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium">Enable AI Agents</p>
            <p className="text-xs text-muted-foreground">
              Allow AI-powered chat on documents in your team
            </p>
          </div>
        </div>
        <button
          onClick={() => handleToggle(!agentsEnabled)}
          disabled={updating}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            agentsEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
          } ${updating ? "opacity-50 cursor-wait" : ""}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
              agentsEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Privacy info */}
      <div className="rounded-md border bg-muted/30 px-3 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <p className="text-xs font-medium">Privacy & Data Usage</p>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600 dark:text-green-400">✓</span>
            <span>Powered by OpenAI — no training on your data</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600 dark:text-green-400">✓</span>
            <span>Document embeddings stored securely, deletable at any time</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-green-600 dark:text-green-400">✓</span>
            <span>Enable per-document from document settings</span>
          </div>
        </div>
        <a
          href="https://openai.com/policies/api-data-usage-policies"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          OpenAI data usage policies
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* How it works */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">How It Works</p>
        <ol className="space-y-1 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">1</span>
            Enable AI Agents above (admin only)
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">2</span>
            Activate AI on individual documents from their settings
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">3</span>
            Click &quot;Index Document&quot; to prepare for AI chat
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">4</span>
            Visitors can ask questions and get AI-powered answers
          </li>
        </ol>
      </div>
    </div>
  );
}
