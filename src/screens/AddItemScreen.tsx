import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import { Button, Card, Chips, ErrorText, Input, Label, moneyShort, Screen, SectionLabel, success, toNumber, ui, useToast } from '../ui';

const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export default function AddItemScreen() {
  const nav = useNavigation();
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const [f, setF] = useState({ itemId: '', category: 'Tops', name: '', size: 'M', color: '', costPrice: '', sellingPrice: '', initialStock: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

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
      await api.addItem({ ...f, itemId: f.itemId.trim(), name: f.name.trim(), color: f.color.trim(), costPrice: cost, sellingPrice: price, initialStock: stock });
      success();
      toast(`${f.name.trim()} added to stock.`);
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>The piece</SectionLabel>
            <Input label="Item name" value={f.name} onChangeText={set('name')} autoCapitalize="words" placeholder="Linen shirt" />
            <Label>Category</Label>
            <Chips options={CATEGORIES} value={f.category} onChange={set('category')} style={{ marginBottom: 16 }} />
            <Label>Size</Label>
            <Chips options={SIZES} value={f.size} onChange={set('size')} style={{ marginBottom: 16 }} />
            <Input label="Colour" value={f.color} onChangeText={set('color')} autoCapitalize="words" placeholder="White" />
            <Input
              label="Item ID"
              value={f.itemId}
              onChangeText={set('itemId')}
              placeholder="TOP-002-M-WHT"
              autoCapitalize="characters"
              hint="Use one ID for each size and colour."
              style={{ marginBottom: 0 }}
            />
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>Price and stock</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Input label="Cost price" prefix="Rs" value={f.costPrice} onChangeText={set('costPrice')} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Input label="Selling price" prefix="Rs" value={f.sellingPrice} onChangeText={set('sellingPrice')} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            {margin !== null ? (
              <Text style={[ui.muted, { marginTop: -4, marginBottom: 14, color: margin < 0 ? colors.owed : colors.ok, fontWeight: '500' }]}>
                {margin < 0 ? 'Selling below cost' : `Profit ${moneyShort(price - cost)} each · ${(margin * 100).toFixed(0)}% margin`}
              </Text>
            ) : null}
            <Input label="Units in stock" value={f.initialStock} onChangeText={set('initialStock')} keyboardType="number-pad" placeholder="0" style={{ marginBottom: 0 }} />
          </Card>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <ErrorText message={error} />
            <Button title="Save item" onPress={save} loading={busy} style={{ marginTop: 8 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
