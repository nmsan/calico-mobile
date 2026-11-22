import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto, type ItemThumb as Thumb } from '../photos';
import { colors } from '../theme';

/** Product thumbnail for list rows, or a hanger icon when the item has no photo yet. */
export function ItemThumb({ thumb, size = 52, onPress }: { thumb?: Thumb; size?: number; onPress?: () => void }) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.22), backgroundColor: colors.shell };
  const body = thumb ? (
    <Image source={{ uri: thumb.uri }} style={box} resizeMode="cover" />
  ) : (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="shirt-outline" size={size * 0.46} color={colors.sand} />
    </View>
  );
  if (!onPress || !thumb) return body;
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="imagebutton" accessibilityLabel="View photo" style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {body}
    </Pressable>
  );
}

/**
 * The large product photo used on forms: the full image when it has loaded, the thumbnail
 * until then, or a dashed "Add photo" box when there is none.
 */
export function ItemPhotoPreview({ uri, thumb, width = 120 }: { uri?: string | null; thumb?: Thumb; width?: number }) {
  const full = usePhoto(uri ? undefined : thumb?.photoId, 'item');
  const src = uri ?? full ?? thumb?.uri;
  const box = { width, height: Math.round(width * 1.25), borderRadius: 14 };
  if (src) return <Image source={{ uri: src }} style={[box, { backgroundColor: colors.shell }]} resizeMode="cover" accessibilityLabel="Item photo" />;
  return (
    <View style={[box, { backgroundColor: colors.shell, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.sand, alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
      <Ionicons name="shirt-outline" size={34} color={colors.sand} />
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Add photo</Text>
    </View>
  );
}

/** Full-screen view of a product photo. Shows the thumbnail while the full image downloads. */
export function ItemPhotoViewer({ thumb, title, onClose }: { thumb: Thumb | null; title?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const full = usePhoto(thumb?.photoId, 'item');
  return (
    <Modal visible={!!thumb} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,8,6,0.94)' }]} onPress={onClose} accessibilityLabel="Close photo" />
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
        {thumb ? (
          <View pointerEvents="none">
            <Image source={{ uri: full ?? thumb.uri }} style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 16 }} resizeMode="cover" blurRadius={full ? 0 : 2} />
            {!full ? <ActivityIndicator color="#fff" style={{ position: 'absolute', alignSelf: 'center', top: '48%' }} /> : null}
          </View>
        ) : null}
        {title ? <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 16 }}>{title}</Text> : null}
      </View>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityLabel="Close"
        style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
    </Modal>
  );
}
