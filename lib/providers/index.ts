export * from "./kyc";
export * from "./esign";
export * from "./payments";
export * from "./email";
export * from "./analytics";

export { getStorageProvider, createStorageProvider } from "../storage/providers";

import type { KycProvider } from "./kyc/types";
import type { EsignProvider } from "./esign/types";
import type { PaymentsProvider } from "./payments/types";
import type { EmailProvider } from "./email/types";
import type { AnalyticsProvider } from "./analytics/types";
import type { StorageProvider } from "../storage/providers/types";

import { getKycProvider, createKycProvider } from "./kyc";
import { getEsignProvider, createEsignProvider } from "./esign";
import { getPaymentsProvider, createPaymentsProvider } from "./payments";
import { getEmailProvider, createEmailProvider } from "./email";
import { getAnalyticsProvider, createAnalyticsProvider } from "./analytics";
import { getStorageProvider, createStorageProvider } from "../storage/providers";

export interface OrganizationProviderConfig {
  kyc?: {
    provider: string;
    apiKey?: string;
    templateId?: string;
    environmentId?: string;
  };
  esign?: {
    provider: string;
    apiKey?: string;
  };
  payments?: {
    provider: string;
    clientId?: string;
    secret?: string;
  };
  email?: {
    provider: string;
    apiKey?: string;
    domain?: string;
  };
  analytics?: {
    provider: string;
    apiKey?: string;
  };
  storage?: {
    provider: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

export interface ProviderRegistry {
  kyc: KycProvider;
  esign: EsignProvider;
  payments: PaymentsProvider;
  email: EmailProvider;
  analytics: AnalyticsProvider;
  storage: StorageProvider;
}

export function getProviders(orgConfig?: OrganizationProviderConfig): ProviderRegistry {
  return {
    kyc: orgConfig?.kyc 
      ? createKycProvider({ 
          provider: orgConfig.kyc.provider as "persona" | "jumio" | "onfido" | "sumsub",
          apiKey: orgConfig.kyc.apiKey,
          templateId: orgConfig.kyc.templateId,
          environmentId: orgConfig.kyc.environmentId,
        }) 
      : getKycProvider(),
    esign: orgConfig?.esign 
      ? createEsignProvider({ 
          provider: orgConfig.esign.provider as "fundroomsign" | "dropboxsign" | "docusign" | "pandadoc",
          apiKey: orgConfig.esign.apiKey,
        }) 
      : getEsignProvider(),
    payments: orgConfig?.payments
      ? createPaymentsProvider({ 
          provider: orgConfig.payments.provider as "plaid" | "stripe" | "dwolla" | "modern_treasury",
          clientId: orgConfig.payments.clientId,
          secret: orgConfig.payments.secret,
        })
      : getPaymentsProvider(),
    email: orgConfig?.email 
      ? createEmailProvider({ 
          provider: orgConfig.email.provider as "resend" | "sendgrid" | "postmark" | "ses",
          apiKey: orgConfig.email.apiKey,
          domain: orgConfig.email.domain,
        }) 
      : getEmailProvider(),
    analytics: orgConfig?.analytics
      ? createAnalyticsProvider({ 
          provider: orgConfig.analytics.provider as "tinybird" | "posthog" | "mixpanel" | "amplitude",
          apiKey: orgConfig.analytics.apiKey,
        })
      : getAnalyticsProvider(),
    storage: orgConfig?.storage
      ? createStorageProvider({ 
          provider: orgConfig.storage.provider as "replit" | "s3" | "r2" | "local",
          bucket: orgConfig.storage.bucket,
          region: orgConfig.storage.region,
          accessKeyId: orgConfig.storage.accessKeyId,
          secretAccessKey: orgConfig.storage.secretAccessKey,
        })
      : getStorageProvider(),
  };
}

export function getDefaultProviders(): ProviderRegistry {
  return {
    kyc: getKycProvider(),
    esign: getEsignProvider(),
    payments: getPaymentsProvider(),
    email: getEmailProvider(),
    analytics: getAnalyticsProvider(),
    storage: getStorageProvider(),
  };
}
