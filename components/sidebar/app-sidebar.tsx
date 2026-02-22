"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

import * as React from "react";

import { TeamContextType, initialState, useTeam } from "@/context/team-context";
import {
  BarChart3Icon,
  BrushIcon,
  CogIcon,
  ContactIcon,
  FolderIcon,
  HouseIcon,
  LandmarkIcon,
  Loader,
  PenLineIcon,
  ServerIcon,
  WorkflowIcon,
} from "lucide-react";

import { useFeatureFlags } from "@/lib/hooks/use-feature-flags";
import { usePlan } from "@/lib/swr/use-billing";
import useDatarooms from "@/lib/swr/use-datarooms";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavUser } from "@/components/sidebar/nav-user";
import { TeamSwitcher } from "@/components/sidebar/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname() ?? "";
  const params = useParams() ?? {};
  const { currentTeam, teams, setCurrentTeam, isLoading }: TeamContextType =
    useTeam() || initialState;
  const {
    plan: userPlan,
    isFree,
    isDataroomsPlus,
    isDataroomsPremium,
    isTrial,
  } = usePlan();

  // Check feature flags
  const { features } = useFeatureFlags();

  // Fetch datarooms for the current team
  const { datarooms } = useDatarooms();

  // Prepare datarooms items for sidebar (limit to first 5, sorted by most recent)
  const dataroomItems =
    datarooms && datarooms.length > 0
      ? datarooms.slice(0, 5).map((dataroom) => ({
          title: dataroom.name,
          url: `/datarooms/${dataroom.id}/documents`,
          current:
            pathname.includes("/datarooms/") &&
            String(params.id) === String(dataroom.id),
        }))
      : undefined;

  const data = {
    navMain: [
      {
        title: "Dashboard",
        url: "/admin/dashboard",
        icon: HouseIcon,
        current: pathname.includes("/admin/dashboard"),
      },
      {
        title: "Analytics",
        url: "/dashboard",
        icon: BarChart3Icon,
        current: pathname === "/dashboard",
      },
      {
        title: "All Documents",
        url: "/documents",
        icon: FolderIcon,
        current:
          pathname.includes("documents") &&
          !pathname.includes("datarooms"),
      },
      {
        title: "All Datarooms",
        url: "/datarooms",
        icon: ServerIcon,
        current: pathname === "/datarooms",
        disabled: false,
        isActive: pathname.includes("datarooms"),
        items: dataroomItems,
      },
      {
        title: "Visitors",
        url: "/visitors",
        icon: ContactIcon,
        current: pathname.includes("visitors"),
        disabled: false,
      },
      {
        title: "E-Signature",
        url: "/sign",
        icon: PenLineIcon,
        current: pathname.includes("/sign"),
        disabled: false,
      },
      {
        title: "Funds",
        url: "/admin/fund",
        icon: LandmarkIcon,
        current: pathname.includes("/admin/fund"),
        disabled: false,
      },
      {
        title: "Workflows",
        url: "/workflows",
        icon: WorkflowIcon,
        current: pathname.includes("/workflows"),
        disabled: !features?.workflows,
      },
      {
        title: "Branding",
        url: "/branding",
        icon: BrushIcon,
        current:
          pathname.includes("branding") &&
          !pathname.includes("datarooms"),
      },
      {
        title: "Settings",
        url: "/admin/settings",
        icon: CogIcon,
        current: pathname === "/admin/settings",
      },
    ],
  };

  // Filter out items that should be hidden based on feature flags
  const filteredNavMain = data.navMain.filter((item) => {
    // Hide workflows if feature flag is not enabled
    if (item.title === "Workflows" && !features?.workflows) {
      return false;
    }
    return true;
  });

  return (
    <Sidebar
      className="bg-gray-50 dark:bg-black"
      sidebarClassName="bg-gray-50 dark:bg-black"
      side="left"
      variant="inset"
      collapsible="icon"
      {...props}
    >
      <SidebarHeader className="gap-y-8">
        <div className="hidden w-full justify-center group-data-[collapsible=icon]:inline-flex">
          <Link href="/dashboard" shallow>
            <Image
              src="/_static/fundroom-icon.png"
              alt="FundRoom"
              width={32}
              height={32}
            />
          </Link>
        </div>
        <div className="ml-2 flex items-center group-data-[collapsible=icon]:hidden">
          <Link href="/dashboard" shallow>
            <Image
              src="/_static/fundroom-logo-black.png"
              alt="FundRoom"
              width={120}
              height={32}
              className="dark:hidden"
            />
            <Image
              src="/_static/fundroom-logo-white.png"
              alt="FundRoom"
              width={120}
              height={32}
              className="hidden dark:block"
            />
          </Link>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader className="h-5 w-5 animate-spin" /> Loading teams...
          </div>
        ) : (
          <TeamSwitcher
            currentTeam={currentTeam}
            teams={teams}
            setCurrentTeam={setCurrentTeam}
          />
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={filteredNavMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

