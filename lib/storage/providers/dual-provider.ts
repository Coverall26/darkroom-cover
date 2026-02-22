import type { Readable } from "stream";
import type {
  StorageProvider,
  StorageConfig,
  StorageUploadOptions,
  StorageDownloadOptions,
  StorageSignedUrlOptions,
  StorageListOptions,
  StorageListResult,
  StorageObjectInfo,
} from "./types";
import { ReplitStorageProvider } from "./replit-provider";
import { VercelBlobProvider } from "./vercel-provider";

export class DualStorageProvider implements StorageProvider {
  readonly type = "dual" as const;
  private readonly primary: StorageProvider;
  private readonly secondary: StorageProvider;
  private readonly syncEnabled: boolean;

  constructor(config: StorageConfig) {
    if (!config.encryptionKey) {
      throw new Error(
        "[DUAL-STORAGE] Encryption key required for dual storage mode. " +
        "Vercel Blob uses public URLs, so data MUST be encrypted. " +
        "Set STORAGE_ENCRYPTION_KEY environment variable."
      );
    }
    
    this.primary = new ReplitStorageProvider(config);
    this.secondary = new VercelBlobProvider(config);
    this.syncEnabled = process.env.STORAGE_DUAL_SYNC !== "false";
    
    if (process.env.DEBUG === "true") console.log("[DUAL-STORAGE] Initialized with Replit (primary) + Vercel (secondary), sync:", this.syncEnabled);
    if (process.env.DEBUG === "true") console.log("[DUAL-STORAGE] All data is encrypted server-side before upload to both providers.");
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    options?: StorageUploadOptions
  ): Promise<{ key: string; hash: string }> {
    const primaryResult = await this.primary.put(key, data, options);
    
    if (this.syncEnabled) {
      this.syncToSecondary("put", key, data, options).catch(err => {
        console.error("[DUAL-STORAGE] Secondary sync failed for put:", key, err);
      });
    }
    
    return primaryResult;
  }

  async putStream(
    key: string,
    stream: Readable,
    options?: StorageUploadOptions
  ): Promise<{ key: string; hash: string }> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    return this.put(key, data, options);
  }

  async get(
    key: string,
    options?: StorageDownloadOptions
  ): Promise<Buffer | null> {
    try {
      const data = await this.primary.get(key, options);
      if (data) return data;
    } catch (error) {
      console.warn("[DUAL-STORAGE] Primary get failed, trying secondary:", error);
    }

    try {
      const data = await this.secondary.get(key, options);
      if (data) {
        if (process.env.DEBUG === "true") console.log("[DUAL-STORAGE] Fetched from secondary (Vercel):", key);
        return data;
      }
    } catch (error) {
      console.error("[DUAL-STORAGE] Secondary get also failed:", error);
    }

    return null;
  }

  async getStream(
    key: string,
    options?: StorageDownloadOptions
  ): Promise<Readable | null> {
    const data = await this.get(key, options);
    if (!data) return null;

    const { Readable: ReadableStream } = await import("stream");
    return ReadableStream.from([data]);
  }

  async delete(key: string): Promise<boolean> {
    const results = await Promise.allSettled([
      this.primary.delete(key),
      this.secondary.delete(key),
    ]);

    const primarySuccess = results[0].status === "fulfilled" && results[0].value;
    const secondarySuccess = results[1].status === "fulfilled" && results[1].value;

    if (results[0].status === "rejected") {
      console.error("[DUAL-STORAGE] Primary delete failed:", results[0].reason);
    }
    if (results[1].status === "rejected") {
      console.error("[DUAL-STORAGE] Secondary delete failed:", results[1].reason);
    }

    return primarySuccess || secondarySuccess;
  }

  async exists(key: string): Promise<boolean> {
    const primaryExists = await this.primary.exists(key);
    if (primaryExists) return true;
    
    return await this.secondary.exists(key);
  }

  async list(options?: StorageListOptions): Promise<StorageListResult> {
    try {
      return await this.primary.list(options);
    } catch (error) {
      console.warn("[DUAL-STORAGE] Primary list failed, trying secondary:", error);
      return await this.secondary.list(options);
    }
  }

  async getInfo(key: string): Promise<StorageObjectInfo | null> {
    const primaryInfo = await this.primary.getInfo(key);
    if (primaryInfo) return primaryInfo;
    
    return await this.secondary.getInfo(key);
  }

  async getSignedUrl(
    key: string,
    options?: StorageSignedUrlOptions
  ): Promise<string> {
    try {
      return await this.primary.getSignedUrl(key, options);
    } catch (error) {
      console.warn("[DUAL-STORAGE] Primary getSignedUrl failed, trying secondary:", error);
      return await this.secondary.getSignedUrl(key, options);
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<boolean> {
    const primaryResult = await this.primary.copy(sourceKey, destKey);
    
    if (this.syncEnabled) {
      this.secondary.copy(sourceKey, destKey).catch(err => {
        console.error("[DUAL-STORAGE] Secondary copy failed:", err);
      });
    }
    
    return primaryResult;
  }

  private async syncToSecondary(
    operation: "put",
    key: string,
    data: Buffer | Uint8Array | string,
    options?: StorageUploadOptions
  ): Promise<void> {
    await this.secondary.put(key, data, options);
    if (process.env.DEBUG === "true") console.log("[DUAL-STORAGE] Synced to secondary:", key);
  }

  async syncAllToSecondary(): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;
    let continuationToken: string | undefined;

    do {
      const listResult = await this.primary.list({ 
        maxKeys: 100,
        continuationToken,
      });

      for (const key of listResult.keys) {
        try {
          const exists = await this.secondary.exists(key);
          if (!exists) {
            const data = await this.primary.get(key, { decrypt: false });
            if (data) {
              await this.secondary.put(key, data, { encrypt: false });
              synced++;
              if (process.env.DEBUG === "true") console.log("[DUAL-STORAGE] Synced:", key);
            }
          }
        } catch (error) {
          failed++;
          console.error("[DUAL-STORAGE] Failed to sync:", key, error);
        }
      }

      continuationToken = listResult.nextContinuationToken;
    } while (continuationToken);

    return { synced, failed };
  }
}
