import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export const DEFAULT_ITEM_CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories'];
const KEY_CUSTOM_CATEGORIES = 'calico.custom_categories';

/**
 * Format a category name:
 * Trims whitespace, and if fully lowercase, capitalizes the first letter of each word.
 */
export function formatCategoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return trimmed;
}

export function useItemCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_ITEM_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      let saved: string[] = [];
      try {
        const stored = await SecureStore.getItemAsync(KEY_CUSTOM_CATEGORIES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            saved = parsed.map(formatCategoryName).filter(Boolean);
          }
        }
      } catch {
        // SecureStore read failure fallback
      }

      let sheetCats: string[] = [];
      try {
        const inv = await api.inventory();
        if (inv?.items) {
          sheetCats = inv.items.map((i) => formatCategoryName(i.category)).filter(Boolean);
        }
      } catch {
        // Inventory fetch failure fallback
      }

      if (!active) return;

      // Deduplicate case-insensitively, prioritizing DEFAULT order, then custom/sheet
      const seen = new Set<string>();
      const merged: string[] = [];

      for (const cat of [...DEFAULT_ITEM_CATEGORIES, ...saved, ...sheetCats]) {
        const lower = cat.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          merged.push(cat);
        }
      }

      setCustomCategories(saved);
      setCategories(merged);
    })();

    return () => {
      active = false;
    };
  }, []);

  const addCategory = useCallback(
    async (name: string): Promise<string | null> => {
      const formatted = formatCategoryName(name);
      if (!formatted) return null;

      const lower = formatted.toLowerCase();
      const existing = categories.find((c) => c.toLowerCase() === lower);
      if (existing) {
        return existing;
      }

      const updated = [...categories, formatted];
      const updatedCustom = Array.from(new Set([...customCategories, formatted]));

      setCategories(updated);
      setCustomCategories(updatedCustom);

      try {
        await SecureStore.setItemAsync(KEY_CUSTOM_CATEGORIES, JSON.stringify(updatedCustom));
      } catch {
        // SecureStore write fallback
      }

      return formatted;
    },
    [categories, customCategories]
  );

  const removeCategory = useCallback(
    async (name: string) => {
      const lower = name.toLowerCase();
      const updated = categories.filter((c) => c.toLowerCase() !== lower);
      const updatedCustom = customCategories.filter((c) => c.toLowerCase() !== lower);

      setCategories(updated);
      setCustomCategories(updatedCustom);

      try {
        await SecureStore.setItemAsync(KEY_CUSTOM_CATEGORIES, JSON.stringify(updatedCustom));
      } catch {
        // SecureStore write fallback
      }
    },
    [categories, customCategories]
  );

  return { categories, customCategories, addCategory, removeCategory };
}
