export type Role = 'admin' | 'owner' | 'staff';

/** Admins and owners see everything; staff only sell and view. */
export const canManage = (role: Role | undefined) => role === 'admin' || role === 'owner';

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
  /** Drive file ID of the customer's photo, if one was added. */
  photoId?: string;
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

export type OwnerTxType = 'Capital in' | 'Drawing';

export interface OwnerTransaction {
  row: number;
  date: string;
  owner: string;
  type: OwnerTxType;
  amount: number;
  method: string;
  note: string;
  enteredBy: string;
}

/** The go-live snapshot: what the business had when it started using the app. */
export interface OpeningBalances {
  date: string;
  cash: number;
  stockValue: number;
  receivable: number;
  capital: number;
  drawings: number;
  /** Profit made before the app that nobody recorded (the balancing figure). */
  pastProfit: number;
  owners: { username: string; capital: number; drawings: number }[];
  profitShare: Record<string, number>;
  savedBy: string;
  savedAt: string;
  preview?: boolean;
}

export interface PartnerBalance {
  username: string;
  sharePercent: number;
  openingCapital: number;
  capitalIn: number;
  openingDrawings: number;
  drawings: number;
  profitShare: number;
  balance: number;
}

export interface OwnerSummary {
  opening: OpeningBalances | null;
  owners: string[];
  partners: PartnerBalance[];
  totals: {
    netRevenue: number;
    cogs: number;
    expenses: number;
    profitSince: number;
    pastProfit: number;
    cashCollected: number;
    capitalIn: number;
    drawings: number;
    cashEstimate: number;
    equity: number;
  } | null;
}

export interface OpeningInput {
  date: string;
  cash: number;
  owners: { username: string; capital: number; drawings: number }[];
  profitShare: Record<string, number>;
  overwrite?: boolean;
}

/** One day's sales totals from getSalesDaily. A sale with several items counts as several lines. */
export interface SalesDay {
  date: string;
  total: number;
  paid: number;
  balance: number;
  qty: number;
  lines: number;
}

export interface SalesDailyResult {
  from: string;
  to: string;
  /** Today in the sheet's time zone. */
  today: string;
  days: SalesDay[];
  /** Only when includeLines was sent. Newest first. */
  lines?: Sale[];
}
