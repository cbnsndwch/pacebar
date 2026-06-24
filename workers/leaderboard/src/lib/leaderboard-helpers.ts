/**
 * Pure helpers and shared types for leaderboard computation.
 *
 * These functions have no D1 dependency and can be unit-tested directly.
 */

export type LeaderboardMetric = "tokens" | "dollars" | "providers" | "score";

export const METRIC_COL: Record<LeaderboardMetric, string> = {
  tokens: "tokens_used",
  dollars: "dollars_spent",
  providers: "providers_active",
  score: "score",
};

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  tokens_used: number;
  dollars_spent: number;
  providers_active: number;
  score: number;
  models?: Record<string, ModelUsageValue>;
}

export interface ModelUsageValue {
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_total: number;
  tokens_in: number | null;
  tokens_out: number | null;
  dollars_spent: number;
}

export interface UserUsage {
  handle: string;
  tokens_total: number;
  tokens_in: number | null;
  tokens_out: number | null;
  dollars_spent: number;
  providers_active: number;
  score: number;
  models: Record<string, ModelUsageValue>;
}

export interface ModelLeaderboardData {
  modelKey: string;
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_total: number;
  dollars_spent: number;
  users: number;
  topHandle: string | null;
  topTokens: number;
}

export interface HacknightUsage {
  byHandle: Record<string, UserUsage>;
  byModel: Record<string, ModelLeaderboardData>;
}

export interface ModelLeaderboardEntry {
  rank: number;
  model_key: string;
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_used: number;
  dollars_spent: number;
  users: number;
  top_handle: string | null;
  top_tokens: number;
}

export function modelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

export function delta(a: number, b: number): number {
  return Math.max(0, a - b);
}

export interface ProviderLike {
  id: string;
  displayName?: string;
  tokensUsed: number;
  dollarsSpent: number;
}

export interface NormalizedModelPayload {
  providerId: string;
  modelId: string;
  modelName: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number;
  dollarsSpent: number | null;
}

export function buildSnapshotModels(
  models: unknown,
  providers: ProviderLike[],
): NormalizedModelPayload[] {
  if (models && Array.isArray(models) && models.length > 0) {
    const out: NormalizedModelPayload[] = [];
    for (const m of models) {
      if (!m || typeof m !== "object") continue;
      if (typeof m.providerId !== "string" || !m.providerId.trim()) continue;
      if (typeof m.modelId !== "string" || !m.modelId.trim()) continue;
      const providerId = m.providerId.trim();
      const modelId = m.modelId.trim();
      const tokensIn = typeof m.tokensIn === "number" ? Math.max(0, Math.round(m.tokensIn)) : null;
      const tokensOut =
        typeof m.tokensOut === "number" ? Math.max(0, Math.round(m.tokensOut)) : null;
      const explicitTotal =
        typeof m.tokensTotal === "number" ? Math.max(0, Math.round(m.tokensTotal)) : null;
      out.push({
        providerId,
        modelId,
        modelName: typeof m.modelName === "string" ? m.modelName : null,
        tokensIn,
        tokensOut,
        tokensTotal:
          explicitTotal ??
          (tokensIn != null && tokensOut != null ? Math.max(0, tokensIn + tokensOut) : 0),
        dollarsSpent: typeof m.dollarsSpent === "number" ? Math.max(0, m.dollarsSpent) : null,
      });
    }
    return out;
  }

  // Fallback: one model per provider using the provider aggregate.
  return providers.map((p) => ({
    providerId: p.id,
    modelId: "total",
    modelName: p.displayName || null,
    tokensIn: null,
    tokensOut: null,
    tokensTotal: p.tokensUsed,
    dollarsSpent: p.dollarsSpent,
  }));
}

export function buildUserEntries(
  usage: HacknightUsage,
  metric: LeaderboardMetric,
): LeaderboardEntry[] {
  const list: LeaderboardEntry[] = Object.values(usage.byHandle).map((u) => ({
    rank: 0,
    handle: u.handle,
    tokens_used: u.tokens_total,
    dollars_spent: u.dollars_spent,
    providers_active: u.providers_active,
    score: u.score,
    models: u.models,
  }));

  list.sort((a, b) => {
    switch (metric) {
      case "dollars":
        return b.dollars_spent - a.dollars_spent;
      case "providers":
        return b.providers_active - a.providers_active;
      case "score":
        return b.score - a.score;
      case "tokens":
      default:
        return b.tokens_used - a.tokens_used;
    }
  });

  return list.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

export function buildModelEntries(
  usage: HacknightUsage,
  metric: LeaderboardMetric,
): ModelLeaderboardEntry[] {
  const list = Object.values(usage.byModel).map((m) => ({
    rank: 0,
    model_key: m.modelKey,
    provider_id: m.provider_id,
    model_id: m.model_id,
    model_name: m.model_name,
    tokens_used: m.tokens_total,
    dollars_spent: m.dollars_spent,
    users: m.users,
    top_handle: m.topHandle,
    top_tokens: m.topTokens,
  }));

  list.sort((a, b) => {
    if (metric === "dollars") return b.dollars_spent - a.dollars_spent;
    return b.tokens_used - a.tokens_used;
  });

  return list.map((e, idx) => ({ ...e, rank: idx + 1 }));
}
