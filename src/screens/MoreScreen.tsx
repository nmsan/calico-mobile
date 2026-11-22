import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { ShellMark } from '../brand';
import type { MoreStackParams } from '../navigation';
import { colors } from '../theme';
import { canManage } from '../types';
import { Avatar, Button, Card, Screen, SectionLabel, groupRow, tap, ui } from '../ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Item = { title: string; subtitle: string; icon: IconName; route: Exclude<keyof MoreStackParams, 'MoreHome'> };

/** Less frequent tools, kept off the tab bar so it stays at four destinations plus Home. */
const OWNER_ITEMS: Item[] = [
  { title: 'Expenses', subtitle: 'Rent, packaging, shipping and more', icon: 'wallet-outline', route: 'Expenses' },
  { title: 'Reports', subtitle: 'Profit and loss by month or all time', icon: 'stats-chart-outline', route: 'Reports' },
  { title: 'Owners & cash', subtitle: 'Partner balances, money taken, cash', icon: 'people-circle-outline', route: 'Owners' },
];

function Row({ item, index, count, onPress }: { item: Item; index: number; count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [groupRow(index, count), { gap: 14 }, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.shell, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={item.icon} size={20} color={colors.rust} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle}>{item.title}</Text>
        <Text style={ui.muted} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MoreStackParams>>();
  const { user, signOut } = useAuth();
  const name = user?.username ?? '';
  const items = canManage(user?.role) ? OWNER_ITEMS : [];
  const role = user?.role === 'admin' ? 'Admin' : user?.role === 'owner' ? 'Owner' : 'Staff';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{name}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>{role}</Text>
            </View>
          </View>
        </Card>

        {items.length ? (
          <>
            <SectionLabel style={{ marginHorizontal: 16, marginTop: 24, marginBottom: 8 }}>Business</SectionLabel>
            {items.map((item, i) => (
              <Row
                key={item.route}
                item={item}
                index={i}
                count={items.length}
                onPress={() => {
                  tap();
                  nav.navigate(item.route);
                }}
              />
            ))}
          </>
        ) : null}

        <View style={{ marginHorizontal: 16, marginTop: 28 }}>
          <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={() => void signOut()} />
        </View>

        <View style={{ alignItems: 'center', marginTop: 32, gap: 8, opacity: 0.8 }}>
          <ShellMark size={28} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Calico · Simple, everyday</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
