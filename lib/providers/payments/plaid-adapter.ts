import type {
  PaymentsProvider,
  PaymentsProviderConfig,
  CreateLinkTokenInput,
  ExchangeTokenInput,
  ExchangeTokenResult,
  BankAccount,
  TransferAuthorizationInput,
  TransferAuthorizationResult,
  CreateTransferInput,
  Transfer,
  TransferStatus,
  PaymentsWebhookResult,
} from "./types";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransferType,
  TransferNetwork,
  ACHClass,
} from "plaid";
import crypto from "crypto";
import { importJWK, jwtVerify, type JWK } from "jose";

function mapTransferStatus(status: string): TransferStatus {
  const statusMap: Record<string, TransferStatus> = {
    pending: "PENDING",
    posted: "POSTED",
    settled: "SETTLED",
    cancelled: "CANCELLED",
    failed: "FAILED",
    returned: "RETURNED",
  };
  return statusMap[status.toLowerCase()] || "PENDING";
}

export class PlaidPaymentsProvider implements PaymentsProvider {
  readonly name = "Plaid";
  readonly type = "plaid" as const;
  private config: PaymentsProviderConfig;
  private client: PlaidApi;

  constructor(config?: Partial<PaymentsProviderConfig>) {
    this.config = {
      provider: "plaid",
      clientId: config?.clientId || process.env.PLAID_CLIENT_ID,
      secret: config?.secret || process.env.PLAID_SECRET,
      environment: config?.environment ||
        (process.env.PLAID_ENV === "production" ? "production" : "sandbox"),
      webhookUrl: config?.webhookUrl || process.env.PLAID_WEBHOOK_URL,
    };

    const configuration = new Configuration({
      basePath:
        PlaidEnvironments[
          this.config.environment === "production" ? "production" : "sandbox"
        ],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": this.config.clientId,
          "PLAID-SECRET": this.config.secret,
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.secret);
  }

  async createLinkToken(input: CreateLinkTokenInput): Promise<string> {
    const response = await this.client.linkTokenCreate({
      user: {
        client_user_id: input.userId,
      },
      client_name: input.clientName,
      products: [Products.Auth, Products.Transfer],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: input.webhookUrl || this.config.webhookUrl,
    });

    return response.data.link_token;
  }

  async exchangePublicToken(input: ExchangeTokenInput): Promise<ExchangeTokenResult> {
    const response = await this.client.itemPublicTokenExchange({
      public_token: input.publicToken,
    });

    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  }

  async getAccounts(accessToken: string): Promise<BankAccount[]> {
    const response = await this.client.accountsGet({
      access_token: accessToken,
    });

    const item = await this.client.itemGet({ access_token: accessToken });
    const institutionId = item.data.item.institution_id;

    let institutionName = "Unknown";
    if (institutionId) {
      try {
        const inst = await this.client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = inst.data.institution.name;
      } catch {
        // Ignore institution fetch errors
      }
    }

    return response.data.accounts.map((account) => ({
      id: account.account_id,
      institutionId: institutionId || "",
      institutionName,
      accountId: account.account_id,
      accountName: account.name,
      accountMask: account.mask || "",
      accountType: account.subtype === "savings" ? "savings" : "checking",
      verificationStatus: "verified",
    }));
  }

  async getAccountBalance(accessToken: string, accountIds?: string[]): Promise<BankAccount[]> {
    const response = await this.client.accountsBalanceGet({
      access_token: accessToken,
      options: accountIds ? { account_ids: accountIds } : undefined,
    });

    return response.data.accounts.map((account) => ({
      id: account.account_id,
      institutionId: "",
      institutionName: "",
      accountId: account.account_id,
      accountName: account.name,
      accountMask: account.mask || "",
      accountType: account.subtype === "savings" ? "savings" : "checking",
      verificationStatus: "verified",
    }));
  }

  async authorizeTransfer(input: TransferAuthorizationInput): Promise<TransferAuthorizationResult> {
    const response = await this.client.transferAuthorizationCreate({
      access_token: input.accessToken,
      account_id: input.accountId,
      type: input.type as TransferType,
      network: TransferNetwork.Ach,
      amount: input.amount,
      ach_class: ACHClass.Ppd,
      user: {
        legal_name: input.legalName,
        email_address: input.email,
      },
    });

    return {
      authorizationId: response.data.authorization.id,
      decision: response.data.authorization.decision as "approved" | "declined" | "pending",
      decisionRationale: response.data.authorization.decision_rationale?.description,
    };
  }

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    const response = await this.client.transferCreate({
      access_token: input.accessToken,
      account_id: input.accountId,
      authorization_id: input.authorizationId,
      amount: input.amount,
      description: input.description,
    });

    const transfer = response.data.transfer;

    return {
      id: transfer.id,
      providerTransferId: transfer.id,
      status: mapTransferStatus(transfer.status),
      amount: transfer.amount,
      type: transfer.type as "debit" | "credit",
      network: "ach",
      createdAt: new Date(transfer.created),
    };
  }

  async getTransfer(transferId: string): Promise<Transfer> {
    const response = await this.client.transferGet({
      transfer_id: transferId,
    });

    const transfer = response.data.transfer;

    return {
      id: transfer.id,
      providerTransferId: transfer.id,
      status: mapTransferStatus(transfer.status),
      amount: transfer.amount,
      type: transfer.type as "debit" | "credit",
      network: "ach",
      createdAt: new Date(transfer.created),
    };
  }

  async cancelTransfer(transferId: string): Promise<boolean> {
    try {
      await this.client.transferCancel({
        transfer_id: transferId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async verifyWebhookSignature(body: string, signedJwt: string): Promise<boolean> {
    if (!signedJwt) {
      console.error("Plaid webhook: Missing Plaid-Verification header");
      return false;
    }

    try {
      const [headerB64] = signedJwt.split(".");
      if (!headerB64) {
        return false;
      }

      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
      const keyId = header.kid;

      if (!keyId) {
        return false;
      }

      const keyResponse = await this.client.webhookVerificationKeyGet({
        key_id: keyId,
      });

      const jwk = keyResponse.data.key;
      const publicKey = await importJWK(jwk as unknown as JWK, "ES256");

      const { payload } = await jwtVerify(signedJwt, publicKey, {
        algorithms: ["ES256"],
        maxTokenAge: "5 minutes",
      });

      const requestBodyHash = crypto.createHash("sha256").update(body).digest("hex");

      if (payload.request_body_sha256 !== requestBodyHash) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Plaid webhook verification error:", error);
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): PaymentsWebhookResult {
    const data = payload as {
      webhook_type: string;
      webhook_code: string;
      item_id?: string;
      transfer_id?: string;
      new_transfer_status?: string;
      error?: {
        error_type: string;
        error_code: string;
        error_message: string;
      };
    };

    return {
      eventType: `${data.webhook_type}.${data.webhook_code}`,
      transferId: data.transfer_id,
      itemId: data.item_id,
      status: data.new_transfer_status
        ? mapTransferStatus(data.new_transfer_status)
        : undefined,
      error: data.error
        ? {
            type: data.error.error_type,
            code: data.error.error_code,
            message: data.error.error_message,
          }
        : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
