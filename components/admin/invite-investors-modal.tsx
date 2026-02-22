"use client";

import { useState } from "react";
import { Copy, Loader2, Mail, Send, Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface InviteInvestorsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  fundId: string;
  fundName: string;
}

export function InviteInvestorsModal({
  open,
  onOpenChange,
  teamId,
  fundId,
  fundName,
}: InviteInvestorsModalProps) {
  const [emails, setEmails] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteLink = `${typeof window !== "undefined" ? window.location.origin : ""}/lp/onboard?teamId=${teamId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast.success("Investor onboarding link copied!");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleSendInvites = async () => {
    const emailList = emails
      .split(/[\n,]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes("@"));

    if (emailList.length === 0) {
      toast.error("Please enter at least one valid email address");
      return;
    }

    setSending(true);

    try {
      const response = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: emailList,
            message: customMessage || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || "Failed to send invitations");
        return;
      }

      const data = await response.json();
      const successCount = data.results.filter(
        (r: { status: string }) => r.status === "invited",
      ).length;

      toast.success(
        `${successCount} invitation${successCount !== 1 ? "s" : ""} sent!`,
      );
      setEmails("");
      setCustomMessage("");
      onOpenChange(false);
    } catch {
      toast.error("Failed to send invitations");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Investors to {fundName}</DialogTitle>
          <DialogDescription>
            Send email invitations or share the onboarding link directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Shareable Link Section */}
          <div>
            <Label className="text-sm font-medium">Shareable Onboarding Link</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Share this link with investors to start their onboarding
            </p>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="text-sm bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {linkCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              or send by email
            </span>
          </div>

          {/* Email Invitation Section */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-emails" className="text-sm font-medium">
                Email Addresses
              </Label>
              <Textarea
                id="invite-emails"
                placeholder="investor@example.com&#10;partner@company.com"
                className="mt-1.5 min-h-[80px] resize-none"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                disabled={sending}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One email per line, or comma-separated
              </p>
            </div>

            <div>
              <Label htmlFor="invite-message" className="text-sm font-medium">
                Personal Message (optional)
              </Label>
              <Textarea
                id="invite-message"
                placeholder="We'd love to have you review our latest fund offering..."
                className="mt-1.5 min-h-[60px] resize-none"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                disabled={sending}
                maxLength={500}
              />
            </div>

            <Button
              onClick={handleSendInvites}
              disabled={sending || !emails.trim()}
              className="w-full"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Invitations
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
