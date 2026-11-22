import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { DEFAULT_ITEM_CATEGORIES, useItemCategories } from '../categories';
import { ItemPhotoPreview } from '../components/ItemPhoto';
import { PhotoPicker } from '../components/PhotoPicker';
import { setItemThumb, useItemThumbs, type PickedPhoto } from '../photos';
import { DEFAULT_ITEM_SIZES, useItemSizes } from '../sizes';
import { AutocompleteInput, useItemSuggestions } from '../suggestions';
import type { StockStackParams } from '../navigation';
import { colors } from '../theme';
import { Button, Card, ErrorText, Input, Label, moneyShort, Screen, SectionLabel, success, tap, toNumber, ui, useToast } from '../ui';

/** New item, or Edit item when opened with an item (the Item ID is then fixed). */
export default function AddItemScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<StockStackParams, 'EditItem'>>();
  const editing = route.params?.item;
  const pricesLocked = !!route.params?.pricesLocked;
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const { categories: savedCategories, addCategory, removeCategory } = useItemCategories();
  const { sizes: savedSizes, addSize, removeSize } = useItemSizes();
  // When editing, always offer the item's own category and size, even if this phone's lists lack them.
  const withOwn = (list: string[], own?: string) => (own && !list.some((x) => x.toLowerCase() === own.toLowerCase()) ? [...list, own] : list);
  const categories = withOwn(savedCategories, route.params?.item?.category);
  const sizes = withOwn(savedSizes, route.params?.item?.size);
  const { itemNames, knownColors, itemDetails, saveSuggestion } = useItemSuggestions();

  const [f, setF] = useState(
    editing
      ? {
          itemId: editing.itemId,
          category: editing.category,
          name: editing.name,
          size: editing.size,
          color: editing.color,
          costPrice: editing.costPrice !== undefined ? String(editing.costPrice) : '',
          sellingPrice: String(editing.sellingPrice),
          initialStock: String(editing.currentStock),
        }
      : { itemId: '', category: 'Tops', name: '', size: 'M', color: '', costPrice: '', sellingPrice: '', initialStock: '' }
  );
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const thumbOf = useItemThumbs();
  const shared = f.name.trim() ? thumbOf(f.name, f.color) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function handleAddCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    const added = await addCategory(trimmed);
    if (added) {
      set('category')(added);
      toast(`Category "${added}" added`);
      success();
    }
    setNewCatName('');
    setShowAddCat(false);
  }

  async function handleAddSize() {
    const trimmed = newSizeName.trim();
    if (!trimmed) return;
    const added = await addSize(trimmed);
    if (added) {
      set('size')(added);
      toast(`Size "${added}" added`);
      success();
    }
    setNewSizeName('');
    setShowAddSize(false);
  }

  const cost = toNumber(f.costPrice);
  const price = toNumber(f.sellingPrice);
  const margin = Number.isFinite(cost) && Number.isFinite(price) && price > 0 && f.costPrice && f.sellingPrice ? (price - cost) / price : null;

  async function save() {
    setError(null);
    const stock = toNumber(f.initialStock);
    if (!f.itemId.trim() || !f.name.trim()) return setError('Item ID and name are required.');
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) return setError('Enter a cost price and a selling price above 0.');
    if (!Number.isInteger(stock) || stock < 0) return setError('Units in stock must be a whole number.');
    setBusy(true);
    try {
      if (editing) {
        await api.updateItem({
          itemId: editing.itemId,
          category: f.category,
          name: f.name.trim(),
          size: f.size,
          color: f.color.trim(),
          ...(pricesLocked ? {} : { costPrice: cost, sellingPrice: price }),
          stock,
        });
      } else {
        await api.addItem({ ...f, itemId: f.itemId.trim(), name: f.name.trim(), color: f.color.trim(), costPrice: cost, sellingPrice: price, initialStock: stock });
      }
      void saveSuggestion(f.name.trim(), f.color.trim());
      let photoFailed = false;
      if (photo?.thumb) {
        try {
          const r = await api.setItemPhoto(f.itemId.trim(), photo.base64, photo.thumb);
          setItemThumb(r.name, r.color, { photoId: r.photoId, thumb: r.thumb, full: photo.base64 });
        } catch {
          photoFailed = true;
        }
      }
      success();
      toast(
        photoFailed
          ? `${f.name.trim()} saved, but the photo did not upload. Add it from Stock.`
          : editing
            ? `${f.name.trim()} updated.`
            : `${f.name.trim()} added to stock.`,
        photoFailed ? 'error' : 'ok'
      );
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>The piece</SectionLabel>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <PhotoPicker
                kind="item"
                name={f.name}
                hasPhoto={!!photo}
                preview={<ItemPhotoPreview uri={photo?.uri} thumb={photo ? undefined : shared} width={96} />}
                onPicked={setPhoto}
                onRemove={() => setPhoto(null)}
              />
              <Text style={[ui.muted, { flex: 1, fontSize: 13, lineHeight: 18 }]}>
                {photo
                  ? 'This photo will be used for every size in this colour.'
                  : shared
                    ? `Using the photo already saved for ${f.name.trim()} in ${f.color.trim() || 'this colour'}. Tap to replace it.`
                    : 'Optional. A clear photo helps staff find the piece when selling.'}
              </Text>
            </View>

            {/* Item Name with Spreadsheet-like autocomplete */}
            <AutocompleteInput
              label="Item name"
              value={f.name}
              onChangeText={set('name')}
              suggestions={itemNames}
              autoCapitalize="words"
              placeholder="Linen shirt"
              onSelectSuggestion={(selectedName) => {
                const detail = itemDetails[selectedName.toLowerCase()];
                if (detail) {
                  setF((prev) => ({
                    ...prev,
                    name: selectedName,
                    category: detail.category || prev.category,
                    costPrice: detail.costPrice !== undefined && !prev.costPrice ? String(detail.costPrice) : prev.costPrice,
                    sellingPrice: detail.sellingPrice !== undefined && !prev.sellingPrice ? String(detail.sellingPrice) : prev.sellingPrice,
                  }));
                }
              }}
            />

            {/* Category header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Label>Category</Label>
              <Pressable
                onPress={() => {
                  tap();
                  setShowAddCat((prev) => !prev);
                }}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
                accessibilityRole="button"
                accessibilityLabel={showAddCat ? 'Cancel adding category' : 'Add new category'}
              >
                <Ionicons name={showAddCat ? 'close-circle-outline' : 'add-circle-outline'} size={16} color={colors.rust} />
                <Text style={{ color: colors.rust, fontSize: 13, fontWeight: '600' }}>
                  {showAddCat ? 'Cancel' : '+ New category'}
                </Text>
              </Pressable>
            </View>

            {/* Category add input */}
            {showAddCat ? (
              <View
                style={{
                  marginBottom: 12,
                  backgroundColor: colors.shell,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink, marginBottom: 8 }}>Add custom category</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Input
                    placeholder="e.g. Shoes, Bags, Jewellery"
                    value={newCatName}
                    onChangeText={setNewCatName}
                    autoCapitalize="words"
                    autoFocus
                    style={{ flex: 1, marginBottom: 0 }}
                    onSubmitEditing={handleAddCategory}
                    returnKeyType="done"
                  />
                  <Button
                    title="Add"
                    onPress={handleAddCategory}
                    disabled={!newCatName.trim()}
                    style={{ minHeight: 46, paddingHorizontal: 16 }}
                  />
                </View>
              </View>
            ) : null}

            {/* Category chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {categories.map((cat) => {
                const on = f.category === cat;
                const isCustom = !DEFAULT_ITEM_CATEGORIES.includes(cat);
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      if (!on) tap();
                      set('category')(cat);
                    }}
                    onLongPress={
                      isCustom
                        ? () => {
                            Alert.alert('Remove Category', `Remove "${cat}" from your category list?`, [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () => {
                                  void removeCategory(cat);
                                  if (f.category === cat) {
                                    set('category')(DEFAULT_ITEM_CATEGORIES[0]);
                                  }
                                  toast(`Removed "${cat}"`);
                                },
                              },
                            ]);
                          }
                        : undefined
                    }
                    style={[ui.chip, on && ui.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityHint={isCustom ? 'Long-press to remove' : undefined}
                  >
                    <Text style={[ui.chipText, on && { color: '#fff' }]}>{cat}</Text>
                  </Pressable>
                );
              })}

              {!showAddCat ? (
                <Pressable
                  onPress={() => {
                    tap();
                    setShowAddCat(true);
                  }}
                  style={[
                    ui.chip,
                    {
                      borderStyle: 'dashed',
                      borderColor: colors.rust,
                      backgroundColor: 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add new category"
                >
                  <Ionicons name="add" size={15} color={colors.rust} />
                  <Text style={[ui.chipText, { color: colors.rust, fontWeight: '600' }]}>Add</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Size header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Label>Size</Label>
              <Pressable
                onPress={() => {
                  tap();
                  setShowAddSize((prev) => !prev);
                }}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
                accessibilityRole="button"
                accessibilityLabel={showAddSize ? 'Cancel adding size' : 'Add new size'}
              >
                <Ionicons name={showAddSize ? 'close-circle-outline' : 'add-circle-outline'} size={16} color={colors.rust} />
                <Text style={{ color: colors.rust, fontSize: 13, fontWeight: '600' }}>
                  {showAddSize ? 'Cancel' : '+ New size'}
                </Text>
              </Pressable>
            </View>

            {/* Size add input */}
            {showAddSize ? (
              <View
                style={{
                  marginBottom: 12,
                  backgroundColor: colors.shell,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink, marginBottom: 8 }}>Add custom size</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Input
                    placeholder="e.g. 3XL, Free Size, 32, UK 10"
                    value={newSizeName}
                    onChangeText={setNewSizeName}
                    autoCapitalize="characters"
                    autoFocus
                    style={{ flex: 1, marginBottom: 0 }}
                    onSubmitEditing={handleAddSize}
                    returnKeyType="done"
                  />
                  <Button
                    title="Add"
                    onPress={handleAddSize}
                    disabled={!newSizeName.trim()}
                    style={{ minHeight: 46, paddingHorizontal: 16 }}
                  />
                </View>
              </View>
            ) : null}

            {/* Size chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {sizes.map((sz) => {
                const on = f.size === sz;
                const isCustom = !DEFAULT_ITEM_SIZES.includes(sz);
                return (
                  <Pressable
                    key={sz}
                    onPress={() => {
                      if (!on) tap();
                      set('size')(sz);
                    }}
                    onLongPress={
                      isCustom
                        ? () => {
                            Alert.alert('Remove Size', `Remove "${sz}" from your size list?`, [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () => {
                                  void removeSize(sz);
                                  if (f.size === sz) {
                                    set('size')(DEFAULT_ITEM_SIZES[2] || 'M');
                                  }
                                  toast(`Removed "${sz}"`);
                                },
                              },
                            ]);
                          }
                        : undefined
                    }
                    style={[ui.chip, on && ui.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityHint={isCustom ? 'Long-press to remove' : undefined}
                  >
                    <Text style={[ui.chipText, on && { color: '#fff' }]}>{sz}</Text>
                  </Pressable>
                );
              })}

              {!showAddSize ? (
                <Pressable
                  onPress={() => {
                    tap();
                    setShowAddSize(true);
                  }}
                  style={[
                    ui.chip,
                    {
                      borderStyle: 'dashed',
                      borderColor: colors.rust,
                      backgroundColor: 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add new size"
                >
                  <Ionicons name="add" size={15} color={colors.rust} />
                  <Text style={[ui.chipText, { color: colors.rust, fontWeight: '600' }]}>Add</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Colour with Spreadsheet-like autocomplete */}
            <AutocompleteInput
              label="Colour"
              value={f.color}
              onChangeText={set('color')}
              suggestions={knownColors}
              autoCapitalize="words"
              placeholder="White"
            />

            <Input
              label="Item ID"
              value={f.itemId}
              onChangeText={set('itemId')}
              placeholder="TOP-002-M-WHT"
              autoCapitalize="characters"
              editable={!editing}
              hint={editing ? "The ID can't change: past sales point to it." : 'Use one ID for each size and colour.'}
              style={{ marginBottom: 0 }}
            />
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>Price and stock</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Input label="Cost price" prefix="Rs" value={f.costPrice} onChangeText={set('costPrice')} keyboardType="decimal-pad" editable={!pricesLocked} style={{ flex: 1 }} />
              <Input label="Selling price" prefix="Rs" value={f.sellingPrice} onChangeText={set('sellingPrice')} keyboardType="decimal-pad" editable={!pricesLocked} style={{ flex: 1 }} />
            </View>
            {pricesLocked ? (
              <Text style={[ui.muted, { marginTop: -4, marginBottom: 14, fontSize: 13 }]}>
                {"Prices are locked because this item has sales and the sheet still works out old sales from today's price. Run snapshotSalePrices once in the script editor to unlock price edits."}
              </Text>
            ) : editing && editing.unitsSold > 0 ? (
              <Text style={[ui.muted, { marginTop: -4, marginBottom: 14, fontSize: 13 }]}>New prices apply to future sales. Past sales keep the price they were sold at.</Text>
            ) : null}
            {margin !== null ? (
              <Text style={[ui.muted, { marginTop: -4, marginBottom: 14, color: margin < 0 ? colors.owed : colors.ok, fontWeight: '500' }]}>
                {margin < 0 ? 'Selling below cost' : `Profit ${moneyShort(price - cost)} each · ${(margin * 100).toFixed(0)}% margin`}
              </Text>
            ) : null}
            <Input
              label={editing ? 'Units in stock now' : 'Units in stock'}
              value={f.initialStock}
              onChangeText={set('initialStock')}
              keyboardType="number-pad"
              placeholder="0"
              hint={editing ? 'What is on the shelf. Use this to correct a count; use Restock when new stock arrives.' : undefined}
              style={{ marginBottom: 0 }}
            />
          </Card>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <ErrorText message={error} />
            <Button title={editing ? 'Save changes' : 'Save item'} onPress={save} loading={busy} style={{ marginTop: 8 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
