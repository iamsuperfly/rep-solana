/** Subscribes to passport changes in localStorage. */
import { useEffect, useState } from "react";
import { getPassport, type MintedPassport } from "@/lib/passport";

export function usePassport(address: string | null) {
  const [passport, setPassport] = useState<MintedPassport | null>(() =>
    address ? getPassport(address) : null,
  );

  useEffect(() => {
    setPassport(address ? getPassport(address) : null);
    if (!address) return;
    function handler() {
      setPassport(address ? getPassport(address) : null);
    }
    window.addEventListener("repsolana:passport-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("repsolana:passport-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [address]);

  return passport;
}
