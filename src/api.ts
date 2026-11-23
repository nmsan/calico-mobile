import type {
  Customer,
  Dashboard,
  Expense,
  InventoryItem,
  ItemHistory,
  Meta,
  OpeningBalances,
  OpeningInput,
  OwnerSummary,
  OwnerTransaction,
  OwnerTxType,
  PaymentResult,
  RecordSaleResult,
  Sale,
  SaleLineInput,
  SalesDailyResult,
  User,
} from './types';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.code = code;
  }
}

type Config = {
  baseUrl: string;
  token: string | null;
  onUnauthorized?: (reason: string) => void;
};

const config: Config = { baseUrl: '', token: null };

export function configureApi(next: Partial<Config>) {
  Object.assign(config, next);
}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!config.baseUrl) throw new ApiError('Server URL is not set', 'CONFIG');
  let res: Response;
  try {
    // text/plain keeps this a "simple" request, which Apps Script web apps accept without a CORS preflight.
    res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: config.token, ...params }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 'NETWORK');
  }
  const text = await res.text();
  let json: { ok: boolean; data?: T; error?: string; code?: string };
  try {
    json = JSON.parse(text);
  } catch {
    // Apps Script returns an HTML page when the deployment URL is wrong or access is not "Anyone".
    throw new ApiError('The server did not return JSON. Check the API URL and that the web app access is set to "Anyone".', 'BAD_RESPONSE');
  }
  if (!json.ok) {
    if (json.code === 'UNAUTHORIZED' && action !== 'login') {
      console.warn(`[calico] signed out: "${action}" was rejected by the server: ${json.error}`);
      config.onUnauthorized?.(json.error || 'Please sign in again.');
    }
    throw new ApiError(json.error || 'Request failed', json.code);
  }
  return json.data as T;
}

export const api = {
  ping: () => call<{ service: string; time: string }>('ping'),
  login: (username: string, pin: string) => call<{ token: string; user: User }>('login', { username, pin }),
  logout: () => call<{ loggedOut: boolean }>('logout'),
  meta: () => call<Meta>('getMeta'),

  inventory: () => call<{ lowStockLevel: number; salePricesSaved?: boolean; items: InventoryItem[] }>('getInventory'),
  addItem: (item: {
    itemId: string;
    category: string;
    name: string;
    size: string;
    color: string;
    costPrice: number;
    sellingPrice: number;
    initialStock: number;
  }) => call<InventoryItem>('addInventoryItem', item),
  updateItem: (item: {
    itemId: string;
    category: string;
    name: string;
    size: string;
    color: string;
    costPrice?: number;
    sellingPrice?: number;
    stock: number;
  }) => call<InventoryItem>('updateInventoryItem', item),
  restock: (itemId: string, qty: number) => call<InventoryItem>('restockItem', { itemId, qty }),
  itemHistory: (itemId: string) => call<ItemHistory>('getItemHistory', { itemId }),

  recordSale: (sale: { date?: string; customerName: string; contact: string; amountPaid: number; items: SaleLineInput[] }) =>
    call<RecordSaleResult>('recordSale', sale),
  recentSales: (limit = 50) => call<Sale[]>('getRecentSales', { limit }),
  salesDaily: (from: string, to: string, includeLines = false) =>
    call<SalesDailyResult>('getSalesDaily', includeLines ? { from, to, includeLines } : { from, to }),

  customers: () => call<Customer[]>('getCustomers'),
  itemThumbs: (have: string[]) => call<{ name: string; color: string; photoId: string; thumb?: string }[]>('getItemThumbs', { have }),
  itemPhoto: (photoId: string) => call<{ photoId: string; mimeType: string; data: string }>('getItemPhoto', { photoId }),
  setItemPhoto: (itemId: string, data: string, thumb: string) =>
    call<{ name: string; color: string; photoId: string; thumb: string }>('setItemPhoto', { itemId, data, thumb, mimeType: 'image/jpeg' }),
  removeItemPhoto: (itemId: string) => call<{ removed: boolean }>('removeItemPhoto', { itemId }),
  addCustomer: (name: string, contact: string) => call<Customer>('addCustomer', { name, contact }),
  setCustomerPhoto: (name: string, contact: string, data: string) =>
    call<{ photoId: string }>('setCustomerPhoto', { name, contact, data, mimeType: 'image/jpeg' }),
  customerPhoto: (photoId: string) => call<{ photoId: string; mimeType: string; data: string }>('getCustomerPhoto', { photoId }),
  removeCustomerPhoto: (name: string, contact: string) => call<{ removed: boolean }>('removeCustomerPhoto', { name, contact }),
  customerSales: (customerName: string, contact: string) => call<Sale[]>('getCustomerSales', { customerName, contact }),
  recordPayment: (customerName: string, contact: string, amount: number) =>
    call<PaymentResult>('recordPayment', { customerName, contact, amount }),

  dashboard: (month?: string) => call<Dashboard>('getDashboard', month ? { month } : {}),
  expenses: (limit = 100) => call<Expense[]>('getExpenses', { limit }),
  addExpense: (e: { date?: string; category: string; description: string; amount: number; method: string }) =>
    call<Expense>('addExpense', e),

  ownerSummary: () => call<OwnerSummary>('getOwnerSummary'),
  previewOpening: (o: OpeningInput) => call<OpeningBalances>('saveOpeningBalances', { ...o, preview: true }),
  saveOpening: (o: OpeningInput) => call<OpeningBalances>('saveOpeningBalances', { ...o }),
  setStockCounts: (counts: { itemId: string; qty: number }[]) => call<InventoryItem[]>('setStockCounts', { counts }),
  ownerTransactions: (owner?: string, limit = 200) =>
    call<OwnerTransaction[]>('getOwnerTransactions', owner ? { owner, limit } : { limit }),
  addOwnerTransaction: (t: { date?: string; owner: string; type: OwnerTxType; amount: number; method: string; note: string }) =>
    call<OwnerTransaction>('addOwnerTransaction', t),
};
