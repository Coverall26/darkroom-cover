"use client";

import { useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContactRow } from "./ContactTable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactKanbanProps {
  contacts: ContactRow[];
  pipelineStages: string[];
  tier: string;
  aiCrmEnabled: boolean;
  onCardClick: (contact: ContactRow) => void;
  onStatusChange?: (contactId: string, newStatus: string) => void;
  crmRole?: "VIEWER" | "CONTRIBUTOR" | "MANAGER";
}

// ---------------------------------------------------------------------------
// Stage config
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  PROSPECT: "border-t-gray-400",
  LEAD: "border-t-sky-400",
  CONTACTED: "border-t-indigo-300",
  INTERESTED: "border-t-indigo-400",
  CONVERTED: "border-t-amber-400",
  OPPORTUNITY: "border-t-indigo-400",
  CUSTOMER: "border-t-amber-400",
  WON: "border-t-emerald-400",
  LOST: "border-t-red-400",
  ARCHIVED: "border-t-gray-300",
  NDA_SIGNED: "border-t-blue-400",
  ACCREDITED: "border-t-purple-400",
  COMMITTED: "border-t-amber-400",
  FUNDED: "border-t-emerald-400",
};

const STAGE_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  LEAD: "Lead",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  CONVERTED: "Converted",
  OPPORTUNITY: "Opportunity",
  CUSTOMER: "Customer",
  WON: "Won",
  LOST: "Lost",
  ARCHIVED: "Archived",
  NDA_SIGNED: "NDA Signed",
  ACCREDITED: "Accredited",
  COMMITTED: "Committed",
  FUNDED: "Funded",
};

// ---------------------------------------------------------------------------
// Engagement heat dot
// ---------------------------------------------------------------------------

function HeatDot({ score }: { score: number }) {
  const color =
    score >= 15 ? "bg-red-500" : score >= 5 ? "bg-amber-500" : score >= 1 ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={`Score: ${score}`} />;
}

// ---------------------------------------------------------------------------
// Kanban card (draggable)
// ---------------------------------------------------------------------------

function KanbanCard({
  contact,
  tier,
  aiCrmEnabled,
  onClick,
  draggable,
  onDragStart,
}: {
  contact: ContactRow;
  tier: string;
  aiCrmEnabled: boolean;
  onClick: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent, contactId: string) => void;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
  const commitment = contact.investor?.investments?.[0]?.amount;
  const isFundroom = tier === "FUNDROOM";

  return (
    <div
      className="cursor-pointer rounded-md border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md"
      onClick={onClick}
      draggable={draggable}
      onDragStart={(e) => {
        if (draggable) onDragStart(e, contact.id);
      }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 flex items-start gap-1.5">
          {draggable && (
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            {contact.company && (
              <p className="truncate text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>
        </div>
        <div className="ml-2 flex items-center gap-1">
          <HeatDot score={contact.engagementScore} />
          {aiCrmEnabled && contact.engagementScore >= 15 && (
            <Sparkles className="h-3 w-3 text-purple-500" aria-hidden="true" />
          )}
        </div>
      </div>

      {isFundroom && commitment && (
        <div className="mt-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            ${Number(commitment).toLocaleString()}
          </span>
        </div>
      )}

      {contact.lastEngagedAt && (
        <div className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(contact.lastEngagedAt), { addSuffix: true })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Kanban component
// ---------------------------------------------------------------------------

export function ContactKanban({
  contacts,
  pipelineStages,
  tier,
  aiCrmEnabled,
  onCardClick,
  onStatusChange,
  crmRole = "VIEWER",
}: ContactKanbanProps) {
  const canDrag = (crmRole === "CONTRIBUTOR" || crmRole === "MANAGER") && !!onStatusChange;
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [dragContactId, setDragContactId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, contactId: string) => {
    e.dataTransfer.setData("text/plain", contactId);
    e.dataTransfer.effectAllowed = "move";
    setDragContactId(contactId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    setDragContactId(null);

    const contactId = e.dataTransfer.getData("text/plain");
    if (!contactId || !onStatusChange) return;

    // Find current status to avoid no-op
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact || contact.status === targetStage) return;

    onStatusChange(contactId, targetStage);
  }, [contacts, onStatusChange]);

  // Group contacts by status
  const grouped = pipelineStages.reduce(
    (acc, stage) => {
      acc[stage] = contacts.filter((c) => c.status === stage);
      return acc;
    },
    {} as Record<string, ContactRow[]>,
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {pipelineStages.map((stage) => {
        const stageContacts = grouped[stage] || [];
        const totalCommitment = stageContacts.reduce((sum, c) => {
          const amount = c.investor?.investments?.[0]?.amount;
          return sum + (amount ? Number(amount) : 0);
        }, 0);
        const isDropTarget = dragOverStage === stage;

        return (
          <div
            key={stage}
            className={`flex min-w-[280px] flex-col rounded-lg border border-t-4 transition-colors ${
              STAGE_COLORS[stage] || "border-t-gray-400"
            } ${
              isDropTarget
                ? "border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/30"
                : "border-border bg-muted/30"
            }`}
            onDragOver={canDrag ? (e) => handleDragOver(e, stage) : undefined}
            onDragLeave={canDrag ? handleDragLeave : undefined}
            onDrop={canDrag ? (e) => handleDrop(e, stage) : undefined}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{STAGE_LABELS[stage] || stage}</span>
                <Badge variant="secondary" className="text-xs font-mono tabular-nums">
                  {stageContacts.length}
                </Badge>
              </div>
              {tier === "FUNDROOM" && totalCommitment > 0 && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  ${totalCommitment.toLocaleString()}
                </span>
              )}
            </div>

            {/* Cards */}
            <div className={`flex flex-1 flex-col gap-2 px-2 pb-2 ${
              isDropTarget ? "min-h-[80px]" : ""
            }`}>
              {stageContacts.length === 0 && !isDropTarget && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No contacts
                </div>
              )}
              {stageContacts.length === 0 && isDropTarget && (
                <div className="flex items-center justify-center rounded-md border-2 border-dashed border-blue-300 py-6 text-xs text-blue-500 dark:border-blue-600 dark:text-blue-400">
                  Drop here to move
                </div>
              )}
              {stageContacts.map((contact) => (
                <KanbanCard
                  key={contact.id}
                  contact={contact}
                  tier={tier}
                  aiCrmEnabled={aiCrmEnabled}
                  onClick={() => onCardClick(contact)}
                  draggable={canDrag && dragContactId !== contact.id}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
