import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";
import { getVideoEventsByDocument } from "@/lib/tinybird/pipes";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

interface AnalyticsResponse {
  overall: {
    unique_views: number;
    total_views: number;
    total_watch_time: number;
    avg_view_duration: number;
    last_viewed_at: string;
    first_viewed_at: string;
    view_distribution: Array<{
      start_time: number;
      unique_views: number;
      total_views: number;
    }>;
  } | null;
}

function calculateAnalytics(
  events: Array<{
    timestamp: string;
    view_id: string;
    event_type: string;
    start_time: number;
    end_time: number;
    playback_rate: number;
    volume: number;
    is_muted: number;
    is_focused: number;
    is_fullscreen: number;
  }>,
  videoLength: number,
): AnalyticsResponse {
  if (!events || events.length === 0) {
    return {
      overall: null,
    };
  }

  try {
    // Filter for valid events and ensure valid time ranges > 1 second
    const validEvents = events.filter((event) => {
      // Check if event has required properties
      if (!event || typeof event.event_type !== "string" || !event.view_id) {
        console.warn("Invalid event structure:", event);
        return false;
      }

      // Check if event has valid time properties
      if (
        typeof event.start_time !== "number" ||
        typeof event.end_time !== "number"
      ) {
        console.warn("Invalid time properties:", event);
        return false;
      }

      return (
        (event.event_type === "played" ||
          event.event_type === "muted" ||
          event.event_type === "unmuted" ||
          event.event_type === "rate_changed") &&
        event.end_time > event.start_time &&
        event.end_time - event.start_time >= 1 &&
        event.start_time >= 0 &&
        event.end_time <= videoLength + 10
      ); // Allow some buffer
    });

    // Get all unique view_ids from any event type
    const uniqueViewIds = new Set(events.map((e) => e.view_id));

    // Calculate total watch time
    let totalWatchTime = 0;
    validEvents.forEach((event) => {
      const duration = event.end_time - event.start_time;
      totalWatchTime += duration;
    });

    // Create a baseline array with zeros for every second
    const viewDistributionMap = new Map<
      number,
      { uniqueViewers: Set<string>; viewDurations: Map<string, number> }
    >();
    for (let t = 0; t <= videoLength; t++) {
      viewDistributionMap.set(t, {
        uniqueViewers: new Set(),
        viewDurations: new Map(), // Map of view_id to number of times this second was viewed
      });
    }

    // Fill in the actual playback periods
    validEvents.forEach((event) => {
      // For each second in the duration, track the view
      for (
        let t = Math.floor(event.start_time);
        t < Math.ceil(event.end_time);
        t++
      ) {
        const stats = viewDistributionMap.get(t);
        if (!stats) {
          console.warn(`No stats found for time ${t}, skipping`);
          continue;
        }
        stats.uniqueViewers.add(event.view_id);

        // Increment the count for this view_id at this second
        const currentCount = stats.viewDurations.get(event.view_id) || 0;
        stats.viewDurations.set(event.view_id, currentCount + 1);
      }
    });

    // Sort events by timestamp to find first and last view
    const sortedEvents = [...validEvents].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Convert view distribution to sorted array with both metrics
    const distributionArray = Array.from(viewDistributionMap.entries())
      .map(([start_time, stats]) => {
        // Sum up all view durations for this second
        let totalViews = 0;
        stats.viewDurations.forEach((count) => {
          totalViews += count;
        });

        return {
          start_time,
          unique_views: stats.uniqueViewers.size,
          total_views: totalViews,
        };
      })
      .sort((a, b) => a.start_time - b.start_time);

    return {
      overall: {
        unique_views: uniqueViewIds.size,
        total_views: uniqueViewIds.size,
        total_watch_time: totalWatchTime,
        avg_view_duration:
          uniqueViewIds.size > 0 ? totalWatchTime / uniqueViewIds.size : 0,
        first_viewed_at:
          sortedEvents.length > 0 ? sortedEvents[0].timestamp : "",
        last_viewed_at:
          sortedEvents.length > 0
            ? sortedEvents[sortedEvents.length - 1].timestamp
            : "",
        view_distribution: distributionArray,
      },
    };
  } catch (error) {
    reportError(error as Error);
    console.error("Error calculating analytics:", error);
    throw error;
  }
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const user = session?.user as CustomUser;

    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { teamId, id: documentId } = req.query as {
      teamId: string;
      id: string;
    };

    // Check if user has access to this document and team
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        teamId,
        team: {
          users: {
            some: {
              userId: user.id,
            },
          },
        },
      },
      include: {
        versions: {
          where: {
            isPrimary: true,
          },
          select: {
            length: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    const videoLength = document.versions[0]?.length || 51;
    if (!videoLength) {
      return res.status(400).json({ error: "Video length not found" });
    }

    try {
      // Fetch video events from Tinybird
      const response = await getVideoEventsByDocument({
        document_id: documentId,
      });

      if (!response || !response.data) {
        return res
          .status(500)
          .json({ error: "Internal server error" });
      }

      // Validate that response.data is an array
      if (!Array.isArray(response.data)) {
        return res
          .status(500)
          .json({ error: "Internal server error" });
      }

      const analytics = calculateAnalytics(response.data, videoLength);
      return res.status(200).json(analytics);
    } catch (error) {
      reportError(error as Error);
      console.error("Tinybird error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  } catch (error) {
    reportError(error as Error);
    console.error("Error in video-analytics:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
}
