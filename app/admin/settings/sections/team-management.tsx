"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users,
  Mail,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Shield,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamMember {
  userId: string;
  role: string;
  crmRole: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface Invitation {
  email: string;
  expires: string;
  token?: string;
}

interface TeamData {
  id: string;
  name: string;
  users: TeamMember[];
}

// ─── Role helpers ───────────────────────────────────────────────────────────

const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN", "ADMIN"];
const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "MEMBER"];

function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "OWNER": return "Owner";
    case "SUPER_ADMIN": return "Super Admin";
    case "ADMIN": return "Admin";
    case "MANAGER": return "Manager";
    case "MEMBER": return "Member";
    default: return role;
  }
}

function getRoleBadgeColor(role: string): string {
  switch (role) {
    case "OWNER": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "SUPER_ADMIN": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "ADMIN": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "MANAGER": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

// ─── CRM Role helpers ────────────────────────────────────────────────────────

const CRM_ROLES = ["VIEWER", "CONTRIBUTOR", "MANAGER"] as const;

function getCrmRoleLabel(crmRole: string | null, teamRole: string): string {
  if (crmRole) {
    switch (crmRole) {
      case "VIEWER": return "Viewer";
      case "CONTRIBUTOR": return "Contributor";
      case "MANAGER": return "Manager";
      default: return crmRole;
    }
  }
  // Derive default from team role
  switch (teamRole) {
    case "OWNER": case "SUPER_ADMIN": case "ADMIN": return "Manager (default)";
    case "MANAGER": return "Contributor (default)";
    default: return "Viewer (default)";
  }
}

function getCrmRoleBadgeColor(crmRole: string | null, teamRole: string): string {
  const effective = crmRole || getDefaultCrmRole(teamRole);
  switch (effective) {
    case "MANAGER": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "CONTRIBUTOR": return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
  }
}

function getDefaultCrmRole(teamRole: string): string {
  switch (teamRole) {
    case "OWNER": case "SUPER_ADMIN": case "ADMIN": return "MANAGER";
    case "MANAGER": return "CONTRIBUTOR";
    default: return "VIEWER";
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TeamManagementSection({ teamId }: { teamId: string }) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    try {
      const [teamRes, invRes] = await Promise.all([
        fetch(`/api/teams/${teamId}`),
        fetch(`/api/teams/${teamId}/invitations`),
      ]);
      if (teamRes.ok) {
        const data = await teamRes.json();
        setTeam(data);
      }
      if (invRes.ok) {
        const data = await invRes.json();
        setInvitations(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Invite member ──
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to send invitation");
        return;
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInviteForm(false);
      fetchData();
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  // ── Change role ──
  const handleChangeRole = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/teams/${teamId}/change-role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to change role");
        return;
      }
      toast.success("Role updated");
      fetchData();
    } catch {
      toast.error("Failed to change role");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Change CRM role ──
  const handleChangeCrmRole = async (userId: string, newCrmRole: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/teams/${teamId}/crm-role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, crmRole: newCrmRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to change CRM role");
        return;
      }
      toast.success("CRM role updated");
      fetchData();
    } catch {
      toast.error("Failed to change CRM role");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Remove member ──
  const handleRemove = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from the team?`)) return;
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/teams/${teamId}/remove-teammate`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usersToRemove: [userId] }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to remove member");
        return;
      }
      toast.success(`${userName} removed from team`);
      fetchData();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Revoke invitation ──
  const handleRevokeInvite = async (email: string) => {
    setActionLoading(email);
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to revoke invitation");
        return;
      }
      toast.success("Invitation revoked");
      fetchData();
    } catch {
      toast.error("Failed to revoke invitation");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Resend invitation ──
  const handleResendInvite = async (email: string) => {
    setActionLoading(email);
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations/resend`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to resend invitation");
        return;
      }
      toast.success(`Invitation resent to ${email}`);
    } catch {
      toast.error("Failed to resend invitation");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const members = team?.users || [];

  return (
    <div className="space-y-4">
      {/* ── Member List ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowInviteForm(!showInviteForm)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        </div>

        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between rounded-md border px-3 py-2.5 dark:border-gray-800"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {(member.user.name || member.user.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {member.user.name || member.user.email}
                </p>
                <p className="text-xs text-muted-foreground">{member.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                {getRoleLabel(member.role)}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCrmRoleBadgeColor(member.crmRole, member.role)}`}>
                CRM: {getCrmRoleLabel(member.crmRole, member.role)}
              </span>
              {member.role !== "OWNER" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      {actionLoading === member.userId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Team Role
                    </p>
                    {ASSIGNABLE_ROLES.filter((r) => r !== member.role).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onClick={() => handleChangeRole(member.userId, role)}
                      >
                        <Shield className="mr-2 h-3.5 w-3.5" />
                        Change to {getRoleLabel(role)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      CRM Role
                    </p>
                    {CRM_ROLES.map((crmRole) => (
                      <DropdownMenuItem
                        key={crmRole}
                        onClick={() => handleChangeCrmRole(member.userId, crmRole)}
                      >
                        <Users className="mr-2 h-3.5 w-3.5" />
                        CRM: {crmRole.charAt(0) + crmRole.slice(1).toLowerCase()}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 dark:text-red-400"
                      onClick={() => handleRemove(member.userId, member.user.name || member.user.email)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Invite Form ── */}
      {showInviteForm && (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Invite Team Member</p>
            <button onClick={() => setShowInviteForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="MEMBER">Viewer</option>
            </select>
            <Button
              size="sm"
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Send
            </Button>
          </div>
        </div>
      )}

      {/* ── Pending Invitations ── */}
      {invitations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pending Invitations
          </p>
          {invitations.map((inv) => (
            <div
              key={inv.email}
              className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 dark:border-gray-800"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{inv.email}</span>
                <Badge variant="outline" className="text-[10px]">Pending</Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleResendInvite(inv.email)}
                  disabled={actionLoading === inv.email}
                >
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => handleRevokeInvite(inv.email)}
                  disabled={actionLoading === inv.email}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
