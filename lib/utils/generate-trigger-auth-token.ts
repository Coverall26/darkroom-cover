import { auth } from "@/lib/jobs";

export async function generateTriggerPublicAccessToken(tag: string) {
  return auth.createPublicToken({
    scopes: {
      read: {
        tags: [tag],
      },
    },
    expirationTime: "15m",
  });
}
