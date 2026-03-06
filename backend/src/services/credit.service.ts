import { PrismaClient } from '@prisma/client';

export const GUEST_DAILY_CREDIT_LIMIT = 100;
export const MANAGER_DAILY_CREDIT_LIMIT = 5000;
export const GUEST_TRACK_COST = 10;
export const VOTE_REACTION_COST = 5;

/** Logto role names that grant elevated credits */
const ELEVATED_ROLES = ['manager', 'super admin'];

/** Determine the correct daily credit total based on Logto roles */
function creditLimitForRoles(roles: string[]): number {
  const lower = roles.map((r) => r.toLowerCase());
  if (lower.some((r) => ELEVATED_ROLES.includes(r))) {
    return MANAGER_DAILY_CREDIT_LIMIT;
  }
  return GUEST_DAILY_CREDIT_LIMIT;
}

const prisma = new PrismaClient();

export class CreditError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'CreditError';
  }
}

export interface CreditState {
  totalCredits: number;
  currentCredits: number;
  refreshDate: string;
}

class CreditService {
  private todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isBefore(dateString: string, reference: string): boolean {
    if (!dateString) return true;
    const candidate = new Date(dateString);
    if (Number.isNaN(candidate.getTime())) return true;
    const baseline = new Date(`${reference}T00:00:00Z`);
    return candidate < baseline;
  }

  /**
   * Load (or create) credit state for a user, auto-refreshing if a new day.
   * When `roles` are provided the daily total is derived from the user's
   * Logto roles (Manager / Super Admin → 5 000, everyone else → 100).
   */
  private async loadAndNormalize(userId: string, roles?: string[]): Promise<CreditState> {
    const today = this.todayDateString();
    const roleLimit = roles ? creditLimitForRoles(roles) : null;

    let record = await prisma.userCredit.findUnique({
      where: { userId },
    });

    if (!record) {
      const initialTotal = roleLimit ?? GUEST_DAILY_CREDIT_LIMIT;
      record = await prisma.userCredit.create({
        data: {
          userId,
          totalCredits: initialTotal,
          currentCredits: initialTotal,
          refreshDate: today,
        },
      });
    }

    const creditsDisabled = record.totalCredits === -1;

    if (creditsDisabled) {
      if (record.currentCredits !== 0 || record.refreshDate !== today) {
        record = await prisma.userCredit.update({
          where: { userId },
          data: { currentCredits: 0, refreshDate: today },
        });
      }
      return {
        totalCredits: -1,
        currentCredits: 0,
        refreshDate: today,
      };
    }

    let total = record.totalCredits;
    let current = record.currentCredits;
    let refreshDate = record.refreshDate;
    let changed = false;

    // Upgrade total when the user's role grants more than what is stored
    if (roleLimit !== null && roleLimit > total && total !== -1) {
      total = roleLimit;
      changed = true;
    }

    if (total <= 0 || total < GUEST_DAILY_CREDIT_LIMIT) {
      total = GUEST_DAILY_CREDIT_LIMIT;
      changed = true;
    }

    if (!refreshDate || this.isBefore(refreshDate, today)) {
      current = total;
      refreshDate = today;
      changed = true;
    }

    if (current > total) {
      current = total;
      changed = true;
    }
    if (current < 0) {
      current = 0;
      changed = true;
    }

    if (changed) {
      await prisma.userCredit.update({
        where: { userId },
        data: { totalCredits: total, currentCredits: current, refreshDate },
      });
    }

    return { totalCredits: total, currentCredits: current, refreshDate };
  }

  async ensureDailyCredits(userId: string, roles?: string[]): Promise<CreditState> {
    return this.loadAndNormalize(userId, roles);
  }

  async spendCredits(userId: string, amount: number, roles?: string[]): Promise<CreditState> {
    const spendAmount = Math.floor(amount);
    if (!Number.isFinite(spendAmount) || spendAmount <= 0) {
      throw new CreditError('Credit amount must be greater than zero');
    }

    const state = await this.loadAndNormalize(userId, roles);

    if (state.totalCredits === -1) {
      throw new CreditError('Credits are disabled for this user.', 403);
    }

    if (state.currentCredits < spendAmount) {
      throw new CreditError(
        'Not enough credits remaining to add this track. Credits refresh daily.',
        403,
      );
    }

    const nextCurrent = state.currentCredits - spendAmount;

    await prisma.userCredit.update({
      where: { userId },
      data: { currentCredits: nextCurrent },
    });

    return {
      totalCredits: state.totalCredits,
      currentCredits: nextCurrent,
      refreshDate: state.refreshDate,
    };
  }

  async addCredits(
    userId: string,
    amount: number,
    options?: { increaseTotal?: boolean },
  ): Promise<CreditState> {
    const addAmount = Math.floor(amount);
    if (!Number.isFinite(addAmount) || addAmount <= 0) {
      throw new CreditError('Credit amount must be greater than zero');
    }

    const state = await this.loadAndNormalize(userId);

    if (state.totalCredits === -1) {
      throw new CreditError('Credits are disabled for this user.', 403);
    }

    const nextTotal = options?.increaseTotal
      ? state.totalCredits + addAmount
      : state.totalCredits;
    const nextCurrent = Math.min(nextTotal, state.currentCredits + addAmount);

    await prisma.userCredit.update({
      where: { userId },
      data: {
        totalCredits: nextTotal,
        currentCredits: nextCurrent,
      },
    });

    return {
      totalCredits: nextTotal,
      currentCredits: nextCurrent,
      refreshDate: state.refreshDate,
    };
  }

  async setTotalCredits(
    userId: string,
    total: number,
    options?: { refill?: boolean },
  ): Promise<CreditState> {
    const requestedTotal = Math.floor(total);
    if (!Number.isFinite(requestedTotal)) {
      throw new CreditError('Total credits must be greater than zero');
    }

    const normalizedTotal =
      requestedTotal === -1
        ? -1
        : requestedTotal <= 0
          ? GUEST_DAILY_CREDIT_LIMIT
          : Math.max(requestedTotal, GUEST_DAILY_CREDIT_LIMIT);

    if (normalizedTotal === 0) {
      throw new CreditError('Total credits must be greater than zero');
    }

    const state = await this.loadAndNormalize(userId);
    const refill = options?.refill ?? true;
    const today = this.todayDateString();

    const nextCurrent =
      normalizedTotal === -1
        ? 0
        : refill
          ? normalizedTotal
          : Math.min(state.currentCredits, normalizedTotal);

    const nextRefresh =
      normalizedTotal === -1
        ? today
        : refill
          ? today
          : state.refreshDate;

    await prisma.userCredit.update({
      where: { userId },
      data: {
        totalCredits: normalizedTotal,
        currentCredits: nextCurrent,
        refreshDate: nextRefresh,
      },
    });

    return {
      totalCredits: normalizedTotal,
      currentCredits: nextCurrent,
      refreshDate: nextRefresh,
    };
  }
}

export const creditService = new CreditService();
