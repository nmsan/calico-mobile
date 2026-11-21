import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { api } from './api';
import { colors } from './theme';
import { Label, tap, ui } from './ui';

export const DEFAULT_COLORS = [
  'White',
  'Black',
  'Navy',
  'Beige',
  'Cream',
  'Grey',
  'Brown',
  'Olive',
  'Sage',
  'Terracotta',
  'Indigo',
  'Rust',
  'Khaki',
  'Maroon',
  'Pink',
  'Blue',
  'Green',
  'Yellow',
];

const KEY_SAVED_NAMES = 'calico.previous_item_names';
const KEY_SAVED_COLORS = 'calico.previous_item_colors';

export interface KnownItemDetail {
  category?: string;
  costPrice?: number;
  sellingPrice?: number;
}

export function useItemSuggestions() {
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [knownColors, setKnownColors] = useState<string[]>(DEFAULT_COLORS);
  const [itemDetails, setItemDetails] = useState<Record<string, KnownItemDetail>>({});

  useEffect(() => {
    let active = true;

    (async () => {
      let savedNames: string[] = [];
      let savedColors: string[] = [];

      try {
        const [nJson, cJson] = await Promise.all([
          SecureStore.getItemAsync(KEY_SAVED_NAMES),
          SecureStore.getItemAsync(KEY_SAVED_COLORS),
        ]);
        if (nJson) {
          const parsed = JSON.parse(nJson);
          if (Array.isArray(parsed)) savedNames = parsed;
        }
        if (cJson) {
          const parsed = JSON.parse(cJson);
          if (Array.isArray(parsed)) savedColors = parsed;
        }
      } catch {
        // fallback if storage read fails
      }

      let sheetNames: string[] = [];
      let sheetColors: string[] = [];
      const detailsMap: Record<string, KnownItemDetail> = {};

      try {
        const inv = await api.inventory();
        if (inv?.items) {
          for (const item of inv.items) {
            const name = item.name?.trim();
            const color = item.color?.trim();
            if (name) {
              sheetNames.push(name);
              if (!detailsMap[name.toLowerCase()]) {
                detailsMap[name.toLowerCase()] = {
                  category: item.category?.trim(),
                  costPrice: item.costPrice,
                  sellingPrice: item.sellingPrice,
                };
              }
            }
            if (color) {
              sheetColors.push(color);
            }
          }
        }
      } catch {
        // fallback if inventory fetch fails
      }

      if (!active) return;

      // Deduplicate names
      const seenNames = new Set<string>();
      const mergedNames: string[] = [];
      for (const n of [...sheetNames, ...savedNames]) {
        const lower = n.toLowerCase();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          mergedNames.push(n);
        }
      }

      // Deduplicate colors (sheet + saved + defaults)
      const seenColors = new Set<string>();
      const mergedColors: string[] = [];
      for (const c of [...sheetColors, ...savedColors, ...DEFAULT_COLORS]) {
        const lower = c.toLowerCase();
        if (!seenColors.has(lower)) {
          seenColors.add(lower);
          mergedColors.push(c);
        }
      }

      setItemNames(mergedNames);
      setKnownColors(mergedColors);
      setItemDetails(detailsMap);
    })();

    return () => {
      active = false;
    };
  }, []);

  const saveSuggestion = useCallback(async (name?: string, color?: string) => {
    const trimmedName = name?.trim();
    const trimmedColor = color?.trim();

    if (trimmedName) {
      setItemNames((prev) => {
        if (prev.some((n) => n.toLowerCase() === trimmedName.toLowerCase())) return prev;
        const next = [trimmedName, ...prev];
        void SecureStore.setItemAsync(KEY_SAVED_NAMES, JSON.stringify(next.slice(0, 50)));
        return next;
      });
    }

    if (trimmedColor) {
      setKnownColors((prev) => {
        if (prev.some((c) => c.toLowerCase() === trimmedColor.toLowerCase())) return prev;
        const next = [trimmedColor, ...prev];
        void SecureStore.setItemAsync(KEY_SAVED_COLORS, JSON.stringify(next.slice(0, 50)));
        return next;
      });
    }
  }, []);

  return { itemNames, knownColors, itemDetails, saveSuggestion };
}

export function AutocompleteInput({
  label,
  value,
  onChangeText,
  suggestions,
  placeholder,
  autoCapitalize = 'words',
  hint,
  style,
  onSelectSuggestion,
}: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  suggestions: string[];
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  hint?: string;
  style?: StyleProp<ViewStyle>;
  onSelectSuggestion?: (s: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const query = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return [];
    return suggestions
      .filter((s) => {
        const lower = s.toLowerCase();
        return lower.includes(query) && lower !== query;
      })
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 5);
  }, [suggestions, query]);

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <View style={[ui.inputBox, focused && ui.inputFocused]}>
        <TextInput
          style={ui.input}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setShowDropdown(true);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => {
            setFocused(true);
            setShowDropdown(true);
          }}
          onBlur={() => {
            // Delay closing slightly so tap on suggestion registers
            setTimeout(() => {
              setFocused(false);
              setShowDropdown(false);
            }, 200);
          }}
        />
        {value ? (
          <Pressable
            onPress={() => {
              onChangeText('');
              setShowDropdown(false);
            }}
            hitSlop={8}
            style={{ padding: 4 }}
            accessibilityLabel="Clear"
          >
            <Ionicons name="close-circle" size={17} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={ui.hint}>{hint}</Text> : null}

      {/* Spreadsheet-like Suggestion Dropdown */}
      {showDropdown && matches.length > 0 ? (
        <View
          style={{
            marginTop: 4,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 10,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 5,
            elevation: 3,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              backgroundColor: colors.shell,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Previous matches
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {matches.length} found
            </Text>
          </View>

          {matches.map((item, idx) => (
            <Pressable
              key={item}
              onPress={() => {
                tap();
                onChangeText(item);
                onSelectSuggestion?.(item);
                setShowDropdown(false);
                Keyboard.dismiss();
              }}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: pressed ? colors.pressed : colors.surface,
                  borderBottomWidth: idx < matches.length - 1 ? 1 : 0,
                  borderBottomColor: colors.line,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select suggestion ${item}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="search-outline" size={15} color={colors.rust} />
                <Text style={{ fontSize: 15, color: colors.ink, fontWeight: '500' }}>
                  {item}
                </Text>
              </View>
              <Ionicons name="arrow-up-circle-outline" size={17} color={colors.rust} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
