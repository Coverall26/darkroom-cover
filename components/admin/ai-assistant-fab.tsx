"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ContextHint {
  page: string;
  label: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Context-aware suggestions based on current page
// ---------------------------------------------------------------------------

function getContextHint(pathname: string): ContextHint {
  if (pathname.startsWith("/admin/dashboard")) {
    return {
      page: "dashboard",
      label: "Dashboard",
      suggestions: [
        "Summarize my pending actions",
        "What investors need follow-up?",
        "Draft a fund update email",
      ],
    };
  }
  if (pathname.startsWith("/admin/crm") || pathname.startsWith("/admin/outreach")) {
    return {
      page: "crm",
      label: "CRM & Outreach",
      suggestions: [
        "Draft a follow-up email to warm leads",
        "Which contacts are most engaged?",
        "Suggest a drip sequence for new leads",
      ],
    };
  }
  if (pathname.startsWith("/admin/investors")) {
    return {
      page: "investors",
      label: "Investors",
      suggestions: [
        "Summarize my investor pipeline",
        "Which investors are awaiting documents?",
        "Draft a commitment confirmation email",
      ],
    };
  }
  if (pathname.startsWith("/admin/fund")) {
    return {
      page: "fund",
      label: "Fund Management",
      suggestions: [
        "What's my current raise progress?",
        "Summarize pending wire transfers",
        "Draft a capital call notice",
      ],
    };
  }
  if (pathname.startsWith("/admin/reports")) {
    return {
      page: "reports",
      label: "Reports",
      suggestions: [
        "Generate a pipeline summary",
        "What's my conversion rate?",
        "Compare monthly commitments",
      ],
    };
  }
  if (pathname.startsWith("/admin/settings")) {
    return {
      page: "settings",
      label: "Settings",
      suggestions: [
        "How do I configure email notifications?",
        "What are the LP visibility settings?",
        "Help me set up custom branding",
      ],
    };
  }
  return {
    page: "general",
    label: "General",
    suggestions: [
      "What can you help me with?",
      "Summarize my dashboard",
      "Draft an investor update email",
    ],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIAssistantFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname() ?? "";

  const contextHint = getContextHint(pathname);

  // Listen for toggle event from header button
  useEffect(() => {
    function handleToggle() {
      setIsOpen((prev) => !prev);
    }
    window.addEventListener("toggle-ai-assistant", handleToggle);
    return () => window.removeEventListener("toggle-ai-assistant", handleToggle);
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape closes panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: messageText,
          context: contextHint.page,
        }),
      });

      let assistantContent: string;
      if (res.ok) {
        const data = await res.json();
        assistantContent = data.draft || data.content || data.message || "I processed your request. Let me know if you need anything else.";
      } else if (res.status === 402) {
        assistantContent = "AI features require the AI CRM add-on. You can enable it in Settings > Billing.";
      } else {
        assistantContent = "I wasn't able to process that request right now. Please try again.";
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, contextHint.page]);

  return (
    <>
      {/* FAB Button — always visible at bottom-right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          "bg-[#0066FF] hover:bg-[#0052CC] text-white hover:scale-105",
          isOpen && "bg-[#0052CC] scale-95",
        )}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-background border border-border rounded-xl shadow-2xl flex flex-col transition-all duration-200",
            isExpanded
              ? "bottom-4 right-4 left-4 top-20 sm:left-auto sm:w-[560px] sm:top-16"
              : "bottom-20 right-6 w-[380px] max-h-[520px]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-[#0066FF]/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-[#0066FF]" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Assistant</p>
                <p className="text-[10px] text-muted-foreground">{contextHint.label} context</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                aria-label={isExpanded ? "Minimize" : "Expand"}
              >
                {isExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <Sparkles className="h-8 w-8 text-[#0066FF]/30 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm text-muted-foreground mb-4">
                  Ask me anything about your {contextHint.label.toLowerCase()}.
                </p>
                <div className="space-y-2">
                  {contextHint.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-[#0066FF] text-white"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={cn(
                      "text-[10px] mt-1",
                      msg.role === "user" ? "text-white/60" : "text-muted-foreground",
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything..."
                className="flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-[#0066FF] placeholder:text-muted-foreground/60"
                disabled={isLoading}
              />
              <Button
                size="sm"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 p-0 bg-[#0066FF] hover:bg-[#0052CC] text-white"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
