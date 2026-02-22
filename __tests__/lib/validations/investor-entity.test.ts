/**
 * Tests for investor entity validation schemas
 *
 * Prompt 9: Investor Entity Architecture — validates all 5 entity types
 * (Individual, LLC, Trust, Retirement, Other) plus shared address schemas.
 */

import {
  addressSchema,
  individualSchema,
  llcSchema,
  trustSchema,
  retirementSchema,
  otherEntitySchema,
  investorEntitySchema,
} from "@/lib/validations/investor-entity";

describe("addressSchema", () => {
  it("accepts a valid US address", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid address with line 2", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      street2: "Suite 100",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(true);
  });

  it("rejects PO Box in street1", () => {
    const result = addressSchema.safeParse({
      street1: "PO Box 123",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects P.O. Box in street1", () => {
    const result = addressSchema.safeParse({
      street1: "P.O. Box 456",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects PMB in street2", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      street2: "PMB 100",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing street1", () => {
    const result = addressSchema.safeParse({
      street1: "",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ZIP format", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "1234",
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ZIP+4 format", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001-1234",
      country: "US",
    });
    expect(result.success).toBe(true);
  });

  it("defaults country to US", () => {
    const result = addressSchema.safeParse({
      street1: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe("US");
    }
  });
});

describe("individualSchema", () => {
  const validIndividual = {
    entityType: "INDIVIDUAL" as const,
    firstName: "John",
    lastName: "Smith",
    address: {
      street1: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "US",
    },
  };

  it("accepts valid individual data", () => {
    const result = individualSchema.safeParse(validIndividual);
    expect(result.success).toBe(true);
  });

  it("accepts individual with SSN", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      ssn: "123-45-6789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts SSN without dashes", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      ssn: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid SSN format", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      ssn: "12-345-6789",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing first name", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing last name", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = individualSchema.safeParse({
      ...validIndividual,
      dateOfBirth: "1990-01-15",
      phone: "555-123-4567",
      useMailingAddress: true,
      mailingAddress: {
        street1: "456 Other Street",
        city: "Boston",
        state: "MA",
        zip: "02101",
        country: "US",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("llcSchema", () => {
  const validLLC = {
    entityType: "LLC" as const,
    legalName: "Smith Holdings LLC",
    address: {
      street1: "100 Business Ave",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
      country: "US",
    },
    signatoryName: "John Smith",
    signatoryTitle: "Managing Member",
    signatoryEmail: "john@smithholdings.com",
  };

  it("accepts valid LLC data", () => {
    const result = llcSchema.safeParse(validLLC);
    expect(result.success).toBe(true);
  });

  it("accepts LLC with all optional fields", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      ein: "12-3456789",
      stateOfFormation: "DE",
      dateOfFormation: "2020-01-01",
      countryOfFormation: "US",
      taxClassification: "PARTNERSHIP",
      signatoryPhone: "555-123-4567",
      signatoryIsAccountHolder: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid EIN format", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      ein: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid EIN format", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      ein: "123-45-6789",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing legal name", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      legalName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing signatory name", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      signatoryName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing signatory email", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      signatoryEmail: "",
    });
    expect(result.success).toBe(false);
  });

  it("validates tax classification enum", () => {
    const result = llcSchema.safeParse({
      ...validLLC,
      taxClassification: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid tax classifications", () => {
    for (const tc of ["DISREGARDED_ENTITY", "PARTNERSHIP", "S_CORPORATION", "C_CORPORATION"]) {
      const result = llcSchema.safeParse({
        ...validLLC,
        taxClassification: tc,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("trustSchema", () => {
  const validTrust = {
    entityType: "TRUST" as const,
    legalName: "Smith Family Trust",
    address: {
      street1: "123 Trust Lane",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "US",
    },
    trusteeName: "Jane Smith",
    trusteeEmail: "jane@smithtrust.com",
  };

  it("accepts valid trust data", () => {
    const result = trustSchema.safeParse(validTrust);
    expect(result.success).toBe(true);
  });

  it("accepts trust with all optional fields", () => {
    const result = trustSchema.safeParse({
      ...validTrust,
      trustType: "REVOCABLE_LIVING",
      taxId: "123456789",
      dateEstablished: "2015-03-01",
      governingState: "IL",
      trusteeTitle: "Trustee",
      trusteePhone: "555-987-6543",
    });
    expect(result.success).toBe(true);
  });

  it("validates all trust types", () => {
    for (const tt of ["REVOCABLE_LIVING", "IRREVOCABLE", "FAMILY", "CHARITABLE", "OTHER"]) {
      const result = trustSchema.safeParse({
        ...validTrust,
        trustType: tt,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid trust type", () => {
    const result = trustSchema.safeParse({
      ...validTrust,
      trustType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing legal name", () => {
    const result = trustSchema.safeParse({
      ...validTrust,
      legalName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing trustee name", () => {
    const result = trustSchema.safeParse({
      ...validTrust,
      trusteeName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid trustee email", () => {
    const result = trustSchema.safeParse({
      ...validTrust,
      trusteeEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("defaults trustee title to Trustee", () => {
    const result = trustSchema.safeParse(validTrust);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trusteeTitle).toBe("Trustee");
    }
  });
});

describe("retirementSchema", () => {
  const validRetirement = {
    entityType: "RETIREMENT" as const,
    accountType: "TRADITIONAL_IRA" as const,
    accountTitle: "FBO John Smith",
    custodianName: "Fidelity",
    custodianAccountNumber: "ACCT-12345",
    accountHolderName: "John Smith",
  };

  it("accepts valid retirement data", () => {
    const result = retirementSchema.safeParse(validRetirement);
    expect(result.success).toBe(true);
  });

  it("validates all account types", () => {
    for (const at of ["TRADITIONAL_IRA", "ROTH_IRA", "SOLO_401K", "SEP_IRA", "SIMPLE_IRA"]) {
      const result = retirementSchema.safeParse({
        ...validRetirement,
        accountType: at,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid account type", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      accountType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing account title", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      accountTitle: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing custodian name", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      custodianName: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid custodian EIN", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      custodianEin: "12-3456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid custodian EIN", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      custodianEin: "123-45-6789",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid account holder SSN", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      accountHolderSsn: "123-45-6789",
    });
    expect(result.success).toBe(true);
  });

  it("defaults custodianCoSignRequired to true", () => {
    const result = retirementSchema.safeParse(validRetirement);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.custodianCoSignRequired).toBe(true);
    }
  });

  it("accepts full retirement data with custodian address", () => {
    const result = retirementSchema.safeParse({
      ...validRetirement,
      custodianEin: "12-3456789",
      custodianAddress: {
        street1: "100 Financial Blvd",
        city: "Boston",
        state: "MA",
        zip: "02110",
        country: "US",
      },
      custodianContactName: "Account Services",
      custodianContactPhone: "800-123-4567",
      custodianContactEmail: "accounts@fidelity.com",
      accountHolderSsn: "123-45-6789",
      accountHolderDob: "1965-03-15",
      accountHolderPhone: "555-222-3333",
      accountHolderEmail: "john@example.com",
      custodianCoSignRequired: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("otherEntitySchema", () => {
  const validOther = {
    entityType: "OTHER" as const,
    legalName: "Smith Capital Partners LP",
    address: {
      street1: "200 Finance Way",
      city: "Houston",
      state: "TX",
      zip: "77002",
      country: "US",
    },
    signatoryName: "Robert Smith",
    signatoryTitle: "General Partner",
    signatoryEmail: "robert@smithcapital.com",
  };

  it("accepts valid other entity data", () => {
    const result = otherEntitySchema.safeParse(validOther);
    expect(result.success).toBe(true);
  });

  it("validates all other entity types", () => {
    for (const et of [
      "CORPORATION",
      "LIMITED_PARTNERSHIP",
      "GENERAL_PARTNERSHIP",
      "S_CORPORATION",
      "NON_PROFIT",
      "FOREIGN_ENTITY",
      "OTHER",
    ]) {
      const result = otherEntitySchema.safeParse({
        ...validOther,
        otherEntityType: et,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid entity type", () => {
    const result = otherEntitySchema.safeParse({
      ...validOther,
      otherEntityType: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = otherEntitySchema.safeParse({
      ...validOther,
      otherEntityType: "LIMITED_PARTNERSHIP",
      ein: "98-7654321",
      stateOfFormation: "TX",
      countryOfFormation: "US",
      dateOfFormation: "2018-06-01",
      taxClassification: "PARTNERSHIP",
      signatoryPhone: "555-444-5555",
    });
    expect(result.success).toBe(true);
  });

  it("defaults country to US", () => {
    const result = otherEntitySchema.safeParse(validOther);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countryOfFormation).toBe("US");
    }
  });
});

describe("investorEntitySchema (discriminated union)", () => {
  it("correctly discriminates INDIVIDUAL", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      address: {
        street1: "123 Main Street",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe("INDIVIDUAL");
    }
  });

  it("correctly discriminates LLC", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "LLC",
      legalName: "Test LLC",
      address: {
        street1: "100 Business Ave",
        city: "SF",
        state: "CA",
        zip: "94105",
      },
      signatoryName: "Jane Doe",
      signatoryTitle: "Manager",
      signatoryEmail: "jane@test.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe("LLC");
    }
  });

  it("correctly discriminates TRUST", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "TRUST",
      legalName: "Test Trust",
      address: {
        street1: "123 Trust Lane",
        city: "Chicago",
        state: "IL",
        zip: "60601",
      },
      trusteeName: "Jane Doe",
      trusteeEmail: "jane@trust.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe("TRUST");
    }
  });

  it("correctly discriminates RETIREMENT", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "RETIREMENT",
      accountType: "ROTH_IRA",
      accountTitle: "FBO Test",
      custodianName: "Schwab",
      custodianAccountNumber: "12345",
      accountHolderName: "Test Person",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe("RETIREMENT");
    }
  });

  it("correctly discriminates OTHER", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "OTHER",
      legalName: "Test Corp",
      address: {
        street1: "100 Corp Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75201",
      },
      signatoryName: "Bob Jones",
      signatoryTitle: "Director",
      signatoryEmail: "bob@corp.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe("OTHER");
    }
  });

  it("rejects invalid entity type", () => {
    const result = investorEntitySchema.safeParse({
      entityType: "INVALID",
      firstName: "John",
      lastName: "Smith",
    });
    expect(result.success).toBe(false);
  });
});
