import { z } from "zod";

export const ZViewerNotificationPreferencesSchema = z
  .object({
    dataroom: z.record(
      z.object({
        enabled: z.boolean(),
      }),
    ),
  })
  .optional()
  .default({ dataroom: {} });

export const ZUserNotificationPreferencesSchema = z
  .object({})
  .optional()
  .default({});
