import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { api } from './api';

/** A photo ready to upload. `thumb` is only made for product photos. */
export type PickedPhoto = { uri: string; base64: string; thumb?: string };

export type PhotoSource = 'camera' | 'library';
export type PhotoKind = 'customer' | 'item';

/**
 * How each photo is compressed. JPEG at 0.8 is about where quality stops visibly improving
 * while the file keeps growing, so each size starts there and only steps down (never below
 * `minQuality`) if the file is still over its budget, e.g. a busy patterned fabric.
 * Budgets are base64 characters, about 4/3 of the file size.
 */
type Variant = { maxSide: number; quality: number; minQuality: number; maxChars: number };

const CUSTOMER: Variant = { maxSide: 400, quality: 0.8, minQuality: 0.5, maxChars: 110_000 }; // avatar, ≤ ~80 KB
const ITEM_FULL: Variant = { maxSide: 1000, quality: 0.82, minQuality: 0.55, maxChars: 300_000 }; // detail view, ≤ ~220 KB
const ITEM_THUMB: Variant = { maxSide: 200, quality: 0.72, minQuality: 0.4, maxChars: 20_000 }; // list rows, ≤ ~15 KB

async function encode(uri: string, width: number, height: number, v: Variant) {
  const ctx = ImageManipulator.manipulate(uri);
  const long = Math.max(width, height);
  if (long > v.maxSide) ctx.resize(width >= height ? { width: v.maxSide, height: null } : { width: null, height: v.maxSide });
  const ref = await ctx.renderAsync();
  let quality = v.quality;
  for (;;) {
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    if (!out.base64) throw new Error('Could not read the photo.');
    if (out.base64.length <= v.maxChars || quality <= v.minQuality) return { uri: out.uri, base64: out.base64 };
    quality = Math.max(v.minQuality, Math.round((quality - 0.08) * 100) / 100);
  }
}

/**
 * Lets the user take or choose a photo, cropped (square for people, 4:5 for clothes, which are
 * usually taller than wide), then compresses it for upload. Returns null if they cancel.
 * Throws with a readable message if permission is refused.
 */
export async function pickPhoto(source: PhotoSource, kind: PhotoKind = 'customer'): Promise<PickedPhoto | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(source === 'camera' ? 'Allow camera access in Settings to take a photo.' : 'Allow photo access in Settings to choose a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'item' ? [4, 5] : [1, 1], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.length) return null;

  const { uri, width, height } = res.assets[0];
  if (kind === 'customer') return encode(uri, width, height, CUSTOMER);
  const [full, thumb] = await Promise.all([encode(uri, width, height, ITEM_FULL), encode(uri, width, height, ITEM_THUMB)]);
  return { uri: full.uri, base64: full.base64, thumb: thumb.base64 };
}

/* ------------------------------------------------------------------ cache */

// Photos are fetched through the API (they are private in Drive), so keep each one for the
// session. A photo ID never changes its content: a new photo gets a new ID.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function load(photoId: string, kind: PhotoKind): Promise<string> {
  const hit = cache.get(photoId);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(photoId);
  if (!p) {
    p = (kind === 'item' ? api.itemPhoto(photoId) : api.customerPhoto(photoId))
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
export function usePhoto(photoId: string | undefined, kind: PhotoKind = 'customer'): string | null {
  // Bumped when a download finishes so the component re-reads the cache.
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (!photoId || cache.has(photoId)) return;
    let live = true;
    load(photoId, kind)
      .then(() => live && setLoaded((n) => n + 1))
      .catch(() => {}); // fall back to initials
    return () => {
      live = false;
    };
  }, [photoId, kind]);
  return photoId ? cache.get(photoId) ?? null : null;
}

/* ------------------------------------------------------------------ item thumbnails */

// One shared photo per product name and colour. Thumbnails come from the sheet in one request
// and are kept for the session; later refreshes only fetch the ones that changed.
export type ItemThumb = { photoId: string; uri: string };
const thumbs = new Map<string, ItemThumb>();
const thumbData = new Map<string, string>(); // photoId -> data URI
const listeners = new Set<() => void>();
let thumbsLoading: Promise<void> | null = null;

export const itemKey = (name: string, color: string) => `${name.trim().toLowerCase()}|${color.trim().toLowerCase()}`;

function notify() {
  listeners.forEach((l) => l());
}

/** Fetch the current list of product photos. Safe to call often; requests are shared. */
export function refreshItemThumbs(): Promise<void> {
  if (thumbsLoading) return thumbsLoading;
  thumbsLoading = api
    .itemThumbs([...thumbData.keys()])
    .then((list) => {
      thumbs.clear();
      for (const t of list) {
        if (t.thumb) thumbData.set(t.photoId, `data:image/jpeg;base64,${t.thumb}`);
        const uri = thumbData.get(t.photoId);
        if (uri) thumbs.set(itemKey(t.name, t.color), { photoId: t.photoId, uri });
      }
      notify();
    })
    .catch(() => {}) // keep what we have; rows fall back to the icon
    .finally(() => {
      thumbsLoading = null;
    });
  return thumbsLoading;
}

/** Update the local copy right after an upload or removal so every screen shows it at once. */
export function setItemThumb(name: string, color: string, photo: { photoId: string; thumb: string; full?: string } | null) {
  const key = itemKey(name, color);
  if (!photo) thumbs.delete(key);
  else {
    const uri = `data:image/jpeg;base64,${photo.thumb}`;
    thumbData.set(photo.photoId, uri);
    thumbs.set(key, { photoId: photo.photoId, uri });
    if (photo.full) cache.set(photo.photoId, `data:image/jpeg;base64,${photo.full}`);
  }
  notify();
}

/** Look up a product's thumbnail by name and colour. Loads the list on first use. */
export function useItemThumbs(): (name: string, color: string) => ItemThumb | undefined {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    void refreshItemThumbs();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (name, color) => thumbs.get(itemKey(name, color));
}
