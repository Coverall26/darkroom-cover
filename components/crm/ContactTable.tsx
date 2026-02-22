"use client";

import { formatDistanceToNow, format, isPast, isToday, isTomorrow } from "date-fns";
import { MoreHorizontal, Mail, Tag, Trash2, ArrowRightLeft, Sparkles, Eye, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string;
  engagementScore: number;
  lastEngagedAt: string | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  tags: string[] | null;
  investorId: string | null;
  investor?: {
    id: string;
    onboardingStep: number | null;
    accreditationStatus: string | null;
    entityType: string | null;
    investments?: Array<{
      id: string;
      amount: number | null;
      fundedAmount: number | null;
      status: string;
    }>;
  } | null;
  contactActivities?: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

type CrmRole = "VIEWER" | "CONTRIBUTOR" | "MANAGER";

interface ContactTableProps {
  contacts: ContactRow[];
  tier: string;
  aiCrmEnabled: boolean;
  pipelineStages: string[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (contact: ContactRow) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  crmRole?: CrmRole;
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  PROSPECT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  LEAD: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  OPPORTUNITY: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  CUSTOMER: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  WON: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  LOST: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  ARCHIVED: "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  // FUNDROOM compliance stages (mapped from ContactStatus)
  NDA_SIGNED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  ACCREDITED: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  COMMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  FUNDED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
};

const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  LEAD: "Lead",
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

const SOURCE_LABELS: Record<string, string> = {
  DATAROOM_VIEW: "Dataroom",
  INVESTOR_ONBOARDING: "LP Onboard",
  DEAL_INTEREST: "Deal Interest",
  MANUAL_ENTRY: "Manual",
  MARKETPLACE_WAITLIST: "Waitlist",
  SIGNATURE_EVENT: "E-Sign",
  BULK_IMPORT: "Import",
  REFERRAL: "Referral",
};

const SOURCE_COLORS: Record<string, string> = {
  DATAROOM_VIEW: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  INVESTOR_ONBOARDING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  DEAL_INTEREST: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  MANUAL_ENTRY: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  MARKETPLACE_WAITLIST: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  SIGNATURE_EVENT: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  BULK_IMPORT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  REFERRAL: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
};

// ---------------------------------------------------------------------------
// Engagement heat indicator
// ---------------------------------------------------------------------------

function EngagementDot({ score, showAI }: { score: number; showAI?: boolean }) {
  const color =
    score >= 15
      ? "bg-red-500"
      : score >= 5
        ? "bg-amber-500"
        : score >= 1
          ? "bg-blue-500"
          : "bg-gray-300 dark:bg-gray-600";

  const label =
    score >= 15 ? "Hot" : score >= 5 ? "Warm" : score >= 1 ? "Cool" : "None";

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} title={`${label} (${score})`} />
      <span className="font-mono text-xs tabular-nums">{score}</span>
      {showAI && score >= 15 && (
        <Sparkles className="h-3 w-3 text-purple-500" aria-hidden="true" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up date display
// ---------------------------------------------------------------------------

function FollowUpDate({ date }: { date: string }) {
  const d = new Date(date);
  const overdue = isPast(d) && !isToday(d);
  const today = isToday(d);
  const tomorrow = isTomorrow(d);

  const label = today
    ? "Today"
    : tomorrow
      ? "Tomorrow"
      : format(d, "MMM d");

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        overdue
          ? "font-medium text-red-600 dark:text-red-400"
          : today
            ? "font-medium text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
      }`}
    >
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const isActive = sortBy === field;
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactTable({
  contacts,
  tier,
  aiCrmEnabled,
  pipelineStages,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onRowClick,
  onStatusChange,
  onDelete,
  sortBy,
  sortDir,
  onSort,
  crmRole = "VIEWER",
}: ContactTableProps) {
  const isFundroom = tier === "FUNDROOM";
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const canContribute = crmRole === "CONTRIBUTOR" || crmRole === "MANAGER";
  const canManage = crmRole === "MANAGER";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="w-10 px-3 py-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all contacts"
              />
            </th>
            <th className="px-3 py-3 text-left">
              <SortHeader label="Name" field="firstName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 text-left">
              <SortHeader label="Email" field="email" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 text-left">
              <SortHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 text-left md:table-cell">Company</th>
            <th className="hidden px-3 py-3 text-left lg:table-cell">
              <SortHeader label="Source" field="source" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 text-left xl:table-cell">Tags</th>
            <th className="px-3 py-3 text-left">
              <SortHeader label="Score" field="engagementScore" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 text-left lg:table-cell">Last Activity</th>
            <th className="hidden px-3 py-3 text-left xl:table-cell">
              <SortHeader label="Follow-Up" field="nextFollowUpAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            </th>
            {isFundroom && (
              <>
                <th className="hidden px-3 py-3 text-left xl:table-cell">Commitment</th>
                <th className="hidden px-3 py-3 text-left xl:table-cell">Funding</th>
              </>
            )}
            <th className="w-10 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => {
            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
            const commitment = contact.investor?.investments?.[0]?.amount;
            const fundedAmount = contact.investor?.investments?.[0]?.fundedAmount;
            const fundingStatus = contact.investor?.investments?.[0]?.status;

            return (
              <tr
                key={contact.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onRowClick(contact)}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(contact.id)}
                    onCheckedChange={() => onToggleSelect(contact.id)}
                    aria-label={`Select ${fullName}`}
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-foreground">{fullName}</div>
                  {contact.title && (
                    <div className="text-xs text-muted-foreground">{contact.title}</div>
                  )}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{contact.email}</td>
                <td className="px-3 py-3">
                  <Badge variant="secondary" className={STATUS_COLORS[contact.status] || ""}>
                    {STATUS_LABELS[contact.status] || contact.status}
                  </Badge>
                </td>
                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                  {contact.company || "—"}
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${SOURCE_COLORS[contact.source] || ""}`}
                  >
                    {SOURCE_LABELS[contact.source] || contact.source}
                  </Badge>
                </td>
                <td className="hidden px-3 py-3 xl:table-cell">
                  {contact.tags && contact.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(contact.tags as string[]).slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contact.tags.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <EngagementDot score={contact.engagementScore} showAI={aiCrmEnabled} />
                </td>
                <td className="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell">
                  {contact.lastEngagedAt
                    ? formatDistanceToNow(new Date(contact.lastEngagedAt), { addSuffix: true })
                    : "—"}
                </td>
                <td className="hidden px-3 py-3 xl:table-cell">
                  {contact.nextFollowUpAt ? (
                    <FollowUpDate date={contact.nextFollowUpAt} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                {isFundroom && (
                  <>
                    <td className="hidden px-3 py-3 xl:table-cell">
                      {commitment ? (
                        <span className="font-mono text-xs tabular-nums">
                          ${Number(commitment).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 xl:table-cell">
                      {fundingStatus ? (
                        <Badge variant="outline" className="text-xs">
                          {fundingStatus}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </>
                )}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Contact actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canContribute && (
                        <DropdownMenuItem>
                          <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                          Send Email
                        </DropdownMenuItem>
                      )}
                      {canContribute && (
                        <DropdownMenuItem>
                          <Tag className="mr-2 h-4 w-4" aria-hidden="true" />
                          Edit Tags
                        </DropdownMenuItem>
                      )}
                      {canContribute && <DropdownMenuSeparator />}
                      {canContribute && pipelineStages.map((stage) => (
                        <DropdownMenuItem
                          key={stage}
                          onClick={() => onStatusChange(contact.id, stage)}
                          disabled={contact.status === stage}
                        >
                          <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                          Move to {STATUS_LABELS[stage] || stage}
                        </DropdownMenuItem>
                      ))}
                      {canManage && <DropdownMenuSeparator />}
                      {canManage && (
                        <DropdownMenuItem
                          className="text-red-600 dark:text-red-400"
                          onClick={() => onDelete(contact.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      )}
                      {!canContribute && (
                        <DropdownMenuItem disabled>
                          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                          View Only
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No contacts yet. Share your dataroom link to start capturing leads
            {canContribute ? ", or add contacts manually." : "."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Share Dataroom Link
            </Button>
            {canContribute && (
              <Button size="sm">+ Add Contact</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
