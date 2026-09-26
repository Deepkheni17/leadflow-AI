import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch data and optionally re-poll it. Keeps the previous data while refetching so the
 * UI never flashes empty.
 */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    const onRefresh = () => reload();
    window.addEventListener("leadflow:refresh", onRefresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("leadflow:refresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}

/** Ask every polling view to refetch now (e.g. after simulating a lead). */
export const broadcastRefresh = () => window.dispatchEvent(new Event("leadflow:refresh"));
