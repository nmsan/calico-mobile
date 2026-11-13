export type Role = 'owner' | 'staff';

export interface User {
  username: string;
  role: Role;
}

export interface InventoryItem {
  row: number;
  itemId: string;
  category: string;
  name: string;
  size: string;
  color: string;
  sellingPrice: number;
  costPrice?: number; // owner only
  initialStock: number;
  unitsSold: number;
  currentStock: number;
  status: string;
}

export interface Sale {
  row: number;
  date: string;
  customerName: string;
  contact: string;
  itemId: string;
  itemName: string;
  variant: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

export interface Customer {
  customerId: string;
  name: string;
  contact: string;
  purchases: number;
  totalSpent: number;
  totalPaid: number;
  balance: number;
  lastPurchase: string;
  status: string;
}

export interface Expense {
  row: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  method: string;
}

export interface DashboardNumbers {
  grossSales?: number;
  discounts?: number;
  netRevenue?: number;
  cashCollected?: number;
  receivable?: number;
  cogs?: number;
  expenses?: number;
  grossProfit?: number;
  netProfit?: number;
  grossMargin?: number;
  netMargin?: number;
  inventoryValue?: number;
}

export interface Dashboard {
  allTime: DashboardNumbers;
  period: DashboardNumbers;
  periodStart: string;
  periodEnd: string;
}

export interface Meta {
  user: User;
  lowStockLevel: number;
  expenseCategories: string[];
  paymentMethods: string[];
  today: string;
}

export interface SaleLineInput {
  itemId: string;
  qty: number;
  discount?: number;
}

export interface RecordSaleResult {
  rows: Sale[];
  total: number;
  paid: number;
  balance: number;
}

export interface PaymentResult {
  applied: { row: number; itemName: string; date: string; applied: number }[];
  remainingBalance: number;
}
