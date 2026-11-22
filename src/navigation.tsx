import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth';
import { ShellMark } from './brand';
import AddItemScreen from './screens/AddItemScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import CustomersScreen from './screens/CustomersScreen';
import ExpensesScreen from './screens/ExpensesScreen';
import OpeningSetupScreen from './screens/OpeningSetupScreen';
import OwnersScreen from './screens/OwnersScreen';
import ReportsScreen from './screens/ReportsScreen';
import SellScreen from './screens/SellScreen';
import StockScreen from './screens/StockScreen';
import { colors, fonts } from './theme';
import { canManage } from './types';
import { Avatar, Button, Sheet, initials, tap } from './ui';

export type StockStackParams = { StockList: undefined; AddItem: undefined };
export type CustomersStackParams = { CustomerList: undefined; CustomerDetail: { name: string; contact: string } };
export type ReportsStackParams = { ReportsHome: undefined; Owners: undefined; OpeningSetup: undefined };

/** Header button with the user's initials. Opens the account sheet (who is signed in, sign out). */
function AccountButton() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const name = user?.username ?? '';
  return (
    <>
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Account"
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.shell,
          borderWidth: 1,
          borderColor: colors.line,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: colors.rust, fontWeight: '700', fontSize: 12 }}>{initials(name)}</Text>
      </Pressable>
      <Sheet visible={open} title="Account" onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Avatar name={name} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{name}</Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>{user?.role === 'admin' ? 'Admin' : user?.role === 'owner' ? 'Owner' : 'Staff'}</Text>
          </View>
          <ShellMark size={36} />
        </View>
        <Button
          title="Sign out"
          variant="secondary"
          icon="log-out-outline"
          onPress={() => {
            setOpen(false);
            void signOut();
          }}
        />
      </Sheet>
    </>
  );
}

const header = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleAlign: 'left' as const,
  headerTitleStyle: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink },
  headerBackButtonDisplayMode: 'minimal' as const,
};

const withAccount = { headerRight: () => <AccountButton />, headerRightContainerStyle: { paddingRight: 16 } };

// Stack roots use the tab navigator's header (left-aligned serif title, account button) so every
// tab looks the same; pushed screens use the native stack header with a back button.
const detailHeader = { headerTitleStyle: { ...header.headerTitleStyle, fontSize: 19 } };

const StockStack = createNativeStackNavigator<StockStackParams>();
function StockNav() {
  return (
    <StockStack.Navigator screenOptions={header}>
      <StockStack.Screen name="StockList" component={StockScreen} options={{ headerShown: false }} />
      <StockStack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'New item', ...detailHeader }} />
    </StockStack.Navigator>
  );
}

const CustStack = createNativeStackNavigator<CustomersStackParams>();
function CustomersNav() {
  return (
    <CustStack.Navigator screenOptions={header}>
      <CustStack.Screen name="CustomerList" component={CustomersScreen} options={{ headerShown: false }} />
      <CustStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Customer', ...detailHeader }} />
    </CustStack.Navigator>
  );
}

const RepStack = createNativeStackNavigator<ReportsStackParams>();
function ReportsNav() {
  return (
    <RepStack.Navigator screenOptions={header}>
      <RepStack.Screen name="ReportsHome" component={ReportsScreen} options={{ headerShown: false }} />
      <RepStack.Screen name="Owners" component={OwnersScreen} options={{ title: 'Owners & cash', ...detailHeader }} />
      <RepStack.Screen name="OpeningSetup" component={OpeningSetupScreen} options={{ title: 'Opening balances', ...detailHeader }} />
    </RepStack.Navigator>
  );
}

/** Show the tab header only while the stack is on its first screen. */
const rootHeaderOnly = (rootName: string) => ({ route }: { route: Parameters<typeof getFocusedRouteNameFromRoute>[0] }) => ({
  headerShown: (getFocusedRouteNameFromRoute(route) ?? rootName) === rootName,
});

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: string) =>
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} color={color} size={23} />;
  };

const Tabs = createBottomTabNavigator();

export function MainTabs() {
  const { user } = useAuth();
  const isOwner = canManage(user?.role);
  return (
    <Tabs.Navigator
      screenOptions={{
        ...header,
        ...withAccount,
        tabBarActiveTintColor: colors.rust,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
      screenListeners={{ tabPress: () => tap() }}
    >
      <Tabs.Screen name="Sell" component={SellScreen} options={{ title: 'New sale', tabBarLabel: 'Sell', tabBarIcon: icon('bag-handle') }} />
      <Tabs.Screen
        name="Stock"
        component={StockNav}
        options={(p) => ({ ...rootHeaderOnly('StockList')(p), tabBarIcon: icon('shirt') })}
      />
      <Tabs.Screen
        name="Customers"
        component={CustomersNav}
        options={(p) => ({ ...rootHeaderOnly('CustomerList')(p), tabBarIcon: icon('people') })}
      />
      {isOwner ? (
        <>
          <Tabs.Screen name="Expenses" component={ExpensesScreen} options={{ tabBarIcon: icon('wallet') }} />
          <Tabs.Screen
            name="Reports"
            component={ReportsNav}
            options={(p) => ({ ...rootHeaderOnly('ReportsHome')(p), tabBarIcon: icon('stats-chart') })}
          />
        </>
      ) : null}
    </Tabs.Navigator>
  );
}
