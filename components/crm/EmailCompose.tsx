"use client";

import { useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
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

interface EmailComposeProps {
  contactId: string;
  contactEmail: string;
  contactName: string;
  onClose: () => void;
  onSent: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailCompose({
  contactId,
  contactEmail,
  contactName,
  onClose,
  onSent,
}: EmailComposeProps) {
  const { tier, limits } = useTier();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasEmailTracking = limits?.hasEmailTracking ?? false;

  // Send email
  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          subject: subject.trim(),
          body: body.trim(),
          trackOpens: hasEmailTracking,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send email");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSent();
        onClose();
      }, 1500);
    } catch {
      setError("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  // AI Draft
  const handleAiDraft = async () => {
    setAiDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          purpose: "follow_up",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubject(data.subject || subject);
        setBody(data.body || body);
      } else {
        setError("AI draft not available");
      }
    } catch {
      setError("AI draft failed");
    } finally {
      setAiDrafting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Compose Email</h4>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0" aria-label="Close compose">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* To field */}
      <div className="mb-3">
        <label className="text-xs text-muted-foreground">To</label>
        <div className="mt-0.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm">
          {contactName} &lt;{contactEmail}&gt;
        </div>
      </div>

      {/* Subject */}
      <div className="mb-3">
        <label htmlFor="email-subject" className="text-xs text-muted-foreground">Subject</label>
        <Input
          id="email-subject"
          placeholder="Email subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-0.5"
        />
      </div>

      {/* Body */}
      <div className="mb-3">
        <label htmlFor="email-body" className="text-xs text-muted-foreground">Message</label>
        <Textarea
          id="email-body"
          placeholder="Write your message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="mt-0.5 text-sm"
        />
      </div>

      {/* Tracking note */}
      <div className="mb-3 text-xs text-muted-foreground">
        {hasEmailTracking
          ? "Email opens will be tracked."
          : "Upgrade to CRM Pro for email open tracking."}
      </div>

      {/* AI Draft disclaimer */}
      {(subject || body) && aiDrafting === false && body.length > 0 && (
        <div className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          Review the email before sending.
        </div>
      )}

      {/* Error/Success */}
      {error && (
        <div className="mb-3 text-xs text-red-600 dark:text-red-400" role="alert">{error}</div>
      )}
      {success && (
        <div className="mb-3 text-xs text-emerald-600 dark:text-emerald-400" role="alert">
          Email sent successfully!
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} size="sm">
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
    </div>
  );
}
