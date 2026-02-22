"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow, format, isPast, isToday } from "date-fns";
import { reportError } from "@/lib/error";
import {
  X,
  Mail,
  CalendarClock,
  StickyNote,
  Tag,
  Eye,
  Pencil,
  Shield,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  Clock,
  Phone,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Send,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeatureGate } from "./FeatureGate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string;
  engagementScore: number;
  lastEngagedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  tags: string[] | null;
  notes: string | null;
  assignedTo?: { id: string; name: string | null; email: string; image: string | null } | null;
  contactNotes?: Array<{
    id: string;
    content: string;
    isPinned: boolean;
    createdAt: string;
    author: { id: string; name: string | null; email: string };
  }>;
  contactActivities?: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
    actor: { id: string; name: string | null; email: string } | null;
  }>;
  investor?: {
    id: string;
    onboardingStep: number | null;
    accreditationStatus: string | null;
    entityType: string | null;
    ndaSigned: boolean | null;
    investments?: Array<{
      id: string;
      amount: number | null;
      fundedAmount: number | null;
      status: string;
      commitmentDate: string | null;
      fund: { id: string; name: string };
    }>;
  } | null;
}

type CrmRole = "VIEWER" | "CONTRIBUTOR" | "MANAGER";

interface ContactSidebarProps {
  contactId: string | null;
  tier: string;
  aiCrmEnabled: boolean;
  pipelineStages: string[];
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onOpenCompose: (contactId: string) => void;
  crmRole?: CrmRole;
}

// ---------------------------------------------------------------------------
// AI Insight Card
// ---------------------------------------------------------------------------

interface AIInsightCardProps {
  contactId: string;
  contactName: string;
  onDraftEmail: () => void;
}

function AIInsightCard({ contactId, contactName, onDraftEmail }: AIInsightCardProps) {
  const [insight, setInsight] = useState<{
    type: string;
    title: string;
    description: string;
    priority: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchInsight() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/ai/insights?contactId=${contactId}`);
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          // Pick the first insight that mentions this contact, or the top one
          const insights = data.insights ?? [];
          const match =
            insights.find((i: { contactIds?: string[] }) =>
              i.contactIds?.includes(contactId),
            ) || insights[0];
          setInsight(match ?? null);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInsight();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) {
    return (
      <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 animate-pulse text-purple-500" aria-hidden="true" />
          <span className="text-xs text-purple-600 dark:text-purple-400">Analyzing {contactName}...</span>
        </div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">AI insights unavailable</span>
        </div>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    opportunity: "text-emerald-600 dark:text-emerald-400",
    risk: "text-red-600 dark:text-red-400",
    action: "text-blue-600 dark:text-blue-400",
    trend: "text-amber-600 dark:text-amber-400",
  };

  const typeBadgeColors: Record<string, string> = {
    opportunity: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    risk: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    action: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    trend: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">AI Insight</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeColors[insight.type] || typeBadgeColors.action}`}>
          {insight.type}
        </span>
      </div>
      <p className={`text-sm font-medium ${typeColors[insight.type] || "text-foreground"}`}>
        {insight.title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-7 px-2 text-xs text-purple-600 hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-900/30"
        onClick={onDraftEmail}
      >
        <Send className="mr-1 h-3 w-3" aria-hidden="true" /> Draft Email
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity type icons
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  EMAIL_SENT: Send,
  EMAIL_OPENED: Mail,
  DOCUMENT_VIEWED: Eye,
  DOCUMENT_SIGNED: CheckCircle2,
  NOTE_ADDED: StickyNote,
  STATUS_CHANGE: ArrowRight,
  COMMITMENT_MADE: DollarSign,
  WIRE_RECEIVED: DollarSign,
  CREATED: UserCheck,
  PROFILE_UPDATED: Pencil,
  ASSIGNED: UserCheck,
};

const STATUS_LABELS: Record<string, string> = {
  // FREE / CRM_PRO stages
  LEAD: "Lead", CONTACTED: "Contacted", INTERESTED: "Interested", CONVERTED: "Converted",
  // FUNDROOM stages
  NDA_SIGNED: "NDA Signed", ACCREDITED: "Accredited",
  COMMITTED: "Committed", FUNDED: "Funded",
  // Legacy / generic
  PROSPECT: "Prospect", OPPORTUNITY: "Opportunity",
  CUSTOMER: "Customer", WON: "Won", LOST: "Lost", ARCHIVED: "Archived",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactSidebar({
  contactId,
  tier,
  aiCrmEnabled,
  pipelineStages,
  onClose,
  onStatusChange,
  onOpenCompose,
  crmRole = "VIEWER",
}: ContactSidebarProps) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const followUpRef = useRef<HTMLInputElement>(null);

  const isFundroom = tier === "FUNDROOM";
  const canContribute = crmRole === "CONTRIBUTOR" || crmRole === "MANAGER";

  // Fetch contact details
  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`);
      if (res.ok) {
        const data = await res.json();
        setContact(data);
      }
    } catch (error) {
      reportError(error as Error);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchContact();
    setEditMode(false);
    setShowAllActivities(false);
  }, [fetchContact]);

  // Save note
  const handleSaveNote = async () => {
    if (!contact || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`/api/contacts/${contact.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteText }),
      });
      setNoteText("");
      fetchContact();
    } catch (error) {
      reportError(error as Error);
    } finally {
      setSavingNote(false);
    }
  };

  // Add tag
  const handleAddTag = async () => {
    if (!contact || !tagInput.trim()) return;
    const existingTags: string[] = (contact.tags as string[]) || [];
    const newTag = tagInput.trim().toLowerCase();
    if (existingTags.includes(newTag)) {
      setTagInput("");
      return;
    }
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [...existingTags, newTag] }),
      });
      setTagInput("");
      fetchContact();
    } catch (error) {
      reportError(error as Error);
    }
  };

  // Remove tag
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!contact || !canContribute) return;
    const existingTags: string[] = (contact.tags as string[]) || [];
    const updatedTags = existingTags.filter((t) => t !== tagToRemove);
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      fetchContact();
    } catch (error) {
      reportError(error as Error);
    }
  };

  // Set follow-up date
  const handleSetFollowUp = async (dateStr: string | null) => {
    if (!contact || !canContribute) return;
    try {
      await fetch(`/api/contacts/${contact.id}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextFollowUpAt: dateStr }),
      });
      setShowFollowUpPicker(false);
      setFollowUpDate("");
      fetchContact();
    } catch (error) {
      reportError(error as Error);
    }
  };

  if (!contactId) return null;

  // Engagement label
  const engLabel = contact
    ? contact.engagementScore >= 15
      ? "Hot"
      : contact.engagementScore >= 5
        ? "Warm"
        : contact.engagementScore >= 1
          ? "Cool"
          : "None"
    : "";

  const engColor = contact
    ? contact.engagementScore >= 15
      ? "text-red-500"
      : contact.engagementScore >= 5
        ? "text-amber-500"
        : contact.engagementScore >= 1
          ? "text-blue-500"
          : "text-gray-400"
    : "";

  const activities = contact?.contactActivities || [];
  const displayActivities = showAllActivities ? activities : activities.slice(0, 20);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-background shadow-xl md:relative md:w-[480px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Contact Details</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0" aria-label="Close sidebar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : contact ? (
          <div className="space-y-6 p-4">
            {/* 1. Contact Header */}
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                  </h4>
                  {contact.company && (
                    <p className="text-sm text-muted-foreground">{contact.company}</p>
                  )}
                  {contact.title && (
                    <p className="text-xs text-muted-foreground">{contact.title}</p>
                  )}
                </div>
                {canContribute && (
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(!editMode)} aria-label="Edit contact">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={`mailto:${contact.email}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  {contact.email}
                </a>
                {contact.phone && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" aria-hidden="true" /> {contact.phone}
                  </span>
                )}
              </div>

              {/* Status dropdown */}
              <div className="mt-3">
                <Select
                  value={contact.status}
                  onValueChange={(val) => onStatusChange(contact.id, val)}
                  disabled={!canContribute}
                >
                  <SelectTrigger className="w-[200px]" aria-label="Contact status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineStages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 2. Engagement & Source */}
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${engColor}`}>
                    {engLabel}
                  </span>
                  <span className="font-mono text-sm tabular-nums">({contact.engagementScore})</span>
                </div>
                <Badge variant="outline" className="text-xs">{contact.source}</Badge>
              </div>
              <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                <span>First seen: {format(new Date(contact.createdAt), "MMM d, yyyy")}</span>
                {contact.lastEngagedAt && (
                  <span>Last active: {formatDistanceToNow(new Date(contact.lastEngagedAt), { addSuffix: true })}</span>
                )}
              </div>
            </div>

            {/* 3. Follow-Up Banner */}
            {contact.nextFollowUpAt && (
              <div className={`flex items-center justify-between rounded-md border p-2.5 text-sm ${
                isPast(new Date(contact.nextFollowUpAt)) && !isToday(new Date(contact.nextFollowUpAt))
                  ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                  : isToday(new Date(contact.nextFollowUpAt))
                    ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                    : "border-border bg-muted/30"
              }`}>
                <div className="flex items-center gap-2">
                  <CalendarClock className={`h-4 w-4 ${
                    isPast(new Date(contact.nextFollowUpAt)) && !isToday(new Date(contact.nextFollowUpAt))
                      ? "text-red-600 dark:text-red-400"
                      : isToday(new Date(contact.nextFollowUpAt))
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                  }`} aria-hidden="true" />
                  <span>
                    Follow-up: {isToday(new Date(contact.nextFollowUpAt))
                      ? "Today"
                      : format(new Date(contact.nextFollowUpAt), "MMM d, yyyy")}
                    {isPast(new Date(contact.nextFollowUpAt)) && !isToday(new Date(contact.nextFollowUpAt)) && (
                      <span className="ml-1 font-medium text-red-600 dark:text-red-400">(Overdue)</span>
                    )}
                  </span>
                </div>
                {canContribute && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleSetFollowUp(null)}
                    aria-label="Clear follow-up"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}

            {/* 4. Quick Actions */}
            {canContribute && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenCompose(contact.id)}>
                    <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Send Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowFollowUpPicker(!showFollowUpPicker);
                      setTimeout(() => followUpRef.current?.focus(), 50);
                    }}
                  >
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Set Follow-Up
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("note-input")?.focus()}>
                    <StickyNote className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add Note
                  </Button>
                </div>

                {/* Follow-up date picker */}
                {showFollowUpPicker && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-2">
                    <input
                      ref={followUpRef}
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="h-8 rounded border border-border bg-background px-2 text-sm"
                      aria-label="Follow-up date"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!followUpDate}
                      onClick={() => handleSetFollowUp(new Date(followUpDate + "T12:00:00").toISOString())}
                    >
                      Set
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => { setShowFollowUpPicker(false); setFollowUpDate(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 5. AI Insight Card */}
            <FeatureGate feature="ai_features">
              <AIInsightCard
                contactId={contact.id}
                contactName={[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                onDraftEmail={() => onOpenCompose(contact.id)}
              />
            </FeatureGate>

            {/* 6. Activity Timeline */}
            <div>
              <h5 className="mb-2 text-sm font-medium">Activity Timeline</h5>
              <div className="space-y-3">
                {displayActivities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.type] || Clock;
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                          {activity.actor?.name && ` · ${activity.actor.name}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {activities.length === 0 && (
                  <p className="text-xs text-muted-foreground">No activity yet</p>
                )}
                {activities.length > 20 && !showAllActivities && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllActivities(true)}
                  >
                    <ChevronDown className="mr-1 h-3 w-3" /> Load more ({activities.length - 20} more)
                  </Button>
                )}
                {showAllActivities && activities.length > 20 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllActivities(false)}
                  >
                    <ChevronUp className="mr-1 h-3 w-3" /> Show less
                  </Button>
                )}
              </div>
            </div>

            {/* 7. Notes */}
            <div>
              <h5 className="mb-2 text-sm font-medium">Notes</h5>
              {canContribute && (
                <div className="space-y-2">
                  <Textarea
                    id="note-input"
                    placeholder="Add a note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveNote}
                    disabled={!noteText.trim() || savingNote}
                  >
                    {savingNote ? "Saving..." : "Save Note"}
                  </Button>
                </div>
              )}
              {contact.contactNotes && contact.contactNotes.length > 0 && (
                <div className="mt-3 space-y-2">
                  {contact.contactNotes.map((note) => (
                    <div key={note.id} className="rounded-md border border-border p-2.5">
                      <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.author.name || note.author.email} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        {note.isPinned && " · 📌 Pinned"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 8. Tags */}
            <div>
              <h5 className="mb-2 text-sm font-medium">Tags</h5>
              <div className="flex flex-wrap gap-1.5">
                {((contact.tags as string[]) || []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs inline-flex items-center gap-1">
                    {tag}
                    {canContribute && (
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {canContribute && (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Add tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    className="h-8 text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={handleAddTag} disabled={!tagInput.trim()}>
                    <Tag className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* 9. Investor Details (FUNDROOM+) */}
            {isFundroom && contact.investor && (
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h5 className="text-sm font-medium">Investor Details</h5>
                </div>

                {/* Onboarding checklist */}
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: "Account Created", done: true },
                    { label: "NDA Signed", done: contact.investor.ndaSigned },
                    { label: "Accredited", done: contact.investor.accreditationStatus && contact.investor.accreditationStatus !== "PENDING" },
                    { label: "Details Complete", done: (contact.investor.onboardingStep ?? 0) >= 4 },
                    { label: "Committed", done: (contact.investor.investments?.length ?? 0) > 0 },
                    { label: "Funded", done: contact.investor.investments?.some((i) => i.status === "FUNDED") },
                  ].map(({ label, done }) => (
                    <div key={label} className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-gray-300 dark:border-gray-600" />
                      )}
                      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Investments */}
                {contact.investor.investments && contact.investor.investments.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {contact.investor.investments.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{inv.fund.name}</span>
                        <span className="font-mono tabular-nums">
                          ${Number(inv.amount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Contact not found</p>
          </div>
        )}
      </div>
    </div>
  );
}
