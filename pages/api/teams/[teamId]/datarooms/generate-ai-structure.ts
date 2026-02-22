import type { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import {
  getDataroomSystemPrompt,
  getDataroomUserPrompt,
} from "@/ee/features/templates/lib/prompts";
import { openai } from "@/lib/openai";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST") {
    // POST /api/teams/:teamId/datarooms/generate-ai-structure
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      res.status(401).end("Unauthorized");
      return;
    }

    const userId = (session.user as CustomUser).id;
    const { teamId } = req.query as { teamId: string };
    const { description } = req.body as { description: string };

    if (!description || typeof description !== "string" || description.trim().length === 0) {
      return res.status(400).json({
        error: "Description is required",
      });
    }

    // Validate description length and content
    if (description.length > 2000) {
      return res.status(400).json({
        error: "Description is too long. Please keep it under 2000 characters.",
      });
    }

    try {
      const teamAccess = await prisma.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId: userId,
            teamId: teamId,
          },
        },
      });
      if (!teamAccess) {
        return res.status(401).end("Unauthorized");
      }

      // Use GPT to generate folder structure
      const [systemPrompt, userPrompt] = await Promise.all([
        getDataroomSystemPrompt(),
        getDataroomUserPrompt(description),
      ]);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        return res.status(500).json({
          error: "Internal server error",
        });
      }

      // Parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseContent);
      } catch (parseError) {
        reportError(parseError as Error);
        return res.status(422).json({
          error: "Invalid response format from AI",
        });
      }

      // Extract name and folders
      const suggestedName = parsedResponse.name;
      const folders = parsedResponse.folders;

      if (!suggestedName || typeof suggestedName !== "string") {
        return res.status(422).json({
          error: "Invalid response: name is missing or invalid",
        });
      }

      if (!Array.isArray(folders)) {
        return res.status(422).json({
          error: "Invalid folder structure format",
        });
      }

      // Validate folder structure
      const validateFolder = (folder: any, depth = 0): boolean => {
        if (depth > 5) return false; // Max depth
        if (!folder.name || typeof folder.name !== "string") return false;
        if (folder.name.length > 255) return false;
        if (folder.subfolders) {
          if (!Array.isArray(folder.subfolders)) return false;
          return folder.subfolders.every((sub: any) => validateFolder(sub, depth + 1));
        }
        return true;
      };

      if (!folders.every((folder) => validateFolder(folder))) {
        return res.status(422).json({
          error: "Generated folder structure is invalid",
        });
      }

      res.status(200).json({
        name: suggestedName.trim(),
        folders: folders,
        message: "Folder structure generated successfully",
      });
    } catch (error) {
      reportError(error as Error);
      console.error("Error generating AI folder structure:", error);
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  } else {
    // We only allow POST requests
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

