// @ts-nocheck
// Tests for KYC provider flexibility: factory, adapters, and configuration

import {
  createKycProvider,
  getKycProvider,
  resetKycProvider,
  PersonaKycProvider,
  PlaidIdentityKycProvider,
  ParallelMarketsKycProvider,
  VerifyInvestorKycProvider,
  KYC_PROVIDER_DB_MAP,
  KYC_PROVIDER_TO_DB,
} from '@/lib/providers/kyc';

describe('KYC Provider Flexibility', () => {
  beforeEach(() => {
    resetKycProvider();
  });

  describe('Provider factory', () => {
    it('should create Persona provider by default', () => {
      const provider = createKycProvider({ provider: 'persona' });
      expect(provider).toBeInstanceOf(PersonaKycProvider);
      expect(provider.name).toBe('Persona');
      expect(provider.type).toBe('persona');
    });

    it('should create Plaid Identity provider', () => {
      const provider = createKycProvider({ provider: 'plaid_identity' });
      expect(provider).toBeInstanceOf(PlaidIdentityKycProvider);
      expect(provider.name).toBe('Plaid Identity');
      expect(provider.type).toBe('plaid_identity');
    });

    it('should create Parallel Markets provider', () => {
      const provider = createKycProvider({ provider: 'parallel_markets' });
      expect(provider).toBeInstanceOf(ParallelMarketsKycProvider);
      expect(provider.name).toBe('Parallel Markets');
      expect(provider.type).toBe('parallel_markets');
    });

    it('should create Verify Investor provider', () => {
      const provider = createKycProvider({ provider: 'verify_investor' });
      expect(provider).toBeInstanceOf(VerifyInvestorKycProvider);
      expect(provider.name).toBe('Verify Investor');
      expect(provider.type).toBe('verify_investor');
    });

    it('should throw for unimplemented providers', () => {
      expect(() => createKycProvider({ provider: 'jumio' })).toThrow(
        'KYC provider "jumio" is not yet implemented'
      );
      expect(() => createKycProvider({ provider: 'onfido' })).toThrow(
        'KYC provider "onfido" is not yet implemented'
      );
    });

    it('should throw for unsupported providers', () => {
      expect(() => createKycProvider({ provider: 'nonexistent' as any })).toThrow(
        'Unsupported KYC provider'
      );
    });
  });

  describe('Provider interface compliance', () => {
    const providers = [
      { type: 'persona' as const, Class: PersonaKycProvider },
      { type: 'plaid_identity' as const, Class: PlaidIdentityKycProvider },
      { type: 'parallel_markets' as const, Class: ParallelMarketsKycProvider },
      { type: 'verify_investor' as const, Class: VerifyInvestorKycProvider },
    ];

    for (const { type, Class } of providers) {
      describe(`${type} provider`, () => {
        let provider: any;

        beforeEach(() => {
          provider = new Class({
            apiKey: 'test-key',
            templateId: 'test-template',
            environmentId: 'test-env',
            webhookSecret: 'test-secret',
          });
        });

        it('should implement name property', () => {
          expect(typeof provider.name).toBe('string');
          expect(provider.name.length).toBeGreaterThan(0);
        });

        it('should implement type property', () => {
          expect(provider.type).toBe(type);
        });

        it('should implement isConfigured()', () => {
          expect(typeof provider.isConfigured).toBe('function');
          expect(provider.isConfigured()).toBe(true);
        });

        it('should report unconfigured when missing keys', () => {
          // Override env vars to ensure empty config
          const saved = { ...process.env };
          delete process.env.PERSONA_API_KEY;
          delete process.env.PERSONA_TEMPLATE_ID;
          delete process.env.PERSONA_ENVIRONMENT_ID;
          delete process.env.PLAID_SECRET;
          delete process.env.PLAID_CLIENT_ID;
          delete process.env.PLAID_IDV_TEMPLATE_ID;
          delete process.env.PARALLEL_MARKETS_API_KEY;
          delete process.env.PARALLEL_MARKETS_CLIENT_ID;
          delete process.env.VERIFY_INVESTOR_API_KEY;
          delete process.env.VERIFY_INVESTOR_OFFERING_ID;
          delete process.env.VERIFY_INVESTOR_CLIENT_ID;

          const emptyProvider = new Class({});
          expect(emptyProvider.isConfigured()).toBe(false);

          Object.assign(process.env, saved);
        });

        it('should implement startVerification()', () => {
          expect(typeof provider.startVerification).toBe('function');
        });

        it('should implement getStatus()', () => {
          expect(typeof provider.getStatus).toBe('function');
        });

        it('should implement resumeSession()', () => {
          expect(typeof provider.resumeSession).toBe('function');
        });

        it('should implement verifyWebhookSignature()', () => {
          expect(typeof provider.verifyWebhookSignature).toBe('function');
        });

        it('should implement parseWebhookEvent()', () => {
          expect(typeof provider.parseWebhookEvent).toBe('function');
        });

        it('should implement getEmbeddedConfig()', () => {
          expect(typeof provider.getEmbeddedConfig).toBe('function');
          const config = provider.getEmbeddedConfig();
          expect(config).toHaveProperty('environmentId');
          expect(config).toHaveProperty('templateId');
        });
      });
    }
  });

  describe('Webhook signature verification', () => {
    const providers = [
      new PersonaKycProvider({ webhookSecret: 'test-secret-123' }),
      new PlaidIdentityKycProvider({ webhookSecret: 'test-secret-123' }),
      new ParallelMarketsKycProvider({ webhookSecret: 'test-secret-123' }),
      new VerifyInvestorKycProvider({ webhookSecret: 'test-secret-123' }),
    ];

    for (const provider of providers) {
      it(`${provider.name}: should reject invalid signatures`, () => {
        expect(provider.verifyWebhookSignature('payload', 'invalid')).toBe(false);
      });

      it(`${provider.name}: should reject empty signatures`, () => {
        expect(provider.verifyWebhookSignature('payload', '')).toBe(false);
      });
    }
  });

  describe('DB mapping constants', () => {
    it('should map DB values to provider types', () => {
      expect(KYC_PROVIDER_DB_MAP.PERSONA).toBe('persona');
      expect(KYC_PROVIDER_DB_MAP.PLAID).toBe('plaid_identity');
      expect(KYC_PROVIDER_DB_MAP.PARALLEL_MARKETS).toBe('parallel_markets');
      expect(KYC_PROVIDER_DB_MAP.VERIFY_INVESTOR).toBe('verify_investor');
    });

    it('should map provider types to DB values', () => {
      expect(KYC_PROVIDER_TO_DB.persona).toBe('PERSONA');
      expect(KYC_PROVIDER_TO_DB.plaid_identity).toBe('PLAID');
      expect(KYC_PROVIDER_TO_DB.parallel_markets).toBe('PARALLEL_MARKETS');
      expect(KYC_PROVIDER_TO_DB.verify_investor).toBe('VERIFY_INVESTOR');
    });

    it('should be symmetric mappings', () => {
      for (const [dbValue, providerType] of Object.entries(KYC_PROVIDER_DB_MAP)) {
        expect(KYC_PROVIDER_TO_DB[providerType]).toBe(dbValue);
      }
    });
  });

  describe('Singleton cache behavior', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      resetKycProvider();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should cache provider instance', () => {
      process.env.KYC_PROVIDER = 'persona';
      process.env.PERSONA_API_KEY = 'test';
      process.env.PERSONA_TEMPLATE_ID = 'tmpl';

      const provider1 = getKycProvider();
      const provider2 = getKycProvider();
      expect(provider1).toBe(provider2);
    });

    it('should reset cache and create new instance', () => {
      process.env.KYC_PROVIDER = 'persona';
      process.env.PERSONA_API_KEY = 'test';
      process.env.PERSONA_TEMPLATE_ID = 'tmpl';

      const provider1 = getKycProvider();
      resetKycProvider();
      const provider2 = getKycProvider();
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('Plaid Identity status mapping', () => {
    it('should create provider with correct type', () => {
      const provider = new PlaidIdentityKycProvider({
        apiKey: 'test',
        environmentId: 'client-id',
      });
      expect(provider.type).toBe('plaid_identity');
      expect(provider.name).toBe('Plaid Identity');
    });
  });

  describe('Parallel Markets status mapping', () => {
    it('should create provider with correct type', () => {
      const provider = new ParallelMarketsKycProvider({
        apiKey: 'test',
        environmentId: 'client-id',
      });
      expect(provider.type).toBe('parallel_markets');
      expect(provider.name).toBe('Parallel Markets');
    });
  });

  describe('Verify Investor configuration', () => {
    it('should create provider with correct type', () => {
      const provider = new VerifyInvestorKycProvider({
        apiKey: 'test',
        templateId: 'offering-id',
      });
      expect(provider.type).toBe('verify_investor');
      expect(provider.name).toBe('Verify Investor');
    });

    it('should report configured when API key and template provided', () => {
      const provider = new VerifyInvestorKycProvider({
        apiKey: 'test-key',
        templateId: 'test-offering',
      });
      expect(provider.isConfigured()).toBe(true);
    });

    it('should report unconfigured without API key', () => {
      const provider = new VerifyInvestorKycProvider({
        templateId: 'test-offering',
      });
      expect(provider.isConfigured()).toBe(false);
    });
  });
});
