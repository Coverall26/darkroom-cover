import { NextApiResponse } from "next";
import { reportError } from "./error";

export function errorhandler(err: unknown, res: NextApiResponse) {
  if (err instanceof TeamError || err instanceof DocumentError) {
    // Log details server-side only — never leak error messages to clients
    reportError(err);
    const message =
      err instanceof DocumentError ? "Document not found" : "Access denied";
    return res.status(err.statusCode).json({ error: message });
  } else {
    reportError(err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

export class TeamError extends Error {
  statusCode = 400;
  constructor(public message: string) {
    super(message);
  }
}

export class DocumentError extends Error {
  statusCode = 400;
  constructor(public message: string) {
    super(message);
  }
}
