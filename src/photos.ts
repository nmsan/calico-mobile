import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { api } from './api';

/** A photo ready to upload: a small square JPEG. */
export type PickedPhoto = { uri: string; base64: string };

export type PhotoSource = 'camera' | 'library';

const SIZE = 400; // px; plenty for an avatar and keeps uploads around 30 KB

/**
 * Lets the user take or choose a photo, cropped square, then shrinks it for upload.
 * Returns null if they cancel. Throws with a readable message if permission is refused.
 */
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(source === 'camera' ? 'Allow camera access in Settings to take a photo.' : 'Allow photo access in Settings to choose a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width > SIZE || asset.height > SIZE) {
    ctx.resize(asset.width >= asset.height ? { width: SIZE, height: null } : { width: null, height: SIZE });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { uri: out.uri, base64: out.base64 };
}

/* ------------------------------------------------------------------ cache */

// Photos are fetched through the API (they are private in Drive), so keep each one for the
// session. A photo ID never changes its content: a new photo gets a new ID.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function load(photoId: string): Promise<string> {
  const hit = cache.get(photoId);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(photoId);
  if (!p) {
    p = api
      .customerPhoto(photoId)
      .then((r) => {
        const uri = `data:${r.mimeType};base64,${r.data}`;
        cache.set(photoId, uri);
        return uri;
      })
      .finally(() => pending.delete(photoId));
    pending.set(photoId, p);
  }
  return p;
}

/** Remember a photo just uploaded so it shows without downloading it again. */
export function rememberPhoto(photoId: string, base64: string) {
  cache.set(photoId, `data:image/jpeg;base64,${base64}`);
}

/** The image URI for a customer's photo, or null while loading, if there is none, or if it failed. */
export function usePhoto(photoId: string | undefined): string | null {
  // Bumped when a download finishes so the component re-reads the cache.
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (!photoId || cache.has(photoId)) return;
    let live = true;
    load(photoId)
      .then(() => live && setLoaded((n) => n + 1))
      .catch(() => {}); // fall back to initials
    return () => {
      live = false;
    };
  }, [photoId]);
  return photoId ? cache.get(photoId) ?? null : null;
}
