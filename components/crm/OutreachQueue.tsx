"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Clock,
  Flame,
  ThermometerSun,
  Mail,
  CalendarClock,
  ChevronRight,
  RefreshCw,
  Check,
  Calendar,
  Send,
  Sparkles,
  CheckCheck,
  CalendarPlus,
  X,
  MessageSquare,
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
import { useTier } from "@/lib/hooks/use-tier";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutreachContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  status: string;
  engagementScore: number;
  lastEngagedAt: string | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
}

type Priority = "overdue" | "today" | "hot" | "warm";

interface PriorityItem {
  contact: OutreachContact;
  priority: Priority;
  reason: string;
}

type CrmRole = "VIEWER" | "CONTRIBUTOR" | "MANAGER";

interface OutreachQueueProps {
  onContactClick: (contactId: string) => void;
  onComposeEmail: (contact: OutreachContact) => void;
  crmRole?: CrmRole;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string; icon: React.ElementType; bgClass: string }
> = {
  overdue: {
    label: "Overdue",
    color: "text-red-600 dark:text-red-400",
    icon: AlertTriangle,
    bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  },
  today: {
    label: "Today",
    color: "text-amber-600 dark:text-amber-400",
    icon: Clock,
    bgClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  },
  hot: {
    label: "Hot Lead",
    color: "text-red-500 dark:text-red-400",
    icon: Flame,
    bgClass: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
  },
  warm: {
    label: "Warm Lead",
    color: "text-blue-500 dark:text-blue-400",
    icon: ThermometerSun,
    bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  },
};

function classifyContacts(contacts: OutreachContact[]): PriorityItem[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const items: PriorityItem[] = [];

  for (const contact of contacts) {
    // 1. Overdue follow-ups
    if (contact.nextFollowUpAt) {
      const followUp = new Date(contact.nextFollowUpAt);
      if (followUp < today) {
        items.push({
          contact,
          priority: "overdue",
          reason: `Follow-up was ${formatDistanceToNow(followUp, { addSuffix: true })}`,
        });
        continue;
      }
      // 2. Today's follow-ups
      if (followUp >= today && followUp < tomorrow) {
        items.push({
          contact,
          priority: "today",
          reason: "Follow-up scheduled for today",
        });
        continue;
      }
    }

    const lastContacted = contact.lastContactedAt
      ? new Date(contact.lastContactedAt)
      : null;
    const noRecentContact = !lastContacted || lastContacted < sevenDaysAgo;

    // 3. Hot leads with no recent contact
    if (contact.engagementScore >= 15 && noRecentContact) {
      items.push({
        contact,
        priority: "hot",
        reason: `Score ${contact.engagementScore} — no contact in 7+ days`,
      });
      continue;
    }

    // 4. Warm leads with no recent contact
    if (contact.engagementScore >= 5 && noRecentContact) {
      items.push({
        contact,
        priority: "warm",
        reason: `Score ${contact.engagementScore} — no contact in 7+ days`,
      });
    }
  }

  // Sort: overdue first, then today, hot, warm
  const priorityOrder: Record<Priority, number> = {
    overdue: 0,
    today: 1,
    hot: 2,
    warm: 3,
  };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return items;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OutreachQueue({ onContactClick, onComposeEmail, crmRole = "VIEWER" }: OutreachQueueProps) {
  const { limits } = useTier();
  const hasEmailTracking = limits?.hasEmailTracking ?? false;

  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Priority | "all">("all");
  const canContribute = crmRole === "CONTRIBUTOR" || crmRole === "MANAGER";

  // Right-panel compose state
  const [activeContact, setActiveContact] = useState<OutreachContact | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [emailPurpose, setEmailPurpose] = useState<string>("follow_up");

  // Bulk actions
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts?limit=200&sortBy=engagementScore&sortDir=desc");
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {
      // Non-critical — queue will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleMarkDone = async (contactId: string) => {
    if (!canContribute) return;
    try {
      await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextFollowUpAt: null }),
      });
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, nextFollowUpAt: null } : c)),
      );
    } catch {
      // Non-critical
    }
  };

  const handleReschedule = async (contactId: string, days: number) => {
    if (!canContribute) return;
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
    } catch {
      // Non-critical
    }
  };

  // Select a contact for compose
  const handleSelectForCompose = useCallback((contact: OutreachContact) => {
    setActiveContact(contact);
    setSubject("");
    setBody("");
    setComposeError(null);
    setComposeSuccess(false);
    setEmailPurpose("follow_up");
  }, []);

  // Send email from inline compose
  const handleSend = async () => {
    if (!activeContact || !subject.trim() || !body.trim()) {
      setComposeError("Subject and body are required");
      return;
    }
    setSending(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: activeContact.id,
          subject: subject.trim(),
          body: body.trim(),
          trackOpens: hasEmailTracking,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setComposeError(data.error || "Failed to send email");
        return;
      }
      setComposeSuccess(true);
      setTimeout(() => {
        setActiveContact(null);
        setComposeSuccess(false);
        fetchContacts();
      }, 1500);
    } catch {
      setComposeError("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  // AI Draft
  const handleAiDraft = async () => {
    if (!activeContact) return;
    setAiDrafting(true);
    setComposeError(null);
    try {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeContact.id, purpose: emailPurpose }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubject(data.subject || subject);
        setBody(data.body || body);
      } else {
        setComposeError("AI draft not available");
      }
    } catch {
      setComposeError("AI draft failed");
    } finally {
      setAiDrafting(false);
    }
  };

  // Bulk actions
  const handleBulkMarkDone = async () => {
    if (!canContribute) return;
    setBulkProcessing(true);
    const overdueItems = items.filter((i) => i.priority === "overdue");
    for (const item of overdueItems) {
      await handleMarkDone(item.contact.id);
    }
    setBulkProcessing(false);
  };

  const handleBulkReschedule = async (days: number) => {
    if (!canContribute) return;
    setBulkProcessing(true);
    const overdueItems = items.filter((i) => i.priority === "overdue");
    for (const item of overdueItems) {
      await handleReschedule(item.contact.id, days);
    }
    setBulkProcessing(false);
  };

  const items = useMemo(() => classifyContacts(contacts), [contacts]);

  const filteredItems = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.priority === filter)),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, hot: 0, warm: 0 };
    for (const item of items) {
      c[item.priority]++;
    }
    return c;
  }, [items]);

  const activeContactName = activeContact
    ? [activeContact.firstName, activeContact.lastName].filter(Boolean).join(" ") || activeContact.email
    : "";

  return (
    <FeatureGate feature="outreach_queue">
      <div className="flex flex-col gap-4">
        {/* Filter strip */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All"
            count={items.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Overdue"
            count={counts.overdue}
            active={filter === "overdue"}
            onClick={() => setFilter("overdue")}
            colorClass="text-red-600 dark:text-red-400"
          />
          <FilterChip
            label="Today"
            count={counts.today}
            active={filter === "today"}
            onClick={() => setFilter("today")}
            colorClass="text-amber-600 dark:text-amber-400"
          />
          <FilterChip
            label="Hot"
            count={counts.hot}
            active={filter === "hot"}
            onClick={() => setFilter("hot")}
            colorClass="text-red-500 dark:text-red-400"
          />
          <FilterChip
            label="Warm"
            count={counts.warm}
            active={filter === "warm"}
            onClick={() => setFilter("warm")}
            colorClass="text-blue-500 dark:text-blue-400"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchContacts()}
            disabled={loading}
            className="ml-auto h-8"
            aria-label="Refresh outreach queue"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>

        {/* Split-pane layout: left = contacts, right = compose */}
        <div className="flex flex-col lg:flex-row gap-4 min-h-[400px]">
          {/* LEFT PANEL — Contact queue */}
          <div className="flex-1 min-w-0 lg:max-w-[55%]">
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-3 py-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Priority Queue
                  <span className="ml-1 font-mono">({filteredItems.length})</span>
                </h3>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {loading ? (
                  <div className="space-y-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse bg-muted border-b border-border" />
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      {filter === "all"
                        ? "No contacts need attention right now."
                        : `No ${filter} items.`}
                    </p>
                  </div>
                ) : (
                  <div>
                    {filteredItems.map((item) => {
                      const cfg = PRIORITY_CONFIG[item.priority];
                      const Icon = cfg.icon;
                      const name = [item.contact.firstName, item.contact.lastName]
                        .filter(Boolean)
                        .join(" ") || item.contact.email;
                      const isActive = activeContact?.id === item.contact.id;

                      return (
                        <div
                          key={item.contact.id}
                          className={`flex items-center gap-3 border-b border-border p-3 transition-colors cursor-pointer ${
                            isActive
                              ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500"
                              : "hover:bg-muted/30"
                          }`}
                          onClick={() => {
                            if (canContribute) {
                              handleSelectForCompose(item.contact);
                            }
                            onContactClick(item.contact.id);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              if (canContribute) handleSelectForCompose(item.contact);
                              onContactClick(item.contact.id);
                            }
                          }}
                        >
                          {/* Priority icon */}
                          <div className="flex-shrink-0">
                            <Icon className={`h-5 w-5 ${cfg.color}`} aria-hidden="true" />
                          </div>

                          {/* Contact info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{name}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {item.contact.status}
                              </Badge>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {item.contact.engagementScore}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.reason}
                              {item.contact.company ? ` — ${item.contact.company}` : ""}
                            </p>
                          </div>

                          {/* Quick actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {canContribute && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectForCompose(item.contact);
                                  }}
                                  aria-label={`Compose email to ${name}`}
                                >
                                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReschedule(item.contact.id, 3);
                                  }}
                                  title="Reschedule +3 days"
                                  aria-label={`Reschedule follow-up for ${name}`}
                                >
                                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkDone(item.contact.id);
                                  }}
                                  title="Mark as done"
                                  aria-label={`Mark follow-up done for ${name}`}
                                >
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Compose area */}
          <div className="flex-1 min-w-0 lg:max-w-[45%]">
            <div className="rounded-lg border border-border bg-background h-full flex flex-col">
              {activeContact && canContribute ? (
                <>
                  {/* Compose header */}
                  <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium truncate">
                        <Mail className="inline h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                        Email to {activeContactName}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">{activeContact.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveContact(null)}
                      className="h-7 w-7 p-0 flex-shrink-0"
                      aria-label="Close compose"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Compose body */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Purpose selector */}
                    <div>
                      <label className="text-xs text-muted-foreground">Purpose</label>
                      <Select value={emailPurpose} onValueChange={setEmailPurpose}>
                        <SelectTrigger className="h-8 mt-0.5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="follow_up">Follow Up</SelectItem>
                          <SelectItem value="introduction">Introduction</SelectItem>
                          <SelectItem value="commitment_check">Commitment Check</SelectItem>
                          <SelectItem value="thank_you">Thank You</SelectItem>
                          <SelectItem value="update">Fund Update</SelectItem>
                          <SelectItem value="re_engagement">Re-engagement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Subject */}
                    <div>
                      <label htmlFor="outreach-subject" className="text-xs text-muted-foreground">Subject</label>
                      <Input
                        id="outreach-subject"
                        placeholder="Email subject..."
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="mt-0.5 text-sm"
                      />
                    </div>

                    {/* Body */}
                    <div>
                      <label htmlFor="outreach-body" className="text-xs text-muted-foreground">Message</label>
                      <Textarea
                        id="outreach-body"
                        placeholder="Write your message..."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={10}
                        className="mt-0.5 text-sm"
                      />
                    </div>

                    {/* Tracking note */}
                    <p className="text-xs text-muted-foreground">
                      {hasEmailTracking
                        ? "Open tracking enabled."
                        : "Upgrade to CRM Pro for open tracking."}
                    </p>

                    {/* Error/Success */}
                    {composeError && (
                      <p className="text-xs text-red-600 dark:text-red-400" role="alert">{composeError}</p>
                    )}
                    {composeSuccess && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400" role="alert">
                        Email sent successfully!
                      </p>
                    )}
                  </div>

                  {/* Compose actions */}
                  <div className="border-t border-border px-4 py-3 flex items-center gap-2">
                    <Button
                      onClick={handleSend}
                      disabled={sending || !subject.trim() || !body.trim()}
                      size="sm"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {sending ? "Sending..." : "Send"}
                    </Button>
                    <FeatureGate feature="ai_features">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAiDraft}
                        disabled={aiDrafting}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        {aiDrafting ? "Drafting..." : "AI Draft"}
                      </Button>
                    </FeatureGate>
                  </div>
                </>
              ) : (
                /* Empty state — no contact selected */
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center">
                    <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {canContribute
                        ? "Select a contact to compose"
                        : "View-only mode"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {canContribute
                        ? "Click a contact in the queue to start drafting an email"
                        : "You need Contributor or Manager role to send emails"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM BAR — Bulk actions */}
        {canContribute && counts.overdue > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Bulk Actions
              <span className="ml-1 font-mono text-red-600 dark:text-red-400">
                ({counts.overdue} overdue)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkMarkDone}
                disabled={bulkProcessing}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {bulkProcessing ? "Processing..." : "Mark All Done"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkReschedule(1)}
                disabled={bulkProcessing}
              >
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reschedule +1d
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkReschedule(3)}
                disabled={bulkProcessing}
              >
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reschedule +3d
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkReschedule(7)}
                disabled={bulkProcessing}
              >
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reschedule +7d
              </Button>
            </div>
          </div>
        )}
      </div>
    </FeatureGate>
  );
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  count,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  colorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      <span className={active ? undefined : colorClass}>{label}</span>
      <span className={`font-mono ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}
