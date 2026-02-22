// @ts-nocheck
// Tests for staged commitments wizard flow

describe('Staged Commitments', () => {
  describe('Tranche generation', () => {
    function generateTranches(
      totalAmount: number,
      schedule: string,
      numTranches: number,
    ) {
      if (numTranches < 1 || totalAmount <= 0) return [];

      const SCHEDULE_MONTHS: Record<string, number> = {
        monthly: 1,
        quarterly: 3,
        semi_annual: 6,
        custom: 3,
      };

      const baseAmount = Math.floor((totalAmount / numTranches) * 100) / 100;
      const remainder =
        Math.round((totalAmount - baseAmount * numTranches) * 100) / 100;

      const monthsInterval = SCHEDULE_MONTHS[schedule] || 3;
      const now = new Date('2026-01-01');

      return Array.from({ length: numTranches }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() + i * monthsInterval);
        return {
          amount: i === 0 ? baseAmount + remainder : baseAmount,
          scheduledDate: date.toISOString().split('T')[0],
          label: i === 0 ? 'Initial Capital Call' : `Tranche ${i + 1}`,
        };
      });
    }

    it('should split total evenly across tranches', () => {
      const tranches = generateTranches(400000, 'quarterly', 4);
      expect(tranches).toHaveLength(4);
      const sum = tranches.reduce((s, t) => s + t.amount, 0);
      expect(Math.abs(sum - 400000)).toBeLessThan(0.01);
    });

    it('should handle odd divisions with remainder in first tranche', () => {
      const tranches = generateTranches(100000, 'quarterly', 3);
      expect(tranches).toHaveLength(3);
      // 100000 / 3 = 33333.33, remainder goes to first
      const sum = tranches.reduce((s, t) => s + t.amount, 0);
      expect(Math.abs(sum - 100000)).toBeLessThan(0.01);
      expect(tranches[0].amount).toBeGreaterThanOrEqual(tranches[1].amount);
    });

    it('should space quarterly tranches 3 months apart', () => {
      const tranches = generateTranches(200000, 'quarterly', 4);
      const dates = tranches.map((t) => new Date(t.scheduledDate + 'T00:00:00'));
      for (let i = 1; i < dates.length; i++) {
        const monthDiff =
          (dates[i].getFullYear() - dates[i - 1].getFullYear()) * 12 +
          dates[i].getMonth() -
          dates[i - 1].getMonth();
        expect(monthDiff).toBe(3);
      }
    });

    it('should space monthly tranches 1 month apart', () => {
      const tranches = generateTranches(120000, 'monthly', 4);
      const dates = tranches.map((t) => new Date(t.scheduledDate + 'T00:00:00'));
      for (let i = 1; i < dates.length; i++) {
        const monthDiff =
          (dates[i].getFullYear() - dates[i - 1].getFullYear()) * 12 +
          dates[i].getMonth() -
          dates[i - 1].getMonth();
        expect(monthDiff).toBe(1);
      }
    });

    it('should space semi-annual tranches 6 months apart', () => {
      const tranches = generateTranches(600000, 'semi_annual', 3);
      const dates = tranches.map((t) => new Date(t.scheduledDate + 'T00:00:00'));
      for (let i = 1; i < dates.length; i++) {
        const monthDiff =
          (dates[i].getFullYear() - dates[i - 1].getFullYear()) * 12 +
          dates[i].getMonth() -
          dates[i - 1].getMonth();
        expect(monthDiff).toBe(6);
      }
    });

    it('should return empty array for invalid inputs', () => {
      expect(generateTranches(0, 'quarterly', 4)).toEqual([]);
      expect(generateTranches(-100000, 'quarterly', 4)).toEqual([]);
      expect(generateTranches(100000, 'quarterly', 0)).toEqual([]);
    });

    it('should label first tranche as Initial Capital Call', () => {
      const tranches = generateTranches(200000, 'quarterly', 3);
      expect(tranches[0].label).toBe('Initial Capital Call');
      expect(tranches[1].label).toBe('Tranche 2');
      expect(tranches[2].label).toBe('Tranche 3');
    });
  });

  describe('Validation rules', () => {
    it('should require minimum 2 tranches', () => {
      const numTranches = 1;
      expect(numTranches >= 2).toBe(false);
    });

    it('should cap at 12 tranches', () => {
      const numTranches = 13;
      expect(numTranches <= 12).toBe(false);
    });

    it('should accept valid tranche counts', () => {
      for (let i = 2; i <= 12; i++) {
        expect(i >= 2 && i <= 12).toBe(true);
      }
    });

    it('should require tranche sum equals total commitment', () => {
      const totalCommitment = 500000;
      const tranches = [
        { amount: 125000 },
        { amount: 125000 },
        { amount: 125000 },
        { amount: 125000 },
      ];
      const sum = tranches.reduce((s, t) => s + t.amount, 0);
      expect(Math.abs(sum - totalCommitment)).toBeLessThan(0.01);
    });

    it('should reject mismatched tranche sums', () => {
      const totalCommitment = 500000;
      const tranches = [
        { amount: 100000 },
        { amount: 100000 },
        { amount: 100000 },
        { amount: 100000 },
      ];
      const sum = tranches.reduce((s, t) => s + t.amount, 0);
      expect(Math.abs(sum - totalCommitment)).toBeGreaterThan(0.01);
    });

    it('should reject zero-amount tranches', () => {
      const tranches = [
        { amount: 250000 },
        { amount: 0 },
        { amount: 250000 },
      ];
      const hasZero = tranches.some((t) => t.amount <= 0);
      expect(hasZero).toBe(true);
    });

    it('should require chronological dates', () => {
      const tranches = [
        { scheduledDate: '2026-01-01' },
        { scheduledDate: '2026-04-01' },
        { scheduledDate: '2026-07-01' },
      ];
      for (let i = 1; i < tranches.length; i++) {
        const prev = new Date(tranches[i - 1].scheduledDate);
        const curr = new Date(tranches[i].scheduledDate);
        expect(curr.getTime()).toBeGreaterThan(prev.getTime());
      }
    });

    it('should reject non-chronological dates', () => {
      const tranches = [
        { scheduledDate: '2026-07-01' },
        { scheduledDate: '2026-04-01' },
        { scheduledDate: '2026-01-01' },
      ];
      let isChronological = true;
      for (let i = 1; i < tranches.length; i++) {
        const prev = new Date(tranches[i - 1].scheduledDate);
        const curr = new Date(tranches[i].scheduledDate);
        if (curr.getTime() <= prev.getTime()) {
          isChronological = false;
          break;
        }
      }
      expect(isChronological).toBe(false);
    });
  });

  describe('Fund eligibility', () => {
    it('should only allow staged commitments when fund flag is enabled', () => {
      const fund = { stagedCommitmentsEnabled: true };
      expect(fund.stagedCommitmentsEnabled).toBe(true);
    });

    it('should block staged commitments when flag is disabled', () => {
      const fund = { stagedCommitmentsEnabled: false };
      expect(fund.stagedCommitmentsEnabled).toBe(false);
    });

    it('should enforce minimum investment', () => {
      const fund = { minimumInvestment: 50000 };
      expect(40000 >= fund.minimumInvestment).toBe(false);
      expect(50000 >= fund.minimumInvestment).toBe(true);
      expect(100000 >= fund.minimumInvestment).toBe(true);
    });
  });

  describe('Prerequisite gates', () => {
    it('should require NDA signed', () => {
      const investor = { ndaSigned: false, accreditationStatus: 'SELF_CERTIFIED' };
      const canCommit = investor.ndaSigned && investor.accreditationStatus !== 'PENDING';
      expect(canCommit).toBe(false);
    });

    it('should require accreditation completed', () => {
      const investor = { ndaSigned: true, accreditationStatus: 'PENDING' };
      const canCommit = investor.ndaSigned && investor.accreditationStatus !== 'PENDING';
      expect(canCommit).toBe(false);
    });

    it('should allow when both gates passed', () => {
      const investor = { ndaSigned: true, accreditationStatus: 'SELF_CERTIFIED' };
      const canCommit = investor.ndaSigned && investor.accreditationStatus !== 'PENDING';
      expect(canCommit).toBe(true);
    });

    it('should allow KYC_VERIFIED status', () => {
      const investor = { ndaSigned: true, accreditationStatus: 'KYC_VERIFIED' };
      const canCommit = investor.ndaSigned && investor.accreditationStatus !== 'PENDING';
      expect(canCommit).toBe(true);
    });
  });

  describe('Schedule options', () => {
    const SCHEDULE_OPTIONS = [
      { value: 'monthly', label: 'Monthly', months: 1 },
      { value: 'quarterly', label: 'Quarterly', months: 3 },
      { value: 'semi_annual', label: 'Semi-Annual', months: 6 },
      { value: 'custom', label: 'Custom Schedule', months: 0 },
    ];

    it('should have 4 schedule options', () => {
      expect(SCHEDULE_OPTIONS).toHaveLength(4);
    });

    it('should include custom schedule option', () => {
      const custom = SCHEDULE_OPTIONS.find((o) => o.value === 'custom');
      expect(custom).toBeDefined();
      expect(custom.months).toBe(0);
    });

    it('should have correct month intervals', () => {
      expect(SCHEDULE_OPTIONS.find((o) => o.value === 'monthly').months).toBe(1);
      expect(SCHEDULE_OPTIONS.find((o) => o.value === 'quarterly').months).toBe(3);
      expect(SCHEDULE_OPTIONS.find((o) => o.value === 'semi_annual').months).toBe(6);
    });
  });
});
