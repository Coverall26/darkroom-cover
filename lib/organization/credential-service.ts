import crypto from "crypto";
import prisma from "@/lib/prisma";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface CredentialData {
  apiKey?: string;
  apiSecret?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  webhookSecret?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  [key: string]: string | undefined;
}

export class OrganizationCredentialService {
  private readonly encryptionKey: Buffer;

  constructor() {
    const keySource = process.env.STORAGE_ENCRYPTION_KEY;
    if (!keySource || !/^[0-9a-fA-F]{64}$/.test(keySource)) {
      throw new Error(
        "STORAGE_ENCRYPTION_KEY must be a 64-character hex string for credential encryption"
      );
    }
    this.encryptionKey = Buffer.from(keySource, "hex");
  }

  private encrypt(data: string): { encrypted: string; hash: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(data, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    const hash = crypto
      .createHash("sha256")
      .update(combined)
      .digest("hex");

    return {
      encrypted: combined.toString("base64"),
      hash,
    };
  }

  private decrypt(encryptedData: string): string {
    const combined = Buffer.from(encryptedData, "base64");
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      iv,
      { authTagLength: AUTH_TAG_LENGTH }
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  async storeCredentials(
    organizationId: string,
    provider: string,
    credentials: CredentialData,
    options: {
      environment?: string;
      label?: string;
    } = {}
  ): Promise<string> {
    const { environment = "production", label } = options;

    const credentialJson = JSON.stringify(credentials);
    const { encrypted, hash } = this.encrypt(credentialJson);

    const credential = await prisma.organizationIntegrationCredential.upsert({
      where: {
        organizationId_provider_environment: {
          organizationId,
          provider,
          environment,
        },
      },
      update: {
        encryptedCredentials: encrypted,
        credentialHash: hash,
        label,
        lastRotatedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        provider,
        environment,
        encryptedCredentials: encrypted,
        credentialHash: hash,
        label,
      },
    });

    return credential.id;
  }

  async getCredentials(
    organizationId: string,
    provider: string,
    environment: string = "production"
  ): Promise<CredentialData | null> {
    const credential =
      await prisma.organizationIntegrationCredential.findUnique({
        where: {
          organizationId_provider_environment: {
            organizationId,
            provider,
            environment,
          },
        },
      });

    if (!credential || !credential.isActive) {
      return null;
    }

    const decrypted = this.decrypt(credential.encryptedCredentials);
    const credentials = JSON.parse(decrypted) as CredentialData;

    await prisma.organizationIntegrationCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return credentials;
  }

  async listCredentials(organizationId: string): Promise<
    Array<{
      id: string;
      provider: string;
      environment: string;
      label: string | null;
      isActive: boolean;
      lastUsedAt: Date | null;
      lastRotatedAt: Date | null;
      createdAt: Date;
    }>
  > {
    const credentials =
      await prisma.organizationIntegrationCredential.findMany({
        where: { organizationId },
        select: {
          id: true,
          provider: true,
          environment: true,
          label: true,
          isActive: true,
          lastUsedAt: true,
          lastRotatedAt: true,
          createdAt: true,
        },
        orderBy: { provider: "asc" },
      });

    return credentials;
  }

  async rotateCredentials(
    organizationId: string,
    provider: string,
    newCredentials: CredentialData,
    environment: string = "production"
  ): Promise<void> {
    await this.storeCredentials(organizationId, provider, newCredentials, {
      environment,
    });
  }

  async deactivateCredentials(
    organizationId: string,
    provider: string,
    environment: string = "production"
  ): Promise<void> {
    await prisma.organizationIntegrationCredential.update({
      where: {
        organizationId_provider_environment: {
          organizationId,
          provider,
          environment,
        },
      },
      data: { isActive: false },
    });
  }

  async deleteCredentials(
    organizationId: string,
    provider: string,
    environment: string = "production"
  ): Promise<void> {
    await prisma.organizationIntegrationCredential.delete({
      where: {
        organizationId_provider_environment: {
          organizationId,
          provider,
          environment,
        },
      },
    });
  }

  verifyIntegrity(encryptedData: string, storedHash: string): boolean {
    const combined = Buffer.from(encryptedData, "base64");
    const computedHash = crypto
      .createHash("sha256")
      .update(combined)
      .digest("hex");
    return computedHash === storedHash;
  }
}

export const credentialService = new OrganizationCredentialService();
