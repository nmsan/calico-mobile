import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { pickPhoto, type PickedPhoto, type PhotoSource } from '../photos';
import { colors } from '../theme';
import { Avatar, Button, Sheet, tap, useToast } from '../ui';

/**
 * A customer avatar with a small camera badge. Tapping it offers Take photo, Choose from
 * gallery and (when there is one) Remove photo. The caller saves the result.
 */
export function PhotoPicker({
  name,
  size = 72,
  photoId,
  uri,
  busy,
  onPicked,
  onRemove,
}: {
  name: string;
  size?: number;
  photoId?: string;
  uri?: string | null;
  busy?: boolean;
  onPicked: (photo: PickedPhoto) => void;
  onRemove?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const hasPhoto = !!(uri || photoId);

  async function choose(source: PhotoSource) {
    setOpen(false);
    try {
      const photo = await pickPhoto(source);
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
        accessibilityLabel={hasPhoto ? `Change photo of ${name || 'customer'}` : `Add a photo of ${name || 'customer'}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Avatar name={name} size={size} photoId={photoId} uri={uri} />
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
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

      <Sheet visible={open} title={hasPhoto ? 'Change photo' : 'Add a photo'} subtitle="Ask the customer first. Photos are kept in the shop's private Google Drive." onClose={() => setOpen(false)}>
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
