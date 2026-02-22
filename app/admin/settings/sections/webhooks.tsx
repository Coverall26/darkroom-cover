"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebhookItem {
  id: string;
  pId?: string;
  name: string;
  url: string;
  secret?: string;
  triggers?: string[];
  createdAt: string;
}

interface IncomingWebhookItem {
  id: string;
  name: string;
  webhookId: string;
  createdAt: string;
}

interface WebhookEvent {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}

const TEAM_EVENTS: WebhookEvent[] = [
  { id: "document-created", label: "Document Created", value: "document.created", enabled: true },
  { id: "document-updated", label: "Document Updated", value: "document.updated", enabled: false },
  { id: "document-deleted", label: "Document Deleted", value: "document.deleted", enabled: false },
  { id: "dataroom-created", label: "Dataroom Created", value: "dataroom.created", enabled: false },
];

const DOCUMENT_EVENTS: WebhookEvent[] = [
  { id: "link-created", label: "Link Created", value: "link.created", enabled: true },
  { id: "link-updated", label: "Link Updated", value: "link.updated", enabled: false },
];

const LINK_EVENTS: WebhookEvent[] = [
  { id: "link-viewed", label: "Link Viewed", value: "link.viewed", enabled: true },
  { id: "link-downloaded", label: "Link Downloaded", value: "link.downloaded", enabled: false },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export function WebhooksSection({ teamId }: { teamId: string }) {
  const [outgoing, setOutgoing] = useState<WebhookItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingWebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateIncoming, setShowCreateIncoming] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newTriggers, setNewTriggers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Incoming create form state
  const [incomingName, setIncomingName] = useState("");
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState<string | null>(null);
  const [creatingIncoming, setCreatingIncoming] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fetchWebhooks = useCallback(async () => {
    if (!teamId) return;
    try {
      const [outRes, inRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/webhooks`),
        fetch(`/api/teams/${teamId}/incoming-webhooks`),
      ]);
      if (outRes.ok) {
        const data = await outRes.json();
        setOutgoing(Array.isArray(data) ? data : []);
      }
      if (inRes.ok) {
        const data = await inRes.json();
        setIncoming(Array.isArray(data) ? data : []);
      }
    } catch {
      // Webhooks may not be configured
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // Generate a signing secret
  useEffect(() => {
    if (showCreate && !newSecret) {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let secret = "whsec_";
      for (let i = 0; i < 32; i++) {
        secret += chars[Math.floor(Math.random() * chars.length)];
      }
      setNewSecret(secret);
    }
  }, [showCreate, newSecret]);

  const handleCreateOutgoing = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          url: newUrl.trim(),
          secret: newSecret,
          triggers: newTriggers,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to create webhook");
        return;
      }
      toast.success("Webhook created");
      setShowCreate(false);
      setNewName("");
      setNewUrl("");
      setNewSecret("");
      setNewTriggers([]);
      fetchWebhooks();
    } catch {
      toast.error("Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteOutgoing = async (id: string) => {
    if (!confirm("Delete this webhook? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/webhooks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete webhook");
        return;
      }
      toast.success("Webhook deleted");
      setSelectedWebhook(null);
      fetchWebhooks();
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleCreateIncoming = async () => {
    if (!incomingName.trim()) return;
    setCreatingIncoming(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/incoming-webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: incomingName.trim() }),
      });
      if (!res.ok) {
        toast.error("Failed to create incoming webhook");
        return;
      }
      const data = await res.json();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      setCreatedWebhookUrl(`${baseUrl}/services/${data.webhookId}`);
      toast.success("Incoming webhook created");
      setIncomingName("");
      fetchWebhooks();
    } catch {
      toast.error("Failed to create incoming webhook");
    } finally {
      setCreatingIncoming(false);
    }
  };

  const handleDeleteIncoming = async (id: string) => {
    if (!confirm("Delete this incoming webhook?")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/incoming-webhooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId: id }),
      });
      if (!res.ok) {
        toast.error("Failed to delete webhook");
        return;
      }
      toast.success("Webhook deleted");
      fetchWebhooks();
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const toggleTrigger = (value: string) => {
    setNewTriggers((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
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
    <div className="space-y-6">
      {/* ── Outgoing Webhooks ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Outgoing Webhooks</p>
              <p className="text-xs text-muted-foreground">Send events to external services</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Create Outgoing Form */}
        {showCreate && (
          <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 space-y-3 dark:border-blue-800 dark:bg-blue-900/10">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Webhook"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://your-domain.com/webhooks"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Events</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Team</p>
                  {TEAM_EVENTS.map((evt) => (
                    <label key={evt.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={newTriggers.includes(evt.value)}
                        onChange={() => evt.enabled && toggleTrigger(evt.value)}
                        disabled={!evt.enabled}
                        className="h-3.5 w-3.5 rounded"
                      />
                      <span className={!evt.enabled ? "text-muted-foreground" : ""}>{evt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Document</p>
                  {DOCUMENT_EVENTS.map((evt) => (
                    <label key={evt.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={newTriggers.includes(evt.value)}
                        onChange={() => evt.enabled && toggleTrigger(evt.value)}
                        disabled={!evt.enabled}
                        className="h-3.5 w-3.5 rounded"
                      />
                      <span className={!evt.enabled ? "text-muted-foreground" : ""}>{evt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Link</p>
                  {LINK_EVENTS.map((evt) => (
                    <label key={evt.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={newTriggers.includes(evt.value)}
                        onChange={() => evt.enabled && toggleTrigger(evt.value)}
                        disabled={!evt.enabled}
                        className="h-3.5 w-3.5 rounded"
                      />
                      <span className={!evt.enabled ? "text-muted-foreground" : ""}>{evt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Signing Secret</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-1.5 font-mono text-xs truncate">
                  {newSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(newSecret, "secret")}
                  className="p-1 rounded hover:bg-muted"
                >
                  {copiedField === "secret" ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateOutgoing}
                disabled={creating || !newName.trim() || !newUrl.trim()}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        )}

        {/* Outgoing List */}
        {outgoing.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
            <Webhook className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No outgoing webhooks configured</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {outgoing.map((wh) => (
              <div
                key={wh.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{wh.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{wh.url}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedWebhook(selectedWebhook?.id === wh.id ? null : wh)}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                    onClick={() => handleDeleteOutgoing(wh.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail for selected outgoing webhook */}
        {selectedWebhook && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 dark:border-gray-800">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">URL</p>
                <p className="font-mono truncate">{selectedWebhook.url}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{formatDate(selectedWebhook.createdAt)}</p>
              </div>
            </div>
            {selectedWebhook.secret && (
              <div className="text-xs">
                <p className="text-muted-foreground">Signing Secret</p>
                <div className="flex items-center gap-1">
                  <code className="font-mono truncate">{selectedWebhook.secret}</code>
                  <button
                    onClick={() => copyToClipboard(selectedWebhook.secret!, `secret-${selectedWebhook.id}`)}
                    className="p-0.5 rounded hover:bg-muted"
                  >
                    {copiedField === `secret-${selectedWebhook.id}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}
            {selectedWebhook.triggers && selectedWebhook.triggers.length > 0 && (
              <div className="text-xs">
                <p className="text-muted-foreground mb-1">Events</p>
                <div className="flex flex-wrap gap-1">
                  {selectedWebhook.triggers.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Incoming Webhooks ── */}
      <div className="border-t pt-4 dark:border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Incoming Webhooks</p>
              <p className="text-xs text-muted-foreground">Receive data from external services</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowCreateIncoming(!showCreateIncoming)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Create Incoming Form */}
        {showCreateIncoming && (
          <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 space-y-3 dark:border-blue-800 dark:bg-blue-900/10">
            <div>
              <Label className="text-xs text-muted-foreground">Webhook Name</Label>
              <Input
                value={incomingName}
                onChange={(e) => setIncomingName(e.target.value)}
                placeholder="Enter a name"
                className="mt-1 text-sm"
              />
            </div>
            {createdWebhookUrl && (
              <div className="rounded bg-muted p-2">
                <p className="text-xs text-muted-foreground mb-1">Webhook URL (copy now)</p>
                <div className="flex items-center gap-1">
                  <code className="flex-1 font-mono text-xs break-all">{createdWebhookUrl}</code>
                  <button
                    onClick={() => copyToClipboard(createdWebhookUrl, "incoming-url")}
                    className="p-1 rounded hover:bg-background"
                  >
                    {copiedField === "incoming-url" ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateIncoming(false);
                  setCreatedWebhookUrl(null);
                }}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleCreateIncoming}
                disabled={creatingIncoming || !incomingName.trim()}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {creatingIncoming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        )}

        {/* Incoming List */}
        {incoming.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
            <ArrowDownToLine className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No incoming webhooks configured</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {incoming.map((wh) => {
              const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
              const whUrl = `${baseUrl}/services/${wh.webhookId}`;
              return (
                <div
                  key={wh.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{wh.name}</p>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground font-mono truncate">{whUrl}</p>
                      <button
                        onClick={() => copyToClipboard(whUrl, `incoming-${wh.id}`)}
                        className="p-0.5 rounded hover:bg-muted shrink-0"
                      >
                        {copiedField === `incoming-${wh.id}` ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400 ml-2"
                    onClick={() => handleDeleteIncoming(wh.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
