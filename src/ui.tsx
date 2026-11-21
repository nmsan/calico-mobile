import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from './theme';

export { colors, fonts } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ formatting */

export function money(n: number | undefined) {
  const v = Number(n || 0);
  const sign = v < 0 ? '-' : '';
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${sign}Rs ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** Whole-rupee money for tight spaces (pills, list rows). */
export function moneyShort(n: number | undefined) {
  const v = Math.round(Number(n || 0));
  const sign = v < 0 ? '-' : '';
  return `${sign}Rs ${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function pct(n: number | undefined) {
  return `${(Number(n || 0) * 100).toFixed(1)}%`;
}

function isoDate(d: Date) {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today() {
  return isoDate(new Date());
}

export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", or "3 Nov" (with the year when it isn't this year). */
export function prettyDate(iso: string | undefined) {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  if (iso.startsWith(today())) return 'Today';
  if (iso.startsWith(yesterday())) return 'Yesterday';
  const [, y, mo, d] = m;
  const thisYear = String(new Date().getFullYear()) === y;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]}${thisYear ? '' : ` ${y}`}`;
}

export function toNumber(s: string) {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const tap = () => void Haptics.selectionAsync().catch(() => {});
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

/* ------------------------------------------------------------------ data loading */

/** Loads data when the screen gains focus; exposes reload for pull-to-refresh. */
export function useLoader<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Keep the latest `load` without re-creating `reload`. Updated in a layout
  // effect (not during render) so it is current before the focus effect runs.
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  // Only the newest request may write state, so a slow earlier load (e.g. the
  // focus refresh) can't overwrite fresher data that arrived after it.
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadRef.current();
      if (id === seq.current) setData(next);
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );
  return { data, error, loading, reload, setData };
}

/* ------------------------------------------------------------------ toast */

type Toast = { message: string; tone: 'ok' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

/** Short, non-blocking confirmation shown at the top of the screen. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: Toast['tone'] = 'ok') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, tone });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 2600);
    },
    [anim]
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            ui.toast,
            {
              top: insets.top + 8,
              opacity: anim,
              transform: [{ translateY }],
            },
          ]}
        >
          <Ionicons
            name={toast.tone === 'ok' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={toast.tone === 'ok' ? '#8FD3A6' : '#F4A79F'}
          />
          <Text style={ui.toastText}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ------------------------------------------------------------------ layout */

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView edges={['left', 'right']} style={[ui.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

/** Tracked uppercase label, echoing the "SIMPLE · EVERYDAY" tagline. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[ui.sectionLabel, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={ui.label}>{children}</Text>;
}

/** Large figure for the number a screen is about. */
export function Hero({ children, color, size = 32 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <Text style={[ui.hero, { fontSize: size, lineHeight: size * 1.2, color: color ?? colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>
      {children}
    </Text>
  );
}

/** Label / value line for statements and summaries. */
export function KeyValue({ label, value, bold, color, muted }: { label: string; value: string; bold?: boolean; color?: string; muted?: boolean }) {
  return (
    <View style={[ui.between, { paddingVertical: 7 }]}>
      <Text style={{ fontSize: 15, color: muted ? colors.muted : colors.ink, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={[ui.num, { fontSize: 15, fontWeight: bold ? '700' : '500', color: color ?? colors.ink }]}>{value}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, style]} />;
}

/* ------------------------------------------------------------------ inputs */

export function Input(props: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoFocus?: boolean;
  prefix?: string;
  large?: boolean;
  hint?: string;
  maxLength?: number;
  returnKeyType?: 'done' | 'next' | 'go';
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: 14 }, props.style]}>
      {props.label ? <Label>{props.label}</Label> : null}
      <View style={[ui.inputBox, focused && ui.inputFocused]}>
        {props.prefix ? <Text style={[ui.prefix, props.large && { fontSize: 22 }]}>{props.prefix}</Text> : null}
        <TextInput
          style={[ui.input, props.large && ui.inputLarge]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={props.keyboardType}
          secureTextEntry={props.secureTextEntry}
          autoCapitalize={props.autoCapitalize ?? 'sentences'}
          autoCorrect={false}
          autoFocus={props.autoFocus}
          maxLength={props.maxLength}
          returnKeyType={props.returnKeyType}
          onSubmitEditing={props.onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {props.hint ? <Text style={ui.hint}>{props.hint}</Text> : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  style,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.search, style]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        style={ui.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** −/+ quantity control. */
export function Stepper({ value, onChange, min = 1, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const canDec = value > min;
  const canInc = max === undefined || value < max;
  const step = (by: number) => {
    tap();
    onChange(value + by);
  };
  return (
    <View style={ui.stepper}>
      <Pressable onPress={() => step(-1)} disabled={!canDec} style={ui.stepBtn} hitSlop={4} accessibilityLabel="Decrease">
        <Ionicons name="remove" size={18} color={canDec ? colors.ink : colors.faint} />
      </Pressable>
      <Text style={ui.stepValue}>{value}</Text>
      <Pressable onPress={() => step(1)} disabled={!canInc} style={ui.stepBtn} hitSlop={4} accessibilityLabel="Increase">
        <Ionicons name="add" size={18} color={canInc ? colors.ink : colors.faint} />
      </Pressable>
    </View>
  );
}

/** One-tap choice between a few options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.seg, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={[ui.segItem, on && ui.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[ui.segText, on && { color: colors.ink, fontWeight: '600' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill filters. Pass `counts` to show how many items each option matches. */
export function Chips({
  options,
  value,
  onChange,
  counts,
  style,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  counts?: Record<string, number | undefined>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {options.map((o) => {
        const on = value === o;
        const c = counts?.[o];
        return (
          <Pressable
            key={o}
            onPress={() => {
              if (!on) tap();
              onChange(o);
            }}
            style={[ui.chip, on && ui.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[ui.chipText, on && { color: '#fff' }]}>{o}</Text>
            {c !== undefined ? <Text style={[ui.chipCount, on && { color: 'rgba(255,255,255,0.65)' }]}>{c}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ buttons */

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.ink, secondary: colors.shell, danger: colors.owed, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? colors.rust : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [ui.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[ui.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Small text action, e.g. "+ Add item". */
export function LinkButton({ title, onPress, icon, color = colors.rust }: { title: string; onPress: () => void; icon?: IconName; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 }]}>
      {icon ? <Ionicons name={icon} size={17} color={color} /> : null}
      <Text style={{ color, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

/** Floating action button, bottom right. */
export function Fab({ title, icon = 'add', onPress }: { title: string; icon?: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [ui.fab, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={ui.fabText}>{title}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ status */

export type Tone = 'ok' | 'low' | 'owed' | 'neutral';

export function toneOf(text: string): Tone {
  const t = text.toLowerCase();
  if (t.includes('out') || t === 'unpaid' || t.includes('owes')) return 'owed';
  if (t.includes('low') || t === 'partial') return 'low';
  return 'ok';
}

export const toneColors: Record<Tone, [string, string]> = {
  ok: [colors.okBg, colors.ok],
  low: [colors.lowBg, colors.low],
  owed: [colors.owedBg, colors.owed],
  neutral: [colors.shell, colors.ink2],
};

export function Badge({ text, tone, style }: { text: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = toneColors[tone ?? toneOf(text)];
  return (
    <View style={[ui.badge, { backgroundColor: bg }, style]}>
      <Text style={[ui.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.shell, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.rust, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={ui.error} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color={colors.owed} />
      <Text style={ui.errorText}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40 }}>
      <ActivityIndicator color={colors.rust} />
    </View>
  );
}

export function Empty({ icon = 'leaf-outline', title, text }: { icon?: IconName; title?: string; text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.shell, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Ionicons name={icon} size={26} color={colors.terra} />
      </View>
      {title ? <Text style={{ fontFamily: fonts.serif, fontSize: 19, color: colors.ink }}>{title}</Text> : null}
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ sheets */

/** Bottom sheet over a dimmed screen. Content sits above the keyboard. */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // While the keyboard is up it already covers the home indicator area, so drop
  // that inset; otherwise the sheet floats with an empty band above the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[ui.sheet, { paddingBottom: (keyboardUp ? 16 : Math.max(insets.bottom, 16)) + 4 }]}>
          <View style={ui.grabber} />
          <View style={[ui.between, { marginBottom: subtitle ? 2 : 16 }]}>
            <Text style={ui.sheetTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={ui.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.ink2} />
            </Pressable>
          </View>
          {subtitle ? <Text style={[ui.muted, { marginBottom: 16, marginTop: 0 }]}>{subtitle}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Full-screen searchable list picker. */
export function PickerModal<T>({
  visible,
  title,
  items,
  keyOf,
  searchTextOf,
  renderRow,
  isDisabled,
  onPick,
  onClose,
  createLabel,
  onCreate,
  placeholder,
}: {
  visible: boolean;
  title: string;
  items: T[];
  keyOf: (t: T) => string;
  searchTextOf: (t: T) => string;
  renderRow: (t: T) => React.ReactNode;
  isDisabled?: (t: T) => boolean;
  onPick: (t: T) => void;
  onClose: () => void;
  /** Offer to use the typed text as a new entry, e.g. a new customer. */
  createLabel?: (q: string) => string;
  onCreate?: (q: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () => (query ? items.filter((i) => searchTextOf(i).toLowerCase().includes(query)) : items),
    [items, query, searchTextOf]
  );
  const close = () => {
    setQ('');
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
        <View style={ui.modalHeader}>
          <Text style={ui.modalTitle}>{title}</Text>
          <Pressable onPress={close} hitSlop={12} style={ui.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.ink2} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField value={q} onChangeText={setQ} placeholder={placeholder} autoFocus />
        </View>
        <FlatList
          data={shown}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            onCreate && q.trim() && createLabel ? (
              <Pressable
                onPress={() => {
                  onCreate(q.trim());
                  setQ('');
                }}
                style={({ pressed }) => [ui.createRow, pressed && { backgroundColor: colors.pressed }]}
              >
                <View style={[ui.iconCircle, { backgroundColor: colors.ink }]}>
                  <Ionicons name="add" size={20} color="#fff" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink, flex: 1 }} numberOfLines={1}>
                  {createLabel(q.trim())}
                </Text>
              </Pressable>
            ) : undefined
          }
          ListEmptyComponent={onCreate ? undefined : <Empty icon="search" text="Nothing matches that search." />}
          renderItem={({ item }) => {
            const off = isDisabled?.(item) ?? false;
            return (
              <Pressable
                disabled={off}
                onPress={() => {
                  tap();
                  onPick(item);
                  setQ('');
                }}
                style={({ pressed }) => [ui.row, pressed && { backgroundColor: colors.pressed }, off && { opacity: 0.45 }]}
              >
                {renderRow(item)}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Style for row `index` of `count` in a rounded, bordered list group. */
export function groupRow(index: number, count: number): StyleProp<ViewStyle> {
  return [ui.groupRow, index === 0 && ui.groupFirst, index === count - 1 && ui.groupLast];
}

/* ------------------------------------------------------------------ styles */

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionLabel: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted, fontWeight: '600' },
  label: { fontSize: 13, color: colors.ink2, marginBottom: 6, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  // Young Serif only has old-style figures, which read poorly for money, so amounts use bold sans.
  hero: { fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], marginVertical: 2 },
  num: { fontVariant: ['tabular-nums'] },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  inputFocused: { borderColor: colors.ink },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.ink },
  inputLarge: { fontSize: 26, paddingVertical: 12, fontWeight: '600' },
  prefix: { fontSize: 16, color: colors.muted, marginRight: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 16, color: colors.ink },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 30, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  seg: { flexDirection: 'row', backgroundColor: colors.shell, borderRadius: radius.md, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segOn: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: 14, color: colors.ink2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '500' },
  chipCount: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  button: { borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  error: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.owedBg,
    borderRadius: radius.sm,
    padding: 12,
    marginVertical: 8,
  },
  errorText: { color: colors.owed, fontSize: 14, flex: 1, lineHeight: 20 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '500', flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 14 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, flex: 1, paddingRight: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.shell, alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  modalTitle: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13, marginTop: 2 },
  h2: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginBottom: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: 1 },
});

/** Kept for existing imports. */
export const styles = ui;
