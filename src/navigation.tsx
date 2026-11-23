import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from './auth';
import { ShellMark } from './brand';
import AddItemScreen from './screens/AddItemScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import CustomersScreen from './screens/CustomersScreen';
import ExpensesScreen from './screens/ExpensesScreen';
import HomeScreen from './screens/HomeScreen';
import MoreScreen from './screens/MoreScreen';
import OpeningSetupScreen from './screens/OpeningSetupScreen';
import OwnersScreen from './screens/OwnersScreen';
import ReportsScreen from './screens/ReportsScreen';
import SaleDetailScreen from './screens/SaleDetailScreen';
import SalesScreen from './screens/SalesScreen';
import SellScreen from './screens/SellScreen';
import StockScreen from './screens/StockScreen';
import { colors, fonts } from './theme';
import type { Invoice } from './invoices';
import { canManage, type InventoryItem } from './types';
import { tap } from './ui';

/** EditItem reuses the New item form. `pricesLocked`: the item has sales and old sales still look up its price. */
export type StockStackParams = { StockList: undefined; AddItem: undefined; EditItem: { item: InventoryItem; pricesLocked: boolean } };
export type CustomersStackParams = { CustomerList: undefined; CustomerDetail: { name: string; contact: string; photoId?: string } };
/** SaleDetail shows one sale as an invoice. */
export type SalesStackParams = { SalesList: undefined; NewSale: undefined; SaleDetail: { invoice: Invoice; photoId?: string } };
export type MoreStackParams = { MoreHome: undefined; Expenses: undefined; Reports: undefined; Owners: undefined; OpeningSetup: undefined };
/** Reports, Owners & cash and Opening balances now live in the More stack. */
export type ReportsStackParams = MoreStackParams;

const header = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleAlign: 'left' as const,
  headerTitleStyle: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink },
  headerBackButtonDisplayMode: 'minimal' as const,
};

// Stack roots use the tab navigator's header (left-aligned serif title) so every tab looks the
// same; pushed screens use the native stack header with a back button.
const detailHeader = { headerTitleStyle: { ...header.headerTitleStyle, fontSize: 19 } };

const StockStack = createNativeStackNavigator<StockStackParams>();
function StockNav() {
  return (
    <StockStack.Navigator screenOptions={header}>
      <StockStack.Screen name="StockList" component={StockScreen} options={{ headerShown: false }} />
      <StockStack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'New item', ...detailHeader }} />
      <StockStack.Screen name="EditItem" component={AddItemScreen} options={{ title: 'Edit item', ...detailHeader }} />
    </StockStack.Navigator>
  );
}

const SalesStack = createNativeStackNavigator<SalesStackParams>();
function SalesNav() {
  return (
    <SalesStack.Navigator screenOptions={header}>
      <SalesStack.Screen name="SalesList" component={SalesScreen} options={{ headerShown: false }} />
      <SalesStack.Screen name="NewSale" component={SellScreen} options={{ title: 'New sale', ...detailHeader }} />
      <SalesStack.Screen name="SaleDetail" component={SaleDetailScreen} options={{ title: 'Invoice', ...detailHeader }} />
    </SalesStack.Navigator>
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

const MoreStack = createNativeStackNavigator<MoreStackParams>();
function MoreNav() {
  const { user } = useAuth();
  const isOwner = canManage(user?.role);
  return (
    <MoreStack.Navigator screenOptions={header}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      {isOwner ? (
        <>
          <MoreStack.Screen name="Expenses" component={ExpensesScreen} options={detailHeader} />
          <MoreStack.Screen name="Reports" component={ReportsScreen} options={detailHeader} />
          <MoreStack.Screen name="Owners" component={OwnersScreen} options={{ title: 'Owners & cash', ...detailHeader }} />
          <MoreStack.Screen name="OpeningSetup" component={OpeningSetupScreen} options={{ title: 'Opening balances', ...detailHeader }} />
        </>
      ) : null}
    </MoreStack.Navigator>
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

const HOME_SIZE = 62;

/**
 * Home sits in the middle of the bar as the Calico shell, raised above the bar so it reads as the
 * app's anchor. A rust ring shows when Home is the current tab.
 */
function HomeTabButton({ onPress, onLongPress, 'aria-selected': selected }: BottomTabBarButtonProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="tab"
        accessibilityLabel="Home"
        accessibilityState={{ selected: !!selected }}
        hitSlop={6}
        style={({ pressed }) => ({
          width: HOME_SIZE,
          height: HOME_SIZE,
          borderRadius: HOME_SIZE / 2,
          marginTop: -HOME_SIZE / 3,
          backgroundColor: colors.surface,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.rust : colors.line,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.ink,
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <ShellMark size={36} />
      </Pressable>
    </View>
  );
}

const Tabs = createBottomTabNavigator();

/**
 * Five slots: the everyday jobs either side of Home, and More for less frequent tools
 * (expenses, reports, owners, account). Sales sits next to Home so the main job is one thumb away:
 * its list shows what has been sold and its + button starts a new sale.
 */
export function MainTabs() {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={{
        ...header,
        tabBarActiveTintColor: colors.rust,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
      screenListeners={{ tabPress: () => tap() }}
    >
      <Tabs.Screen
        name="Stock"
        component={StockNav}
        options={(p) => ({ ...rootHeaderOnly('StockList')(p), tabBarIcon: icon('shirt') })}
      />
      <Tabs.Screen
        name="Sales"
        component={SalesNav}
        options={(p) => ({ ...rootHeaderOnly('SalesList')(p), tabBarIcon: icon('bag-handle') })}
      />
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Home', tabBarButton: (props) => <HomeTabButton {...props} /> }} />
      <Tabs.Screen
        name="Customers"
        component={CustomersNav}
        options={(p) => ({ ...rootHeaderOnly('CustomerList')(p), tabBarIcon: icon('people') })}
      />
      <Tabs.Screen
        name="More"
        component={MoreNav}
        options={(p) => ({ ...rootHeaderOnly('MoreHome')(p), tabBarIcon: icon('grid') })}
      />
    </Tabs.Navigator>
  );
}
