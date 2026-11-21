import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export const DEFAULT_ITEM_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const KEY_CUSTOM_SIZES = 'calico.custom_sizes';

/**
 * Format a size name:
 * Trims whitespace.
 * If 1-4 letters and lowercase (e.g. "xxxl", "xs"), uppercase it to "XXXL", "XS".
 * Otherwise, if multi-word lowercase (e.g. "free size", "one size"), title-case to "Free Size".
 */
export function formatSizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // e.g. "3xl", "xxxl", "xs"
  if (/^[a-zA-Z]{1,4}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return trimmed;
}

export function useItemSizes() {
  const [sizes, setSizes] = useState<string[]>(DEFAULT_ITEM_SIZES);
  const [customSizes, setCustomSizes] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      let saved: string[] = [];
      try {
        const stored = await SecureStore.getItemAsync(KEY_CUSTOM_SIZES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            saved = parsed.map(formatSizeName).filter(Boolean);
          }
        }
      } catch {
        // SecureStore read fallback
      }

      let sheetSizes: string[] = [];
      try {
        const inv = await api.inventory();
        if (inv?.items) {
          sheetSizes = inv.items.map((i) => formatSizeName(i.size)).filter(Boolean);
        }
      } catch {
        // Inventory fetch fallback
      }

      if (!active) return;

      const seen = new Set<string>();
      const merged: string[] = [];

      for (const s of [...DEFAULT_ITEM_SIZES, ...saved, ...sheetSizes]) {
        const lower = s.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          merged.push(s);
        }
      }

      setCustomSizes(saved);
      setSizes(merged);
    })();

    return () => {
      active = false;
    };
  }, []);

  const addSize = useCallback(
    async (name: string): Promise<string | null> => {
      const formatted = formatSizeName(name);
      if (!formatted) return null;

      const lower = formatted.toLowerCase();
      const existing = sizes.find((s) => s.toLowerCase() === lower);
      if (existing) {
        return existing;
      }

      const updated = [...sizes, formatted];
      const updatedCustom = Array.from(new Set([...customSizes, formatted]));

      setSizes(updated);
      setCustomSizes(updatedCustom);

      try {
        await SecureStore.setItemAsync(KEY_CUSTOM_SIZES, JSON.stringify(updatedCustom));
      } catch {
        // SecureStore write fallback
      }

      return formatted;
    },
    [sizes, customSizes]
  );

  const removeSize = useCallback(
    async (name: string) => {
      const lower = name.toLowerCase();
      const updated = sizes.filter((s) => s.toLowerCase() !== lower);
      const updatedCustom = customSizes.filter((s) => s.toLowerCase() !== lower);

      setSizes(updated);
      setCustomSizes(updatedCustom);

      try {
        await SecureStore.setItemAsync(KEY_CUSTOM_SIZES, JSON.stringify(updatedCustom));
      } catch {
        // SecureStore write fallback
      }
    },
    [sizes, customSizes]
  );

  return { sizes, customSizes, addSize, removeSize };
}
