import { clerkClient } from '../lib/clerk';

export const GUEST_DAILY_CREDIT_LIMIT = 100;
export const GUEST_TRACK_COST = 10;
export const VOTE_REACTION_COST = 5;

const CREDIT_TOTAL_KEY = 'djCreditsTotal';
const CREDIT_CURRENT_KEY = 'djCreditsCurrent';
const CREDIT_REFRESH_KEY = 'djCreditsRefreshDate';

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
  private readonly CACHE_TTL_MS = 30_000;
  private readonly MAX_RATE_LIMIT_RETRIES = 3;
  private cache = new Map<string, { state: CreditState; metadata: Record<string, unknown>; fetchedAt: number }>();
  private pendingLoads = new Map<string, Promise<{ state: CreditState; metadata: Record<string, unknown> }>>();

  private parseNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private todayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  private isBefore(dateString: string, reference: string) {
    if (!dateString) {
      return true;
    }

    const candidate = new Date(dateString);
    if (Number.isNaN(candidate.getTime())) {
      return true;
    }

    const baseline = new Date(`${reference}T00:00:00Z`);
    return candidate < baseline;
  }

  private isCacheFresh(entry: { state: CreditState; metadata: Record<string, unknown>; fetchedAt: number }, today: string) {
    if (Date.now() - entry.fetchedAt > this.CACHE_TTL_MS) {
      return false;
    }
    return entry.state.refreshDate >= today;
  }

  private setCache(userId: string, state: CreditState, metadata: Record<string, unknown>) {
    this.cache.set(userId, {
      state,
      metadata,
      fetchedAt: Date.now(),
    });
  }

  private extractRetryAfterSeconds(error: any, attempt: number) {
    const direct = Number(error?.retryAfter);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const metaRetry = Number(error?.errors?.[0]?.meta?.retry_after ?? error?.errors?.[0]?.meta?.retry_after_seconds);
    if (Number.isFinite(metaRetry) && metaRetry > 0) {
      return metaRetry;
    }

    // fallback backoff (in seconds)
    return Math.min(5, 0.5 * (attempt + 1));
  }

  private async delay(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async fetchAndNormalize(userId: string, attempt = 0): Promise<{ state: CreditState; metadata: Record<string, unknown> }> {
    try {
      const user = await clerkClient.users.getUser(userId);
      let metadata = { ...(user.privateMetadata ?? {}) } as Record<string, unknown>;

      let total = this.parseNumber(metadata[CREDIT_TOTAL_KEY], GUEST_DAILY_CREDIT_LIMIT);
      if (total <= 0) {
        total = GUEST_DAILY_CREDIT_LIMIT;
      }

      let current = this.parseNumber(metadata[CREDIT_CURRENT_KEY], total);
      let refreshDate = typeof metadata[CREDIT_REFRESH_KEY] === 'string'
        ? (metadata[CREDIT_REFRESH_KEY] as string)
        : '';

      const today = this.todayDateString();
      let changed = false;

      if (!refreshDate || this.isBefore(refreshDate, today)) {
        current = total;
        refreshDate = today;
        changed = true;
      }

      if (current > total) {
        current = total;
        changed = true;
      }

      if (changed || metadata[CREDIT_TOTAL_KEY] === undefined || metadata[CREDIT_CURRENT_KEY] === undefined || metadata[CREDIT_REFRESH_KEY] === undefined) {
        metadata = {
          ...metadata,
          [CREDIT_TOTAL_KEY]: total,
          [CREDIT_CURRENT_KEY]: current,
          [CREDIT_REFRESH_KEY]: refreshDate,
        };
        await clerkClient.users.updateUser(userId, {
          privateMetadata: metadata,
        });
      }

      const state: CreditState = {
        totalCredits: total,
        currentCredits: current,
        refreshDate,
      };

      return { state, metadata } as { state: CreditState; metadata: Record<string, unknown> };
    } catch (error: any) {
      if (error?.status === 429 && attempt < this.MAX_RATE_LIMIT_RETRIES) {
        const retryAfterSeconds = this.extractRetryAfterSeconds(error, attempt);
        await this.delay(Math.max(250, retryAfterSeconds * 1000));
        return this.fetchAndNormalize(userId, attempt + 1);
      }

      if (error?.status === 429) {
        throw new CreditError('Temporarily unable to verify credits. Please try again shortly.', 503);
      }

      throw error;
    }
  }

  private async loadAndNormalize(userId: string, options?: { force?: boolean }) {
    const force = Boolean(options?.force);
    const today = this.todayDateString();

    if (!force) {
      const cached = this.cache.get(userId);
      if (cached && this.isCacheFresh(cached, today)) {
        return { state: cached.state, metadata: cached.metadata };
      }
    }

    const pending = this.pendingLoads.get(userId);
    if (pending) {
      return pending;
    }

    const loadPromise = this.fetchAndNormalize(userId)
      .then((result) => {
        this.setCache(userId, result.state, result.metadata);
        return result;
      })
      .finally(() => {
        this.pendingLoads.delete(userId);
      });

    this.pendingLoads.set(userId, loadPromise);
    return loadPromise;
  }

  async ensureDailyCredits(userId: string): Promise<CreditState> {
    const { state } = await this.loadAndNormalize(userId);
    return state;
  }

  async spendCredits(userId: string, amount: number): Promise<CreditState> {
    const spendAmount = Math.floor(amount);
    if (!Number.isFinite(spendAmount) || spendAmount <= 0) {
      throw new CreditError('Credit amount must be greater than zero');
    }

  const { state, metadata } = await this.loadAndNormalize(userId, { force: true });

    if (state.currentCredits < spendAmount) {
      throw new CreditError('Not enough credits remaining to add this track. Credits refresh daily.', 403);
    }

    const nextState: CreditState = {
      totalCredits: state.totalCredits,
      currentCredits: state.currentCredits - spendAmount,
      refreshDate: state.refreshDate,
    };

    const updatedMetadata = {
      ...metadata,
      [CREDIT_TOTAL_KEY]: nextState.totalCredits,
      [CREDIT_CURRENT_KEY]: nextState.currentCredits,
      [CREDIT_REFRESH_KEY]: nextState.refreshDate,
    };

    await clerkClient.users.updateUser(userId, {
      privateMetadata: updatedMetadata,
    });

    this.setCache(userId, nextState, updatedMetadata);

    return nextState;
  }

  async addCredits(userId: string, amount: number, options?: { increaseTotal?: boolean }): Promise<CreditState> {
    const addAmount = Math.floor(amount);
    if (!Number.isFinite(addAmount) || addAmount <= 0) {
      throw new CreditError('Credit amount must be greater than zero');
    }

  const { state, metadata } = await this.loadAndNormalize(userId, { force: true });
    const nextTotal = options?.increaseTotal ? state.totalCredits + addAmount : state.totalCredits;
    const nextCurrent = Math.min(nextTotal, state.currentCredits + addAmount);

    const updatedMetadata = {
      ...metadata,
      [CREDIT_TOTAL_KEY]: nextTotal,
      [CREDIT_CURRENT_KEY]: nextCurrent,
      [CREDIT_REFRESH_KEY]: state.refreshDate,
    };

    await clerkClient.users.updateUser(userId, {
      privateMetadata: updatedMetadata,
    });

    const nextState: CreditState = {
      totalCredits: nextTotal,
      currentCredits: nextCurrent,
      refreshDate: state.refreshDate,
    };

    this.setCache(userId, nextState, updatedMetadata);

    return nextState;
  }

  async setTotalCredits(userId: string, total: number, options?: { refill?: boolean }): Promise<CreditState> {
    const normalizedTotal = Math.floor(total);
    if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
      throw new CreditError('Total credits must be greater than zero');
    }

  const { state, metadata } = await this.loadAndNormalize(userId, { force: true });
    const refill = options?.refill ?? true;
    const today = this.todayDateString();

    const nextCurrent = refill ? normalizedTotal : Math.min(state.currentCredits, normalizedTotal);
    const nextRefresh = refill ? today : state.refreshDate;

    const updatedMetadata = {
      ...metadata,
      [CREDIT_TOTAL_KEY]: normalizedTotal,
      [CREDIT_CURRENT_KEY]: nextCurrent,
      [CREDIT_REFRESH_KEY]: nextRefresh,
    };

    await clerkClient.users.updateUser(userId, {
      privateMetadata: updatedMetadata,
    });

    const nextState: CreditState = {
      totalCredits: normalizedTotal,
      currentCredits: nextCurrent,
      refreshDate: nextRefresh,
    };

    this.setCache(userId, nextState, updatedMetadata);

    return nextState;
  }
}

export const creditService = new CreditService();
