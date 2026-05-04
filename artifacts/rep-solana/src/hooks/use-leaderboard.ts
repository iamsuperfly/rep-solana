/**
 * useOnChainLeaderboard — fetches the live leaderboard from the official
 * RepSolana collection via Helius DAS getAssetsByGroup.
 *
 * Falls back to an empty list with `isOnChain: false` when no DAS-capable
 * RPC is configured (i.e. vanilla devnet endpoint).
 */
import { useState, useEffect, useCallback } from "react";
import { getOnChainLeaderboard, hasDasRpc, type OnChainLeaderboardEntry } from "@/lib/das";

export type { OnChainLeaderboardEntry };

export interface UseLeaderboardResult {
  entries: OnChainLeaderboardEntry[];
  loading: boolean;
  /** True when entries come from DAS (live on-chain), false when DAS is unavailable. */
  isOnChain: boolean;
  error: string | null;
  reload: () => void;
}

export function useOnChainLeaderboard(): UseLeaderboardResult {
  const [entries, setEntries] = useState<OnChainLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(hasDasRpc());
  const [isOnChain, setIsOnChain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!hasDasRpc()) {
      setLoading(false);
      setIsOnChain(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getOnChainLeaderboard();
      setEntries(data);
      setIsOnChain(true);
    } catch (err) {
      setError((err as Error).message);
      setIsOnChain(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { entries, loading, isOnChain, error, reload: load };
}