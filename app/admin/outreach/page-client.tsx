"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Send,
  Mail,
  ListOrdered,
  FileText,
  Users,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Play,
  Pause,
  Eye,
  Clock,
  Sparkles,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTier } from "@/lib/hooks/use-tier";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SequenceStep {
  id: string;
  stepOrder: number;
  delayDays: number;
  templateId: string | null;
  aiPrompt: string | null;
  condition: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: SequenceStep[];
  stats: {
    totalEnrolled: number;
    active: number;
    completed: number;
  };
  createdAt: string;
}

interface FollowUp {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  nextFollowUpAt: string | null;
  engagementScore: number;
  status: string;
}

type Tab = "queue" | "sequences" | "templates" | "bulk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "queue", label: "Follow-up Queue", icon: Clock },
  { key: "sequences", label: "Sequences", icon: ListOrdered },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "bulk", label: "Bulk Send", icon: Users },
];

const CATEGORY_LABELS: Record<string, string> = {
  INVITATION: "Invitation",
  FOLLOW_UP: "Follow-up",
  COMMITMENT: "Commitment",
  WIRE: "Wire",
  UPDATE: "Update",
  CUSTOM: "Custom",
};

const CONDITION_LABELS: Record<string, string> = {
  ALWAYS: "Always send",
  IF_NO_REPLY: "If no reply",
  IF_NOT_OPENED: "If not opened",
  IF_NOT_CLICKED: "If not clicked",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OutreachClient() {
  const { tier, aiCrmEnabled, limits, isLoading: tierLoading } = useTier();
  const [activeTab, setActiveTab] = useState<Tab>("queue");

  // Check URL for tab param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab as Tab);
    }
  }, []);

  const isPaid = tier === "CRM_PRO" || tier === "FUNDROOM";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Send className="h-6 w-6 text-[#0066FF]" aria-hidden="true" />
            Outreach Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage email sequences, templates, and follow-ups
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-border pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const isLocked = (tab.key === "sequences" || tab.key === "bulk") && !isPaid && !tierLoading;
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (isLocked) {
                  toast.info("Upgrade to CRM Pro for email sequences and bulk send", {
                    action: {
                      label: "Upgrade",
                      onClick: () => window.location.assign("/admin/settings?tab=organization"),
                    },
                  });
                  return;
                }
                setActiveTab(tab.key);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "text-[#0066FF] border-[#0066FF]"
                  : isLocked
                    ? "text-muted-foreground/50 border-transparent cursor-default"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
              {isLocked && <Lock className="h-3 w-3 ml-0.5" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "queue" && <FollowUpQueueTab />}
      {activeTab === "sequences" && <SequencesTab aiEnabled={!!aiCrmEnabled} />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "bulk" && <BulkSendTab />}
    </div>
  );
}

// ===========================================================================
// Follow-Up Queue Tab
// ===========================================================================

function FollowUpQueueTab() {
  const [contacts, setContacts] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts?limit=100&sortBy=nextFollowUpAt&sortDir=asc");
      if (res.ok) {
        const data = await res.json();
        // Filter to only contacts with follow-ups
        const withFollowUp = (data.contacts || []).filter(
          (c: FollowUp) => c.nextFollowUpAt,
        );
        setContacts(withFollowUp);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleComplete = async (contactId: string) => {
    try {
      await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextFollowUpAt: null }),
      });
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success("Follow-up completed");
    } catch {
      toast.error("Failed to update follow-up");
    }
  };

  const handleReschedule = async (contactId: string, days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    try {
      await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextFollowUpAt: date.toISOString() }),
      });
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId ? { ...c, nextFollowUpAt: date.toISOString() } : c,
        ),
      );
      toast.success(`Rescheduled +${days} days`);
    } catch {
      toast.error("Failed to reschedule");
    }
  };

  const now = new Date();

  const overdue = contacts.filter(
    (c) => c.nextFollowUpAt && new Date(c.nextFollowUpAt) < now,
  );
  const upcoming = contacts.filter(
    (c) => c.nextFollowUpAt && new Date(c.nextFollowUpAt) >= now,
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold mb-1">No follow-ups scheduled</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Schedule follow-ups from the CRM contact sidebar to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-red-600 border-red-200 dark:text-red-400 dark:border-red-800">
          {overdue.length} overdue
        </Badge>
        <Badge variant="outline">
          {upcoming.length} upcoming
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchFollowUps}
          disabled={loading}
          className="ml-auto h-8"
          aria-label="Refresh follow-up queue"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
      </div>

      {/* Overdue section */}
      {overdue.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Overdue ({overdue.length})
          </h3>
          <div className="space-y-2">
            {overdue.map((contact) => (
              <FollowUpRow
                key={contact.id}
                contact={contact}
                isOverdue
                onComplete={handleComplete}
                onReschedule={handleReschedule}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming section */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Upcoming ({upcoming.length})
          </h3>
          <div className="space-y-2">
            {upcoming.map((contact) => (
              <FollowUpRow
                key={contact.id}
                contact={contact}
                isOverdue={false}
                onComplete={handleComplete}
                onReschedule={handleReschedule}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FollowUpRow({
  contact,
  isOverdue,
  onComplete,
  onReschedule,
}: {
  contact: FollowUp;
  isOverdue: boolean;
  onComplete: (id: string) => void;
  onReschedule: (id: string, days: number) => void;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
  const followUpDate = contact.nextFollowUpAt ? new Date(contact.nextFollowUpAt) : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:shadow-sm ${
        isOverdue
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          : "bg-background border-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
            {contact.status}
          </Badge>
          {contact.engagementScore >= 15 && (
            <Badge className="text-[10px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
              Hot
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {contact.company ? `${contact.company} · ` : ""}
          {followUpDate
            ? `Due ${followUpDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onReschedule(contact.id, 1)}
          title="Reschedule +1 day"
        >
          +1d
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onReschedule(contact.id, 3)}
          title="Reschedule +3 days"
        >
          +3d
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400"
          onClick={() => onComplete(contact.id)}
          title="Mark done"
          aria-label={`Mark follow-up done for ${name}`}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Sequences Tab
// ===========================================================================

function SequencesTab({ aiEnabled }: { aiEnabled: boolean }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Automated email sequences with conditional steps
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchSequences}
            disabled={loading}
            className="h-8"
            aria-label="Refresh sequences"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-[#0066FF] hover:bg-[#0052CC] text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            New Sequence
          </Button>
        </div>
      </div>

      {!aiEnabled && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">AI CRM add-on required</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Enable AI-powered sequences and smart email drafting.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-amber-300 dark:border-amber-700"
              onClick={() => window.location.assign("/admin/settings?tab=organization")}
            >
              Enable AI
            </Button>
          </CardContent>
        </Card>
      )}

      {sequences.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ListOrdered className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold mb-1">No sequences yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              Create automated email sequences to nurture leads through your fundraising pipeline.
            </p>
            <Button
              size="sm"
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Create First Sequence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <SequenceCard key={seq.id} sequence={seq} onRefresh={fetchSequences} />
          ))}
        </div>
      )}

      {/* Create sequence modal */}
      {showCreate && (
        <CreateSequenceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchSequences();
          }}
        />
      )}
    </div>
  );
}

function SequenceCard({ sequence, onRefresh }: { sequence: Sequence; onRefresh: () => void }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch(`/api/outreach/sequences/${sequence.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !sequence.isActive }),
      });
      if (res.ok) {
        toast.success(sequence.isActive ? "Sequence paused" : "Sequence activated");
        onRefresh();
      } else {
        toast.error("Failed to update sequence");
      }
    } catch {
      toast.error("Failed to update sequence");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete sequence "${sequence.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/outreach/sequences/${sequence.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Sequence deleted");
        onRefresh();
      } else {
        toast.error("Failed to delete sequence");
      }
    } catch {
      toast.error("Failed to delete sequence");
    }
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold truncate">{sequence.name}</h4>
              <Badge
                variant={sequence.isActive ? "default" : "secondary"}
                className={`text-[10px] h-4 px-1.5 ${
                  sequence.isActive
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                    : ""
                }`}
              >
                {sequence.isActive ? "Active" : "Paused"}
              </Badge>
            </div>
            {sequence.description && (
              <p className="text-xs text-muted-foreground mb-2 truncate">{sequence.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {sequence.steps.length} step{sequence.steps.length !== 1 ? "s" : ""}
              </span>
              <span className="font-mono tabular-nums">
                {sequence.stats.active} active
              </span>
              <span className="font-mono tabular-nums">
                {sequence.stats.completed} completed
              </span>
              <span className="font-mono tabular-nums">
                {sequence.stats.totalEnrolled} total enrolled
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleToggle}
              disabled={toggling}
              title={sequence.isActive ? "Pause" : "Activate"}
              aria-label={sequence.isActive ? `Pause ${sequence.name}` : `Activate ${sequence.name}`}
            >
              {sequence.isActive ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive"
              onClick={handleDelete}
              title="Delete"
              aria-label={`Delete ${sequence.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {/* Steps preview */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {sequence.steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px]">
                <span className="font-mono font-bold">{i + 1}</span>
                <span className="text-muted-foreground">
                  {step.delayDays}d · {CONDITION_LABELS[step.condition] || step.condition}
                </span>
                {step.aiPrompt && <Sparkles className="h-2.5 w-2.5 text-amber-500" aria-hidden="true" />}
              </div>
              {i < sequence.steps.length - 1 && (
                <div className="w-3 h-px bg-border" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateSequenceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState([
    { delayDays: 0, condition: "ALWAYS", aiPrompt: "Write a friendly introduction email for a potential investor" },
    { delayDays: 3, condition: "IF_NO_REPLY", aiPrompt: "Write a follow-up email to an investor who hasn't responded" },
  ]);
  const [saving, setSaving] = useState(false);

  const handleAddStep = () => {
    if (steps.length >= 10) return;
    setSteps([...steps, { delayDays: 3, condition: "IF_NO_REPLY", aiPrompt: "" }]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: string, value: string | number) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Sequence name is required");
      return;
    }
    if (steps.length === 0) {
      toast.error("At least one step is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/outreach/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          steps: steps.map((s) => ({
            delayDays: s.delayDays,
            condition: s.condition,
            aiPrompt: s.aiPrompt || null,
          })),
        }),
      });
      if (res.ok) {
        toast.success("Sequence created");
        onCreated();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create sequence");
      }
    } catch {
      toast.error("Failed to create sequence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 bg-background rounded-lg border border-border shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold">Create Sequence</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., New Lead Nurture"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="h-8 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Steps</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleAddStep}
                disabled={steps.length >= 10}
              >
                <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
                Add Step
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Step {i + 1}</span>
                    {steps.length > 1 && (
                      <button
                        onClick={() => handleRemoveStep(i)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Delay (days)</label>
                      <Input
                        type="number"
                        min={0}
                        max={90}
                        value={step.delayDays}
                        onChange={(e) => handleStepChange(i, "delayDays", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Condition</label>
                      <select
                        value={step.condition}
                        onChange={(e) => handleStepChange(i, "condition", e.target.value)}
                        className="w-full h-7 text-xs rounded-md border border-border bg-background px-2"
                      >
                        <option value="ALWAYS">Always send</option>
                        <option value="IF_NO_REPLY">If no reply</option>
                        <option value="IF_NOT_OPENED">If not opened</option>
                        <option value="IF_NOT_CLICKED">If not clicked</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">AI Prompt</label>
                    <Input
                      value={step.aiPrompt}
                      onChange={(e) => handleStepChange(i, "aiPrompt", e.target.value)}
                      placeholder="Describe what this email should say..."
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-[#0066FF] hover:bg-[#0052CC] text-white"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? "Creating..." : "Create Sequence"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Templates Tab
// ===========================================================================

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLimit, setTemplateLimit] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        setTemplateLimit(data.limits?.templateLimit ?? null);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/outreach/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Template deleted");
        fetchTemplates();
      } else {
        toast.error("Failed to delete template");
      }
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const customCount = templates.filter((t) => !t.isSystem).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templateLimit !== null
            ? `${customCount}/${templateLimit} custom templates used`
            : `${customCount} custom templates`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTemplates}
            disabled={loading}
            className="h-8"
            aria-label="Refresh templates"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-[#0066FF] hover:bg-[#0052CC] text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            New Template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold mb-1">No templates yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              Create reusable email templates for investor outreach.
            </p>
            <Button
              size="sm"
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="text-sm font-semibold truncate">{template.name}</h4>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {CATEGORY_LABELS[template.category] || template.category}
                      </Badge>
                      {template.isSystem && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          System
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Subject: {template.subject}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">
                      {template.body.slice(0, 120)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditTemplate(template)}
                      title="Preview"
                      aria-label={`Preview ${template.name}`}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    {!template.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => handleDelete(template.id)}
                        title="Delete"
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {(showCreate || editTemplate) && (
        <TemplateModal
          template={editTemplate}
          onClose={() => {
            setShowCreate(false);
            setEditTemplate(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditTemplate(null);
            fetchTemplates();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [category, setCategory] = useState(template?.category || "CUSTOM");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error("Name, subject, and body are required");
      return;
    }

    setSaving(true);
    try {
      const url = isEdit ? `/api/outreach/templates/${template.id}` : "/api/outreach/templates";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          body: body.trim(),
          category,
        }),
      });
      if (res.ok) {
        toast.success(isEdit ? "Template updated" : "Template created");
        onSaved();
      } else {
        const data = await res.json();
        if (data.error === "TEMPLATE_LIMIT_REACHED") {
          toast.error(`Template limit reached (${data.meta?.limit}). Upgrade for more.`);
        } else {
          toast.error(data.error || "Failed to save template");
        }
      }
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 bg-background rounded-lg border border-border shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? "Edit Template" : "Create Template"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Welcome Investor"
              className="h-8 text-sm"
              disabled={template?.isSystem}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-8 text-sm rounded-md border border-border bg-background px-2"
              disabled={template?.isSystem}
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="h-8 text-sm"
              disabled={template?.isSystem}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email template..."
              className="w-full min-h-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y"
              disabled={template?.isSystem}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Use {"{{investor_name}}"}, {"{{fund_name}}"}, {"{{gp_name}}"} as merge fields.
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            {template?.isSystem ? "Close" : "Cancel"}
          </Button>
          {!template?.isSystem && (
            <Button
              size="sm"
              className="h-8 text-xs bg-[#0066FF] hover:bg-[#0052CC] text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Bulk Send Tab
// ===========================================================================

function BulkSendTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [contactFilter, setContactFilter] = useState<string>("all");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);

  useEffect(() => {
    fetch("/api/outreach/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.templates) setTemplates(data.templates);
      })
      .catch(() => {});
  }, []);

  // Estimate recipient count
  useEffect(() => {
    const params = new URLSearchParams({ limit: "1" });
    if (contactFilter !== "all") params.set("status", contactFilter);
    fetch(`/api/contacts?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.total !== undefined) setRecipientCount(data.total);
      })
      .catch(() => {});
  }, [contactFilter]);

  const handleSend = async () => {
    if (!selectedTemplate) {
      toast.error("Select a template first");
      return;
    }
    if (recipientCount === 0) {
      toast.error("No contacts match this filter");
      return;
    }
    if (!confirm(`Send to ${recipientCount} contacts?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/outreach/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          filter: contactFilter !== "all" ? { status: contactFilter } : {},
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Sent to ${data.sent || recipientCount} contacts`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send bulk emails");
    } finally {
      setSending(false);
    }
  };

  const selectedTpl = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Send a template email to multiple contacts at once
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Configuration */}
        <Card>
          <CardContent className="py-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-border bg-background px-2"
              >
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({CATEGORY_LABELS[t.category] || t.category})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Audience</label>
              <select
                value={contactFilter}
                onChange={(e) => setContactFilter(e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-border bg-background px-2"
                aria-label="Filter contacts by status"
              >
                <option value="all">All contacts</option>
                <option value="LEAD">Leads</option>
                <option value="CONTACTED">Contacted</option>
                <option value="INTERESTED">Interested</option>
                <option value="CONVERTED">Converted</option>
              </select>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-lg font-bold font-mono tabular-nums">{recipientCount}</p>
              <p className="text-xs text-muted-foreground">recipients</p>
            </div>

            <Button
              className="w-full h-8 text-sm bg-[#0066FF] hover:bg-[#0052CC] text-white"
              disabled={sending || !selectedTemplate || recipientCount === 0}
              onClick={handleSend}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              {sending ? "Sending..." : `Send to ${recipientCount} contacts`}
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardContent className="py-4">
            {selectedTpl ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</h4>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Subject:</span> {selectedTpl.subject}
                  </p>
                  <hr className="border-border" />
                  <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {selectedTpl.body}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Merge fields ({"{{investor_name}}"}, etc.) will be replaced per recipient.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground">
                <div className="text-center">
                  <Mail className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
                  <p className="text-xs">Select a template to preview</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
