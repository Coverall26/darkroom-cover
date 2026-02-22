import type { Readable } from "stream";
import crypto from "crypto";
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
import { getCryptoService } from "../encryption/crypto-service";

export class VercelBlobProvider implements StorageProvider {
  readonly type = "vercel" as const;
  private readonly encryptionEnabled: boolean;
  private readonly blobToken: string | undefined;

  constructor(config: StorageConfig) {
    this.encryptionEnabled = !!config.encryptionKey;
    this.blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!this.encryptionEnabled) {
      console.warn("[VERCEL-PROVIDER] WARNING: Encryption not enabled! Vercel Blob uses public URLs. " +
        "Without encryption, uploaded data will be publicly accessible. " +
        "Set STORAGE_ENCRYPTION_KEY to enable server-side encryption.");
    }
  }

  private async getVercelBlob() {
    const { put, del, list, head } = await import("@vercel/blob");
    return { put, del, list, head };
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    options?: StorageUploadOptions
  ): Promise<{ key: string; hash: string }> {
    const { put } = await this.getVercelBlob();

    let contentBuffer: Buffer = typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data as Uint8Array);

    const shouldEncrypt = this.encryptionEnabled && (options?.encrypt !== false);
    if (shouldEncrypt) {
      const cryptoService = getCryptoService();
      contentBuffer = cryptoService.encryptToBuffer(contentBuffer);
    }

    const hash = crypto.createHash("sha256").update(contentBuffer).digest("hex");

    const blob = await put(key, contentBuffer, {
      access: "public",
      contentType: options?.contentType || "application/octet-stream",
      token: this.blobToken,
      addRandomSuffix: false,
    });

    return { key: blob.pathname || key, hash };
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
    return this.put(key, Buffer.concat(chunks), options);
  }

  async get(
    key: string,
    options?: StorageDownloadOptions
  ): Promise<Buffer | null> {
    try {
      const { head } = await this.getVercelBlob();
      
      const blobInfo = await head(key, { token: this.blobToken });
      if (!blobInfo) return null;

      const response = await fetch(blobInfo.downloadUrl);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to download from Vercel Blob: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      let data: Buffer = Buffer.from(new Uint8Array(arrayBuffer));

      const shouldDecrypt = this.encryptionEnabled && (options?.decrypt !== false);
      if (shouldDecrypt) {
        const cryptoService = getCryptoService();
        data = cryptoService.decryptFromBuffer(data);
      }

      return data;
    } catch (error) {
      console.error("[VERCEL-PROVIDER] Error downloading:", error);
      return null;
    }
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
    try {
      const { del } = await this.getVercelBlob();
      await del(key, { token: this.blobToken });
      return true;
    } catch (error) {
      console.error("[VERCEL-PROVIDER] Error deleting:", error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { head } = await this.getVercelBlob();
      const info = await head(key, { token: this.blobToken });
      return !!info;
    } catch {
      return false;
    }
  }

  async list(options?: StorageListOptions): Promise<StorageListResult> {
    try {
      const { list } = await this.getVercelBlob();
      
      const result = await list({
        prefix: options?.prefix,
        limit: options?.maxKeys,
        cursor: options?.continuationToken,
        token: this.blobToken,
      });

      return {
        keys: result.blobs.map(b => b.pathname),
        isTruncated: result.hasMore,
        nextContinuationToken: result.cursor || undefined,
      };
    } catch (error) {
      console.error("[VERCEL-PROVIDER] Error listing:", error);
      return { keys: [], isTruncated: false };
    }
  }

  async getInfo(key: string): Promise<StorageObjectInfo | null> {
    try {
      const { head } = await this.getVercelBlob();
      const info = await head(key, { token: this.blobToken });
      
      if (!info) return null;

      return {
        key: info.pathname,
        size: info.size,
        lastModified: new Date(info.uploadedAt),
        contentType: info.contentType,
      };
    } catch {
      return null;
    }
  }

  async getSignedUrl(
    key: string,
    options?: StorageSignedUrlOptions
  ): Promise<string> {
    const method = options?.method || "GET";
    
    if (method === "PUT") {
      throw new Error("[VERCEL-PROVIDER] Vercel Blob does not support signed PUT URLs. Use put() method directly.");
    }
    
    if (method === "DELETE") {
      throw new Error("[VERCEL-PROVIDER] Vercel Blob does not support signed DELETE URLs. Use delete() method directly.");
    }
    
    const { head } = await this.getVercelBlob();
    const info = await head(key, { token: this.blobToken });
    
    if (!info) {
      throw new Error(`Object not found: ${key}`);
    }

    return info.downloadUrl;
  }

  async copy(sourceKey: string, destKey: string): Promise<boolean> {
    try {
      const data = await this.get(sourceKey);
      if (!data) return false;

      await this.put(destKey, data);
      return true;
    } catch {
      return false;
    }
  }
}
