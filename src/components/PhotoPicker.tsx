import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { pickPhoto, type PhotoKind, type PickedPhoto, type PhotoSource } from '../photos';
import { colors } from '../theme';
import { Avatar, Button, Sheet, tap, useToast } from '../ui';

/**
 * A photo with a small camera badge: a round avatar for customers, or (with `kind="item"`) a
 * product photo passed in as `preview`. Tapping it offers Take photo, Choose from gallery and,
 * when there is one, Remove photo. The caller saves the result.
 */
export function PhotoPicker({
  name,
  size = 72,
  photoId,
  uri,
  busy,
  kind = 'customer',
  preview,
  hasPhoto: hasPhotoProp,
  onPicked,
  onRemove,
}: {
  name: string;
  size?: number;
  photoId?: string;
  uri?: string | null;
  busy?: boolean;
  kind?: PhotoKind;
  /** What to show instead of the avatar (product photos). */
  preview?: React.ReactNode;
  hasPhoto?: boolean;
  onPicked: (photo: PickedPhoto) => void;
  onRemove?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const hasPhoto = hasPhotoProp ?? !!(uri || photoId);

  async function choose(source: PhotoSource) {
    setOpen(false);
    try {
      const photo = await pickPhoto(source, kind);
      if (photo) onPicked(photo);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  const badge = Math.max(24, Math.round(size * 0.36));
  return (
    <>
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? `Change photo of ${name || kind}` : `Add a photo of ${name || kind}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        {preview ?? <Avatar name={name} size={size} photoId={photoId} uri={uri} />}
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, borderRadius: kind === 'item' ? 14 : size / 2, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.rust} />
          </View>
        ) : null}
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: colors.rust,
            borderWidth: 2,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="camera" size={badge * 0.5} color="#fff" />
        </View>
      </Pressable>

      <Sheet visible={open} title={hasPhoto ? 'Change photo' : 'Add a photo'} subtitle={kind === 'item' ? 'Shared by every size of this item in this colour. Use good light and a plain background.' : "Ask the customer first. Photos are kept in the shop's private Google Drive."} onClose={() => setOpen(false)}>
        <View style={{ gap: 10 }}>
          <Button title="Take photo" icon="camera-outline" onPress={() => void choose('camera')} />
          <Button title="Choose from gallery" icon="images-outline" variant="secondary" onPress={() => void choose('library')} />
          {hasPhoto && onRemove ? (
            <Button
              title="Remove photo"
              icon="trash-outline"
              variant="ghost"
              onPress={() => {
                setOpen(false);
                onRemove();
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
