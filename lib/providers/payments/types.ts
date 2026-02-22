export type PaymentsProviderType = "plaid" | "stripe" | "dwolla" | "modern_treasury";

export type TransferType = "debit" | "credit";
export type TransferNetwork = "ach" | "wire" | "rtp";

export type TransferStatus =
  | "PENDING"
  | "PROCESSING"
  | "POSTED"
  | "SETTLED"
  | "CANCELLED"
  | "FAILED"
  | "RETURNED";

export interface BankAccount {
  id: string;
  institutionId: string;
  institutionName: string;
  accountId: string;
  accountName: string;
  accountMask: string;
  accountType: "checking" | "savings";
  verificationStatus: "pending" | "verified" | "failed";
}

export interface CreateLinkTokenInput {
  userId: string;
  clientName: string;
  products?: string[];
  webhookUrl?: string;
}

export interface ExchangeTokenInput {
  publicToken: string;
}

export interface ExchangeTokenResult {
  accessToken: string;
  itemId: string;
}

export interface TransferAuthorizationInput {
  accessToken: string;
  accountId: string;
  amount: string;
  type: TransferType;
  network?: TransferNetwork;
  legalName: string;
  email?: string;
}

export interface TransferAuthorizationResult {
  authorizationId: string;
  decision: "approved" | "declined" | "pending";
  decisionRationale?: string;
}

export interface CreateTransferInput {
  accessToken: string;
  accountId: string;
  authorizationId: string;
  amount: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface Transfer {
  id: string;
  providerTransferId: string;
  status: TransferStatus;
  amount: string;
  type: TransferType;
  network: TransferNetwork;
  createdAt: Date;
  settledAt?: Date;
}

export interface PaymentsWebhookResult {
  eventType: string;
  transferId?: string;
  itemId?: string;
  status?: TransferStatus;
  error?: {
    type: string;
    code: string;
    message: string;
  };
  data: Record<string, unknown>;
}

export interface PaymentsProvider {
  readonly name: string;
  readonly type: PaymentsProviderType;

  isConfigured(): boolean;

  createLinkToken(input: CreateLinkTokenInput): Promise<string>;

  exchangePublicToken(input: ExchangeTokenInput): Promise<ExchangeTokenResult>;

  getAccounts(accessToken: string): Promise<BankAccount[]>;

  getAccountBalance(accessToken: string, accountIds?: string[]): Promise<BankAccount[]>;

  authorizeTransfer(input: TransferAuthorizationInput): Promise<TransferAuthorizationResult>;

  createTransfer(input: CreateTransferInput): Promise<Transfer>;

  getTransfer(transferId: string): Promise<Transfer>;

  cancelTransfer(transferId: string): Promise<boolean>;

  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;

  parseWebhookEvent(payload: unknown): PaymentsWebhookResult;
}

export interface PaymentsProviderConfig {
  provider: PaymentsProviderType;
  clientId?: string;
  secret?: string;
  environment?: "sandbox" | "production";
  webhookUrl?: string;
}
