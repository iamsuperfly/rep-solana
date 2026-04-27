/** Hook that lazily fetches a wallet's reputation profile via RPC. */
import { useEffect, useRef, useState, useCallback } from "react";
import { buildReputationProfile, type Network, type ReputationProfile } from "@/lib/solana";

interface State {
  data: ReputationProfile | null;
  loading: boolean;
  error: string | null;
}

export function useReputation(address: string | null, network: Network = "mainnet-beta") {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const reqRef = useRef(0);

  const fetchProfile = useCallback(async () => {
    if (!address) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const reqId = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const profile = await buildReputationProfile(address, network);
      if (reqId !== reqRef.current) return; // stale
      setState({ data: profile, loading: false, error: null });
    } catch (err) {
      if (reqId !== reqRef.current) return;
      const e = err as Error;
      setState({ data: null, loading: false, error: e.message ?? "Failed to load profile" });
    }
  }, [address, network]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { ...state, refresh: fetchProfile };
}
