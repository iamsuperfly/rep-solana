/** Tiny formatting helpers used across pages. */

export function shortAddress(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function timeAgo(unixSec: number | null | undefined): string {
  if (!unixSec) return "—";
  const diff = Math.max(0, Date.now() / 1000 - unixSec);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / (86400 * 30))}mo ago`;
}

export function formatSol(n: number, max = 4): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: max,
    minimumFractionDigits: 0,
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}
