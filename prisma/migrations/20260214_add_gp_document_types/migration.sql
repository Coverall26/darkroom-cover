-- Add new document types for GP uploads: Formation Docs, Power of Attorney, Trust Documents, Custodian Documents
ALTER TYPE "LPDocumentType" ADD VALUE IF NOT EXISTS 'FORMATION_DOCS';
ALTER TYPE "LPDocumentType" ADD VALUE IF NOT EXISTS 'POWER_OF_ATTORNEY';
ALTER TYPE "LPDocumentType" ADD VALUE IF NOT EXISTS 'TRUST_DOCUMENTS';
ALTER TYPE "LPDocumentType" ADD VALUE IF NOT EXISTS 'CUSTODIAN_DOCUMENTS';
