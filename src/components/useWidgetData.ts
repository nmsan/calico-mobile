import { useEffect, useState } from 'react';

/**
 * Loads a widget's data on mount and whenever `refreshToken` changes (Home focus, pull-to-refresh).
 * Keeps the last data on screen while a refresh runs. State is only set after the request settles.
 */
export function useWidgetData<T>(load: () => Promise<T>, refreshToken: number, onLoadingChange?: (loading: boolean) => void) {
  const [state, setState] = useState<{ token: number; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((data) => live && setState({ token: refreshToken, data, error: null }))
      .catch((e) => live && setState((s) => ({ token: refreshToken, data: s?.data ?? null, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      live = false;
    };
    // `load` is a new function every render; only the token should start a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);
  const loading = state?.token !== refreshToken;
  useEffect(() => onLoadingChange?.(loading), [loading, onLoadingChange]);
  return { data: state?.data ?? null, error: state?.error ?? null, loading };
}
