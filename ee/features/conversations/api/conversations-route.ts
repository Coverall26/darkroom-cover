import { NextApiRequest, NextApiResponse } from "next";

import { runs } from "@/lib/jobs";
import { waitUntil } from "@vercel/functions";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

import {
  CreateConversationInput,
  conversationService,
} from "../lib/api/conversations";
import { messageService } from "../lib/api/messages";
import { notificationService } from "../lib/api/notifications";
import { sendConversationTeamMemberNotificationTask } from "../lib/trigger/conversation-message-notification";

/**
 * Validate that a viewer exists, belongs to the correct team for the dataroom,
 * and has not had access revoked. Returns the viewer or null.
 */
async function validateViewer(dataroomId: string, viewerId: string) {
  const dataroom = await prisma.dataroom.findUnique({
    where: { id: dataroomId },
    select: { teamId: true },
  });
  if (!dataroom) return null;

  const viewer = await prisma.viewer.findUnique({
    where: { id: viewerId, teamId: dataroom.teamId },
    select: { id: true, accessRevokedAt: true },
  });
  if (!viewer || viewer.accessRevokedAt) return null;

  return viewer;
}

// Route mapping object to handle different paths
const routeHandlers = {
  // GET /api/conversations
  "GET /": async (req: NextApiRequest, res: NextApiResponse) => {
    // Handle listing conversations
    const { dataroomId, viewerId } = req.query as {
      dataroomId?: string;
      viewerId?: string;
    };

    if (!dataroomId || !viewerId) {
      return res.status(400).json({ error: "Missing dataroomId or viewerId" });
    }

    // Validate viewer exists in the dataroom's team and is not revoked
    const viewer = await validateViewer(dataroomId, viewerId);
    if (!viewer) {
      return res.status(403).json({ error: "Access denied" });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        dataroomId,
        participants: {
          some: {
            viewerId,
          },
        },
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
        dataroom: true,
        dataroomDocument: {
          include: {
            document: true,
          },
        },
        participants: {
          where: {
            viewerId,
          },
          select: {
            receiveNotifications: true,
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const conversationsWithNotifications = conversations.map(
      (conversation) => ({
        ...conversation,
        receiveNotifications: conversation.participants[0].receiveNotifications,
      }),
    );

    return res.status(200).json(conversationsWithNotifications);
  },

  // POST /api/conversations
  "POST /": async (req: NextApiRequest, res: NextApiResponse) => {
    const { dataroomId, viewId, viewerId, documentId, pageNumber, ...data } =
      req.body as CreateConversationInput & {
        dataroomId: string;
        viewId: string;
        viewerId?: string;
        documentId?: string;
        pageNumber?: number;
      };

    // Check if viewerId is provided
    if (!viewerId || !dataroomId) {
      return res.status(400).json({ error: "Viewer and dataroom are required" });
    }

    // Validate viewer exists in the dataroom's team and is not revoked
    const viewer = await validateViewer(dataroomId, viewerId);
    if (!viewer) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if conversations are allowed
    const areAllowed = await conversationService.areConversationsAllowed(
      dataroomId,
      data.linkId,
    );

    if (!areAllowed) {
      return res.status(403).json({
        error: "Conversations are disabled for this dataroom or link",
      });
    }

    const team = await prisma.team.findFirst({
      where: {
        datarooms: {
          some: {
            id: dataroomId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!team) {
      return res.status(400).json({ error: "Team not found" });
    }

    // Map documentId to dataroomDocumentId and get version info if provided
    let enhancedData = { ...data };
    if (documentId) {
      const dataroomDocument = await prisma.dataroomDocument.findFirst({
        where: {
          dataroomId,
          documentId,
        },
        include: {
          document: {
            include: {
              versions: {
                where: { isPrimary: true },
                select: { versionNumber: true },
              },
            },
          },
        },
      });

      if (dataroomDocument) {
        enhancedData.dataroomDocumentId = dataroomDocument.id;

        // Set page number if provided
        if (pageNumber) {
          enhancedData.documentPageNumber = pageNumber;
        }

        // Set document version number from the primary version
        if (dataroomDocument.document.versions[0]?.versionNumber) {
          enhancedData.documentVersionNumber =
            dataroomDocument.document.versions[0].versionNumber;
        }
      }
    }

    // Create the conversation
    const conversation = await conversationService.createConversation({
      dataroomId,
      viewerId,
      viewId,
      teamId: team.id,
      data: enhancedData,
    });

    // Get all delayed and queued runs for this dataroom
    const allRuns = await runs.list({
      taskIdentifier: ["send-conversation-team-member-notification"],
      tag: [`conversation_${conversation.id}`],
      status: ["DELAYED", "QUEUED"],
      period: "5m",
    });

    // Cancel any existing unsent notification runs for this dataroom
    await Promise.all(allRuns.data.map((run) => runs.cancel(run.id)));

    waitUntil(
      sendConversationTeamMemberNotificationTask.trigger(
        {
          dataroomId,
          messageId: conversation.messages[0].id,
          conversationId: conversation.id,
          senderUserId: viewerId,
          teamId: team.id,
        },
        {
          idempotencyKey: `conversation-notification-${team.id}-${dataroomId}-${conversation.id}-${conversation.messages[0].id}`,
          tags: [
            `team_${team.id}`,
            `dataroom_${dataroomId}`,
            `conversation_${conversation.id}`,
          ],
          delay: { until: new Date(Date.now() + 5 * 60 * 1000) },
        },
      ),
    );

    return res.status(201).json(conversation);
  },

  // POST /api/conversations/messages
  "POST /messages": async (req: NextApiRequest, res: NextApiResponse) => {
    const { content, viewId, viewerId, conversationId } = req.body as {
      content: string;
      viewId: string;
      viewerId: string;
      conversationId: string;
    };

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Message content is required" });
    }

    if (!viewerId || !conversationId) {
      return res.status(400).json({ error: "Viewer and conversation are required" });
    }

    // Validate viewer is a participant in this conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        dataroomId: true,
        participants: { where: { viewerId }, select: { id: true } },
      },
    });

    if (!conversation || conversation.participants.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Validate viewer exists in the dataroom's team and is not revoked
    const viewer = await validateViewer(conversation.dataroomId, viewerId);
    if (!viewer) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Create the message
    const message = await messageService.addMessage({
      conversationId,
      content,
      viewId,
      viewerId,
    });

    // Get all delayed and queued runs for this dataroom
    const allRuns = await runs.list({
      taskIdentifier: ["send-conversation-team-member-notification"],
      tag: [`conversation_${message.conversationId}`],
      status: ["DELAYED", "QUEUED"],
      period: "5m",
    });

    // Cancel any existing unsent notification runs for this dataroom
    await Promise.all(allRuns.data.map((run) => runs.cancel(run.id)));

    waitUntil(
      sendConversationTeamMemberNotificationTask.trigger(
        {
          dataroomId: message.conversation.dataroomId,
          messageId: message.id,
          conversationId: message.conversationId,
          senderUserId: viewerId,
          teamId: message.conversation.teamId,
        },
        {
          idempotencyKey: `conversation-notification-${message.conversation.teamId}-${message.conversation.dataroomId}-${message.conversationId}-${message.id}`,
          tags: [
            `team_${message.conversation.teamId}`,
            `dataroom_${message.conversation.dataroomId}`,
            `conversation_${message.conversationId}`,
          ],
          delay: { until: new Date(Date.now() + 5 * 60 * 1000) },
        },
      ),
    );

    return res.status(201).json(message);
  },

  // POST /api/conversations/notifications
  "POST /notifications": async (req: NextApiRequest, res: NextApiResponse) => {
    const { enabled, viewerId, conversationId } = req.body as {
      enabled: boolean;
      viewerId: string;
      conversationId: string;
    };

    if (!viewerId || !conversationId) {
      return res.status(400).json({ error: "Viewer and conversation are required" });
    }

    // Validate viewer is a participant in this conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        dataroomId: true,
        participants: { where: { viewerId }, select: { id: true } },
      },
    });

    if (!conversation || conversation.participants.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const viewer = await validateViewer(conversation.dataroomId, viewerId);
    if (!viewer) {
      return res.status(403).json({ error: "Access denied" });
    }

    await notificationService.toggleNotificationsForConversation({
      conversationId,
      viewerId,
      enabled,
    });

    return res.status(200).json({ success: true });
  },
};

// Main handler that will be imported by the catchall route
export async function handleRoute(req: NextApiRequest, res: NextApiResponse) {
  const { method, query } = req;

  // Construct route key from method and path
  const path = Array.isArray(query.conversations)
    ? query.conversations.join("/")
    : "";
  const routeKey = `${method} /${path}`;

  // Find matching handler
  const handler = routeHandlers[routeKey as keyof typeof routeHandlers];

  if (!handler) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  try {
    return await handler(req, res);
  } catch (error) {
    reportError(error as Error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
