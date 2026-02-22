import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Clock,
  Share2,
  UserCheck,
  Users,
  BarChart3,
  FileText,
  TrendingUp,
  Settings,
  Shield,
  FolderLock,
} from "lucide-react";

// Activity icon map
const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  stage: UserCheck,
  approve: Activity,
  reject: Activity,
  document: FileText,
  upload: Activity,
  wire: Activity,
  commitment: Activity,
  sign: Activity,
  investor: Users,
  view: Activity,
  activate: TrendingUp,
  activity: Activity,
};

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  actor: string | null;
  timestamp: string;
  icon: string;
  link?: string;
}

interface ModeConfig {
  investorsLabel: string;
  investorLabel: string;
  fundsLabel: string;
}

interface ActivityNavGridProps {
  mode: "GP_FUND" | "STARTUP" | "DATAROOM_ONLY";
  modeConfig: ModeConfig;
  activities: ActivityItem[];
  fundCount: number;
  investorCount: number;
}

export function ActivityNavGrid({
  mode,
  modeConfig,
  activities,
  fundCount,
  investorCount,
}: ActivityNavGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Activity Feed */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-[#0066FF] flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-white" />
              </div>
              Recent Activity
            </CardTitle>
            <Link href="/admin/audit">
              <Button variant="ghost" size="sm" className="text-xs h-8">
                View All
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-2">
                <Clock className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">No recent activity</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1 mb-3">
                Activity will appear here as {modeConfig.investorsLabel.toLowerCase()} interact with your {modeConfig.fundsLabel.toLowerCase()}.
              </p>
              {fundCount > 0 && (
                <Link href="/datarooms">
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <Share2 className="h-3 w-3 mr-1" />
                    Share a Dataroom Link
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-px max-h-[320px] overflow-y-auto scrollbar-thin">
              {activities.map((item) => {
                const IconComp = ACTIVITY_ICONS[item.icon] || Activity;
                const content = (
                  <div className="flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-muted/40 transition-colors group/item">
                    <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded-md bg-muted/80 flex items-center justify-center">
                      <IconComp className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug">{item.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.actor && (
                          <>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {item.actor}
                            </span>
                            <span className="text-muted-foreground/30 text-[10px]">&middot;</span>
                          </>
                        )}
                        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                );

                return item.link ? (
                  <Link key={item.id} href={item.link}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Navigation */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2.5">
            {(mode === "DATAROOM_ONLY"
              ? [
                  { href: "/datarooms", icon: FolderLock, label: "Datarooms", sub: `${fundCount} active` },
                  { href: "/admin/analytics", icon: BarChart3, label: "Analytics", sub: "View metrics" },
                  { href: "/admin/documents", icon: FileText, label: "Documents", sub: "Review uploads" },
                  { href: "/admin/reports", icon: TrendingUp, label: "Reports", sub: "Analytics" },
                  { href: "/admin/settings", icon: Settings, label: "Settings", sub: "Configuration" },
                  { href: "/admin/audit", icon: Shield, label: "Audit Log", sub: "Activity trail" },
                ]
              : [
                  { href: "/admin/fund", icon: BarChart3, label: modeConfig.fundsLabel, sub: `${fundCount} active` },
                  { href: "/admin/investors", icon: Users, label: modeConfig.investorsLabel, sub: `${investorCount} total` },
                  { href: "/admin/documents", icon: FileText, label: "Documents", sub: "Review uploads" },
                  { href: "/admin/approvals", icon: UserCheck, label: "Approvals", sub: `${modeConfig.investorLabel} queue` },
                  { href: "/admin/reports", icon: TrendingUp, label: "Reports", sub: "Analytics" },
                  { href: "/admin/settings", icon: Settings, label: "Settings", sub: "Configuration" },
                ]
            ).map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg border hover:bg-muted/40 hover:border-[#0066FF]/20 transition-all group/nav">
                  <div className="h-8 w-8 rounded-lg bg-[#0066FF]/10 flex items-center justify-center flex-shrink-0 group-hover/nav:bg-[#0066FF]/15 transition-colors">
                    <item.icon className="h-4 w-4 text-[#0066FF]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono tabular-nums">{item.sub}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
