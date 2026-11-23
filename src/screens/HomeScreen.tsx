import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { OwedWidget } from '../components/OwedWidget';
import { ProfitWidget } from '../components/ProfitWidget';
import { SalesWidget } from '../components/SalesWidget';
import { useAuth } from '../auth';
import { AddCustomerSheet } from './CustomersScreen';
import { AddExpenseSheet } from './ExpensesScreen';
import { canManage } from '../types';
import { colors } from '../theme';
import { Screen, tap } from '../ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Round header button with a "+ Label" caption under it. `filled` marks the main action. */
function HeaderAction({ icon, label, filled, onPress }: { icon: IconName; label: string; filled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`New ${label.toLowerCase()}`}
      style={({ pressed }) => ({ alignItems: 'center', gap: 3, minWidth: 52, opacity: pressed ? 0.75 : 1 })}
    >
      {({ pressed }) => (
        <>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: filled ? colors.rust : colors.shell,
              borderWidth: filled ? 0 : 1,
              borderColor: colors.line,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            }}
          >
            <Ionicons name={icon} size={19} color={filled ? '#fff' : colors.rust} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            <Ionicons name="add" size={14} color={filled ? colors.rust : colors.ink2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: filled ? colors.rust : colors.ink2 }}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** Dashboard. Widgets reload when the tab gains focus (a sale may have just been recorded) and on pull-down. */
export default function HomeScreen() {
  const [refreshToken, setRefreshToken] = useState(0);
  const { user } = useAuth();
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const isOwner = canManage(user?.role);
  const busy = useRef<Record<string, boolean>>({});
  const [pulled, setPulled] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Shortcuts in the header: record an expense (owners), add a customer and start a sale (everyone).
  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {isOwner ? <HeaderAction icon="receipt-outline" label="Expense" onPress={() => setAddingExpense(true)} /> : null}
          <HeaderAction icon="person-outline" label="Customer" onPress={() => setAddingCustomer(true)} />
          <HeaderAction icon="bag-handle-outline" label="Sale" filled onPress={() => nav.navigate('Sales', { screen: 'NewSale', initial: false })} />
        </View>
      ),
      headerRightContainerStyle: { paddingRight: 12 },
      headerStyle: { backgroundColor: colors.paper, height: 112 },
    });
  }, [nav, isOwner]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false; // the widget does its own first load
        return;
      }
      setRefreshToken((t) => t + 1);
    }, [])
  );

  // Each widget reports when it starts and stops loading; the pull-down spinner stops when all are done.
  const track = useCallback(
    (id: string) => (l: boolean) => {
      busy.current[id] = l;
      if (!l && !Object.values(busy.current).some(Boolean)) setPulled(false);
    },
    []
  );
  const [onSales, onOwed, onProfit] = useMemo(() => [track('sales'), track('owed'), track('profit')], [track]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={pulled}
            onRefresh={() => {
              setPulled(true);
              setRefreshToken((t) => t + 1);
            }}
            tintColor={colors.rust}
          />
        }
      >
        <SalesWidget refreshToken={refreshToken} onLoadingChange={onSales} />
        {isOwner ? <ProfitWidget refreshToken={refreshToken} onLoadingChange={onProfit} /> : null}
        <OwedWidget refreshToken={refreshToken} onLoadingChange={onOwed} />
      </ScrollView>
      <AddCustomerSheet
        visible={addingCustomer}
        onClose={() => setAddingCustomer(false)}
        onSaved={() => {
          setAddingCustomer(false);
          setRefreshToken((t) => t + 1);
        }}
      />
      {isOwner ? (
        <AddExpenseSheet
          visible={addingExpense}
          onClose={() => setAddingExpense(false)}
          onSaved={() => {
            setAddingExpense(false);
            setRefreshToken((t) => t + 1); // profit changes
          }}
        />
      ) : null}
    </Screen>
  );
}
