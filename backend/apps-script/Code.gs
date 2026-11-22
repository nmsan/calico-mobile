/**
 * Calico Retail API — Google Apps Script web app over the "Calico inventory" sheet.
 *
 * All requests are POST with a JSON body: { "action": "...", "token": "...", ...params }
 * All responses are JSON: { "ok": true, "data": ... } or { "ok": false, "error": "..." }
 *
 * Roles:
 *   admin — everything, including every owner action (not counted as a partner)
 *   owner — everything
 *   staff — sell, take payments, view stock (without cost prices) and customers
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CFG = {
  SHEETS: {
    INVENTORY: 'Inventory',
    SALES: 'Sales',
    CUSTOMERS: 'Customers',
    EXPENSES: 'Expenses',
    DASHBOARD: 'P&L Dashboard',
    USERS: 'Users',
    LEDGER: 'Owner Ledger',
    DIRECTORY: 'Customer Directory',
    ITEM_PHOTOS: 'Item Photos',
  },
  SESSION_DAYS: 30,
  MAX_LOGIN_FAILS: 5,
  LOCKOUT_SECONDS: 15 * 60,
  LOW_STOCK_CELL: 'N1', // on Inventory
  DASH_START_CELL: 'F3', // on P&L Dashboard
  EXPENSE_CATEGORIES: ['Rent', 'Utilities', 'Packaging', 'Shipping', 'Marketing', 'Salaries', 'Other'],
  PAYMENT_METHODS: ['Cash', 'Bank Transfer', 'Card', 'Online Wallet'],
};

const ROLES = { ADMIN: 'admin', OWNER: 'owner', STAFF: 'staff' };

/** Admins pass every role check. */
function hasRole(user, roles) {
  return user.role === ROLES.ADMIN || roles.indexOf(user.role) !== -1;
}

function canSeeCosts(user) {
  return hasRole(user, [ROLES.OWNER]);
}

// action -> { roles: [...] | null (public), fn }
const ROUTES = {
  ping: { roles: null, fn: () => ({ service: 'calico-api', time: new Date().toISOString() }) },
  login: { roles: null, fn: actionLogin },
  logout: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionLogout },
  me: { roles: [ROLES.OWNER, ROLES.STAFF], fn: (p, user) => user },
  getMeta: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetMeta },

  getInventory: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetInventory },
  addInventoryItem: { roles: [ROLES.OWNER], fn: actionAddInventoryItem },
  restockItem: { roles: [ROLES.OWNER], fn: actionRestockItem },
  updateInventoryItem: { roles: [ROLES.OWNER], fn: actionUpdateInventoryItem },
  getItemThumbs: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetItemThumbs },
  getItemPhoto: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetItemPhoto },
  setItemPhoto: { roles: [ROLES.OWNER], fn: actionSetItemPhoto },
  removeItemPhoto: { roles: [ROLES.OWNER], fn: actionRemoveItemPhoto },

  recordSale: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionRecordSale },
  getRecentSales: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetRecentSales },
  getSalesDaily: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetSalesDaily },

  getCustomers: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetCustomers },
  getCustomerSales: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetCustomerSales },
  addCustomer: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionAddCustomer },
  setCustomerPhoto: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionSetCustomerPhoto },
  getCustomerPhoto: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionGetCustomerPhoto },
  removeCustomerPhoto: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionRemoveCustomerPhoto },
  recordPayment: { roles: [ROLES.OWNER, ROLES.STAFF], fn: actionRecordPayment },

  getDashboard: { roles: [ROLES.OWNER], fn: actionGetDashboard },
  getExpenses: { roles: [ROLES.OWNER], fn: actionGetExpenses },
  addExpense: { roles: [ROLES.OWNER], fn: actionAddExpense },

  getOwnerSummary: { roles: [ROLES.OWNER], fn: actionGetOwnerSummary },
  saveOpeningBalances: { roles: [ROLES.OWNER], fn: actionSaveOpeningBalances },
  setStockCounts: { roles: [ROLES.OWNER], fn: actionSetStockCounts },
  addOwnerTransaction: { roles: [ROLES.OWNER], fn: actionAddOwnerTransaction },
  getOwnerTransactions: { roles: [ROLES.OWNER], fn: actionGetOwnerTransactions },
};

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return jsonOut({ ok: true, data: ROUTES.ping.fn() });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = String(body.action || '');
    const route = ROUTES[action];
    if (!route) throw new ApiError('Unknown action: ' + action);

    let user = null;
    if (route.roles) {
      user = requireSession(body.token);
      if (!hasRole(user, route.roles)) {
        throw new ApiError('You do not have permission for this action', 'FORBIDDEN');
      }
    }
    const data = route.fn(body, user);
    return jsonOut({ ok: true, data: data });
  } catch (err) {
    const known = err instanceof ApiError;
    if (!known) console.error(err && err.stack ? err.stack : err);
    return jsonOut({
      ok: false,
      error: known ? err.message : 'Server error: ' + (err && err.message ? err.message : err),
      code: known ? err.code : 'SERVER_ERROR',
    });
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) throw new ApiError('Empty request body');
  try {
    return JSON.parse(e.postData.contents);
  } catch (x) {
    throw new ApiError('Request body must be JSON');
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || 'BAD_REQUEST';
  }
}

// ---------------------------------------------------------------------------
// Auth: users, PIN hashing, sessions
// ---------------------------------------------------------------------------

function hashPin(pin, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function makePinRecord(pin) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return salt + '$' + hashPin(pin, salt);
}

function checkPin(pin, record) {
  const parts = String(record || '').split('$');
  if (parts.length !== 2) return false;
  return hashPin(pin, parts[0]) === parts[1];
}

function getUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEETS.USERS);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEETS.USERS);
    sh.getRange(1, 1, 1, 5).setValues([['Username', 'PIN Hash', 'Role', 'Active', 'Created']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function findUser(username) {
  const sh = getUsersSheet();
  const values = sh.getDataRange().getValues();
  const want = String(username || '').trim().toLowerCase();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim().toLowerCase() === want && want) {
      return {
        row: r + 1,
        username: String(values[r][0]).trim(),
        pinRecord: String(values[r][1]),
        role: String(values[r][2]).trim().toLowerCase(),
        active: values[r][3] === true || String(values[r][3]).toUpperCase() === 'TRUE',
      };
    }
  }
  return null;
}

function upsertUser(username, pin, role) {
  username = String(username || '').trim();
  role = String(role || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) throw new ApiError('Username must be 3-30 letters, numbers, dot, dash or underscore');
  if (!/^\d{4,8}$/.test(String(pin))) throw new ApiError('PIN must be 4 to 8 digits');
  if ([ROLES.ADMIN, ROLES.OWNER, ROLES.STAFF].indexOf(role) === -1) throw new ApiError('Role must be admin, owner or staff');
  const sh = getUsersSheet();
  const existing = findUser(username);
  const record = makePinRecord(String(pin));
  if (existing) {
    sh.getRange(existing.row, 2, 1, 3).setValues([[record, role, true]]);
  } else {
    sh.appendRow([username, record, role, true, new Date()]);
  }
  return { username: username, role: role };
}

function actionLogin(p) {
  const username = String(p.username || '').trim();
  const pin = String(p.pin || '');
  if (!username || !pin) throw new ApiError('Enter username and PIN');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username.toLowerCase();
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CFG.MAX_LOGIN_FAILS) throw new ApiError('Too many failed attempts. Try again in 15 minutes.', 'LOCKED');

  const user = findUser(username);
  if (!user || !user.active || !checkPin(pin, user.pinRecord)) {
    cache.put(failKey, String(fails + 1), CFG.LOCKOUT_SECONDS);
    throw new ApiError('Wrong username or PIN', 'UNAUTHORIZED');
  }
  cache.remove(failKey);

  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const session = {
    username: user.username,
    role: user.role,
    exp: Date.now() + CFG.SESSION_DAYS * 24 * 3600 * 1000,
  };
  PropertiesService.getScriptProperties().setProperty('sess_' + token, JSON.stringify(session));
  pruneSessions();
  return { token: token, user: { username: user.username, role: user.role } };
}

function actionLogout(p) {
  PropertiesService.getScriptProperties().deleteProperty('sess_' + p.token);
  return { loggedOut: true };
}

function requireSession(token) {
  if (!token) throw new ApiError('Please log in', 'UNAUTHORIZED');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sess_' + token);
  if (!raw) throw new ApiError('Session expired. Please log in again.', 'UNAUTHORIZED');
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) {
    props.deleteProperty('sess_' + token);
    throw new ApiError('Session expired. Please log in again.', 'UNAUTHORIZED');
  }
  // Re-check the user is still active and role unchanged.
  const user = findUser(s.username);
  if (!user || !user.active) {
    props.deleteProperty('sess_' + token);
    throw new ApiError('Your account is disabled', 'UNAUTHORIZED');
  }
  return { username: user.username, role: user.role };
}

function pruneSessions() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach((k) => {
    if (k.indexOf('sess_') !== 0) return;
    try {
      if (JSON.parse(all[k]).exp < now) props.deleteProperty(k);
    } catch (x) {
      props.deleteProperty(k);
    }
  });
}

// ---------------------------------------------------------------------------
// Sheet helpers (columns found by header name, so moving columns is safe)
// ---------------------------------------------------------------------------

function sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new ApiError('Sheet tab not found: ' + name, 'CONFIG');
  return sh;
}

/**
 * Reads a tab whose headers are in row `headerRow`.
 * keyHeader: rows where this column is blank are ignored.
 */
function readTable(name, keyHeader, headerRow) {
  headerRow = headerRow || 1;
  const sh = sheet(name);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
  const col = {};
  headers.forEach((h, i) => {
    if (h && col[h] === undefined) col[h] = i;
  });
  if (col[keyHeader] === undefined) throw new ApiError('Column "' + keyHeader + '" not found on ' + name, 'CONFIG');
  const n = Math.max(0, lastRow - headerRow);
  const values = n ? sh.getRange(headerRow + 1, 1, n, lastCol).getValues() : [];
  const display = n ? sh.getRange(headerRow + 1, 1, n, lastCol).getDisplayValues() : [];
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i][col[keyHeader]] === '' || values[i][col[keyHeader]] === null) continue;
    rows.push({ row: headerRow + 1 + i, v: values[i], d: display[i] });
  }
  return { sh: sh, col: col, rows: rows, headerRow: headerRow, nextRow: nextEmptyRow(values, col[keyHeader], headerRow) };
}

function nextEmptyRow(values, keyIdx, headerRow) {
  let last = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i][keyIdx] !== '' && values[i][keyIdx] !== null) last = i;
  }
  return headerRow + 1 + last + 1;
}

function need(t, header) {
  if (t.col[header] === undefined) throw new ApiError('Column "' + header + '" not found', 'CONFIG');
  return t.col[header];
}

function num(x) {
  const n = Number(x);
  return isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(num(n) * 100) / 100;
}

function todayStr() {
  return Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function cleanDate(s) {
  if (s === undefined || s === null || s === '') return todayStr();
  s = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError('Date must be in YYYY-MM-DD format');
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new ApiError('Invalid date: ' + s);
  return s;
}

/** Write a value into a cell as plain text (keeps leading zeros in phone numbers and IDs). */
function setText(sh, row, colIdx, value) {
  const cell = sh.getRange(row, colIdx + 1);
  cell.setNumberFormat('@');
  cell.setValue(String(value));
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new ApiError('The sheet is busy. Please try again.', 'BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function lowStockLevel() {
  const v = num(sheet(CFG.SHEETS.INVENTORY).getRange(CFG.LOW_STOCK_CELL).getValue());
  return v > 0 ? v : 5;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

function actionGetMeta(p, user) {
  return {
    user: user,
    lowStockLevel: lowStockLevel(),
    expenseCategories: CFG.EXPENSE_CATEGORIES,
    paymentMethods: CFG.PAYMENT_METHODS,
    today: todayStr(),
  };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

function inventoryRows(includeCost) {
  const t = readTable(CFG.SHEETS.INVENTORY, 'Item ID');
  const c = t.col;
  return t.rows.map((r) => {
    const item = {
      row: r.row,
      itemId: String(r.v[c['Item ID']]),
      category: String(r.v[c['Category']] || ''),
      name: String(r.v[c['Item Name']] || ''),
      size: String(r.v[c['Size']] || ''),
      color: String(r.v[c['Color']] || ''),
      sellingPrice: num(r.v[c['Selling Price']]),
      initialStock: num(r.v[c['Initial Stock']]),
      unitsSold: num(r.v[c['Units Sold']]),
      currentStock: num(r.v[c['Current Stock']]),
      status: String(r.v[c['Stock Status']] || ''),
    };
    if (includeCost) item.costPrice = num(r.v[c['Cost Price']]);
    return item;
  });
}

function actionGetInventory(p, user) {
  return { lowStockLevel: lowStockLevel(), salePricesSaved: salePricesSaved(), items: inventoryRows(canSeeCosts(user)) };
}

function actionAddInventoryItem(p) {
  const itemId = String(p.itemId || '').trim();
  const name = String(p.name || '').trim();
  if (!itemId) throw new ApiError('Item ID is required');
  if (!/^[A-Za-z0-9._\-\/ ]{1,40}$/.test(itemId)) throw new ApiError('Item ID can use letters, numbers, dash, dot, slash and spaces');
  if (!name) throw new ApiError('Item name is required');
  const cost = num(p.costPrice);
  const price = num(p.sellingPrice);
  const stock = num(p.initialStock);
  if (cost < 0 || price <= 0) throw new ApiError('Enter a valid cost and selling price');
  if (stock < 0 || Math.floor(stock) !== stock) throw new ApiError('Initial stock must be a whole number');

  return withLock(() => {
    const t = readTable(CFG.SHEETS.INVENTORY, 'Item ID');
    const idCol = need(t, 'Item ID');
    const exists = t.rows.some((r) => String(r.v[idCol]).trim().toLowerCase() === itemId.toLowerCase());
    if (exists) throw new ApiError('Item ID already exists: ' + itemId);
    const row = t.nextRow;
    const sh = t.sh;
    setText(sh, row, idCol, itemId);
    sh.getRange(row, need(t, 'Category') + 1).setValue(String(p.category || '').trim());
    sh.getRange(row, need(t, 'Item Name') + 1).setValue(name);
    sh.getRange(row, need(t, 'Size') + 1).setValue(String(p.size || '').trim());
    sh.getRange(row, need(t, 'Color') + 1).setValue(String(p.color || '').trim());
    sh.getRange(row, need(t, 'Cost Price') + 1).setValue(cost);
    sh.getRange(row, need(t, 'Selling Price') + 1).setValue(price);
    sh.getRange(row, need(t, 'Initial Stock') + 1).setValue(stock);
    SpreadsheetApp.flush();
    return inventoryRows(true).filter((i) => i.row === row)[0] || { row: row, itemId: itemId };
  });
}

function actionRestockItem(p) {
  const itemId = String(p.itemId || '').trim();
  const qty = num(p.qty);
  if (!itemId) throw new ApiError('Item ID is required');
  if (qty <= 0 || Math.floor(qty) !== qty) throw new ApiError('Restock quantity must be a whole number above 0');
  return withLock(() => {
    const t = readTable(CFG.SHEETS.INVENTORY, 'Item ID');
    const idCol = need(t, 'Item ID');
    const r = t.rows.filter((x) => String(x.v[idCol]).trim() === itemId)[0];
    if (!r) throw new ApiError('Item not found: ' + itemId);
    const stockCol = need(t, 'Initial Stock');
    t.sh.getRange(r.row, stockCol + 1).setValue(num(r.v[stockCol]) + qty);
    SpreadsheetApp.flush();
    return inventoryRows(true).filter((i) => i.row === r.row)[0];
  });
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

function salesRows() {
  const t = readTable(CFG.SHEETS.SALES, 'Item ID');
  const c = t.col;
  return t.rows.map((r) => ({
    row: r.row,
    date: r.d[c['Date']],
    dateYmd: ymd(r.v[c['Date']]),
    customerName: String(r.v[c['Customer Name']] || ''),
    contact: String(r.d[c['Contact Info']] || ''),
    itemId: String(r.v[c['Item ID']]),
    itemName: String(r.v[c['Item Name']] || ''),
    variant: String(r.v[c['Variant (Size/Color)']] || ''),
    qty: num(r.v[c['Qty Sold']]),
    unitPrice: num(r.v[c['Unit Selling Price']]),
    unitCost: c[SALE_COST_HEADER] === undefined ? null : num(r.v[c[SALE_COST_HEADER]]),
    subtotal: num(r.v[c['Subtotal']]),
    discount: num(r.v[c['Discount Amount']]),
    total: num(r.v[c['Total Amount']]),
    paid: num(r.v[c['Amount Paid']]),
    balance: num(r.v[c['Balance Due']]),
    status: String(r.v[c['Payment Status']] || ''),
  }));
}

/**
 * params: { date?, customerName, contact?, amountPaid, items: [{ itemId, qty, discount? }], allowOversell? }
 * One Sales row is written per item. The payment is applied to the lines in order.
 */
function actionRecordSale(p) {
  const customerName = String(p.customerName || '').trim();
  const contact = String(p.contact || '').trim();
  const date = cleanDate(p.date);
  const items = Array.isArray(p.items) ? p.items : [];
  if (!customerName) throw new ApiError('Customer name is required');
  if (contact && !/^[0-9+\-() ]{6,20}$/.test(contact)) throw new ApiError('Contact must be a phone number');
  if (!items.length) throw new ApiError('Add at least one item');
  if (items.length > 30) throw new ApiError('Too many items in one sale');
  let amountPaid = round2(p.amountPaid);
  if (amountPaid < 0) throw new ApiError('Amount paid cannot be negative');

  return withLock(() => {
    const inv = inventoryRows(true);
    const byId = {};
    inv.forEach((i) => (byId[i.itemId] = i));

    // Validate every line before writing anything.
    const wanted = {};
    const lines = items.map((it, n) => {
      const id = String(it.itemId || '').trim();
      const item = byId[id];
      if (!item) throw new ApiError('Line ' + (n + 1) + ': item not found (' + id + ')');
      const qty = num(it.qty);
      if (qty <= 0 || Math.floor(qty) !== qty) throw new ApiError('Line ' + (n + 1) + ': quantity must be a whole number above 0');
      const subtotal = round2(qty * item.sellingPrice);
      const discount = round2(it.discount);
      if (discount < 0 || discount > subtotal) throw new ApiError('Line ' + (n + 1) + ': discount must be between 0 and ' + subtotal);
      wanted[id] = (wanted[id] || 0) + qty;
      return { item: item, qty: qty, discount: discount, total: round2(subtotal - discount) };
    });
    if (!p.allowOversell) {
      Object.keys(wanted).forEach((id) => {
        if (wanted[id] > byId[id].currentStock) {
          throw new ApiError('Not enough stock for ' + byId[id].name + ' (' + id + '): ' + byId[id].currentStock + ' left', 'NO_STOCK');
        }
      });
    }
    const grandTotal = round2(lines.reduce((s, l) => s + l.total, 0));
    if (amountPaid > grandTotal) throw new ApiError('Amount paid (' + amountPaid + ') is more than the total (' + grandTotal + ')');

    const t = readTable(CFG.SHEETS.SALES, 'Item ID');
    const sh = t.sh;
    const cDate = need(t, 'Date');
    const cName = need(t, 'Customer Name');
    const cContact = need(t, 'Contact Info');
    const cItem = need(t, 'Item ID');
    const cQty = need(t, 'Qty Sold');
    const cDisc = need(t, 'Discount Amount');
    const cPaid = need(t, 'Amount Paid');
    // Once sale prices are saved per row (see snapshotSalePrices), write this sale's price and cost.
    const cPrice = t.col[SALE_COST_HEADER] === undefined ? -1 : need(t, 'Unit Selling Price');
    const cCost = t.col[SALE_COST_HEADER] === undefined ? -1 : t.col[SALE_COST_HEADER];

    let row = t.nextRow;
    const written = [];
    lines.forEach((l) => {
      const pay = round2(Math.min(amountPaid, l.total));
      amountPaid = round2(amountPaid - pay);
      sh.getRange(row, cDate + 1).setValue(date);
      sh.getRange(row, cName + 1).setValue(customerName);
      setText(sh, row, cContact, contact);
      // Write the Item ID exactly as stored in Inventory (number or text) so lookups match.
      const invIdCell = sheet(CFG.SHEETS.INVENTORY).getRange(l.item.row, 1 + readHeaderIndex(CFG.SHEETS.INVENTORY, 'Item ID')).getValue();
      sh.getRange(row, cItem + 1).setValue(invIdCell);
      sh.getRange(row, cQty + 1).setValue(l.qty);
      sh.getRange(row, cDisc + 1).setValue(l.discount);
      sh.getRange(row, cPaid + 1).setValue(pay);
      if (cPrice !== -1) {
        sh.getRange(row, cPrice + 1).setValue(l.item.sellingPrice);
        sh.getRange(row, cCost + 1).setValue(num(l.item.costPrice));
      }
      written.push(row);
      row++;
    });
    SpreadsheetApp.flush();

    const saved = salesRows().filter((s) => written.indexOf(s.row) !== -1);
    return {
      rows: saved,
      total: round2(saved.reduce((s, x) => s + x.total, 0)),
      paid: round2(saved.reduce((s, x) => s + x.paid, 0)),
      balance: round2(saved.reduce((s, x) => s + x.balance, 0)),
    };
  });
}

function readHeaderIndex(name, header) {
  const sh = sheet(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const i = headers.indexOf(header);
  if (i === -1) throw new ApiError('Column "' + header + '" not found on ' + name, 'CONFIG');
  return i;
}

function actionGetRecentSales(p) {
  const limit = Math.min(Math.max(num(p.limit) || 50, 1), 500);
  const rows = salesRows();
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.row - a.row));
  return rows.slice(0, limit);
}

const SALES_DAILY_MAX_DAYS = 62;

/** Every YYYY-MM-DD from `from` to `to`, inclusive. */
function daysBetween(from, to) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (;;) {
    const s = dt.toISOString().slice(0, 10);
    if (s > to) break;
    out.push(s);
    if (out.length > SALES_DAILY_MAX_DAYS) break;
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return out;
}

/**
 * params: { from, to, includeLines? } — dates as YYYY-MM-DD, at most 62 days.
 * Sales totals per day, with empty days filled in as zeros. Days are in the sheet's time zone.
 * includeLines also returns the sale rows in the range (newest first), for the single-day view.
 */
function actionGetSalesDaily(p) {
  if (!p.from || !p.to) throw new ApiError('from and to are required');
  const from = cleanDate(p.from);
  const to = cleanDate(p.to);
  if (from > to) throw new ApiError('from must be on or before to');
  const dates = daysBetween(from, to);
  if (dates.length > SALES_DAILY_MAX_DAYS) throw new ApiError('Range is limited to ' + SALES_DAILY_MAX_DAYS + ' days');

  const byDate = {};
  dates.forEach((d) => (byDate[d] = { date: d, total: 0, paid: 0, balance: 0, qty: 0, lines: 0 }));
  const lines = [];
  salesRows().forEach((s) => {
    const day = byDate[s.dateYmd];
    if (!day) return;
    day.total += s.total;
    day.paid += s.paid;
    day.balance += s.balance;
    day.qty += s.qty;
    day.lines += 1;
    if (p.includeLines) lines.push(s);
  });

  const days = dates.map((d) => {
    const x = byDate[d];
    return { date: d, total: round2(x.total), paid: round2(x.paid), balance: round2(x.balance), qty: x.qty, lines: x.lines };
  });
  const result = { from, to, today: todayStr(), days };
  if (p.includeLines) {
    lines.sort((a, b) => (a.dateYmd < b.dateYmd ? 1 : a.dateYmd > b.dateYmd ? -1 : b.row - a.row));
    result.lines = lines.map((s) => {
      const o = Object.assign({}, s);
      o.date = s.dateYmd;
      delete o.dateYmd;
      return o;
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Customers & payments
// ---------------------------------------------------------------------------

function actionGetCustomers() {
  const t = readTable(CFG.SHEETS.CUSTOMERS, 'Customer Name');
  const c = t.col;
  const list = t.rows.map((r) => ({
    customerId: String(r.v[c['Customer ID']] || ''),
    name: String(r.v[c['Customer Name']]),
    contact: String(r.d[c['Contact Info']] || ''),
    purchases: num(r.v[c['No. of Purchases']]),
    totalSpent: num(r.v[c['Total Spent']]),
    totalPaid: num(r.v[c['Total Paid']]),
    balance: num(r.v[c['Balance Owed']]),
    lastPurchase: String(r.d[c['Last Purchase']] || ''),
    status: String(r.v[c['Status']] || ''),
  }));
  // Customers added in the app who have not bought anything yet, and everyone's photo.
  directoryRows().forEach((d) => {
    const found = list.find((x) => sameCustomer({ customerName: x.name, contact: x.contact }, d.name, d.contact));
    if (found) {
      if (d.photoId) found.photoId = d.photoId;
      return;
    }
    // A row that only holds a photo for a customer who no longer has sales is not listed.
    if (d.photoOnly) return;
    const c = { customerId: '', name: d.name, contact: d.contact, purchases: 0, totalSpent: 0, totalPaid: 0, balance: 0, lastPurchase: '', status: 'New' };
    if (d.photoId) c.photoId = d.photoId;
    list.push(c);
  });
  return list;
}

// The Customers tab is built by formulas from Sales, so customers added before their first sale
// are kept on their own tab and merged into getCustomers. The same tab holds each customer's photo
// (a Drive file ID); "Added On" is blank on rows that exist only to hold a photo.
const DIRECTORY_HEADERS = ['Customer Name', 'Contact Info', 'Added On', 'Added By', 'Photo ID'];

function directorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEETS.DIRECTORY);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEETS.DIRECTORY);
    sh.getRange(1, 1, 1, DIRECTORY_HEADERS.length).setValues([DIRECTORY_HEADERS]);
    sh.getRange(1, 1, 1, DIRECTORY_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  // Tabs made before photos existed get the new column.
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
  if (headers.indexOf('Photo ID') === -1) {
    sh.getRange(1, lastCol + 1).setValue('Photo ID');
    sh.getRange(1, lastCol + 1).setFontWeight('bold');
  }
  return sh;
}

function directoryRows() {
  directorySheet();
  const t = readTable(CFG.SHEETS.DIRECTORY, 'Customer Name');
  const c = t.col;
  return t.rows.map((r) => ({
    row: r.row,
    name: String(r.v[c['Customer Name']]).trim(),
    contact: String(r.d[c['Contact Info']] || '').trim(),
    photoId: String(r.v[c['Photo ID']] || '').trim(),
    photoOnly: !String(r.d[c['Added On']] || '').trim(),
  }));
}

/**
 * params: { name, contact? }
 * Adds a customer so they can be picked in a sale before they have bought anything.
 */
function actionAddCustomer(p, user) {
  const name = String(p.name || '').trim();
  const contact = String(p.contact || '').trim();
  if (!name) throw new ApiError('Customer name is required');
  if (name.length > 80) throw new ApiError('Name is too long');
  if (contact && !/^[0-9+\-() ]{6,20}$/.test(contact)) throw new ApiError('Contact must be a phone number');
  return withLock(() => {
    if (actionGetCustomers().some((x) => sameCustomer({ customerName: x.name, contact: x.contact }, name, contact))) {
      throw new ApiError(name + (contact ? ' (' + contact + ')' : '') + ' is already a customer', 'EXISTS');
    }
    const t = readTable(CFG.SHEETS.DIRECTORY, 'Customer Name');
    const row = t.nextRow;
    t.sh.getRange(row, need(t, 'Customer Name') + 1).setValue(name);
    setText(t.sh, row, need(t, 'Contact Info'), contact);
    t.sh.getRange(row, need(t, 'Added On') + 1).setValue(todayStr());
    t.sh.getRange(row, need(t, 'Added By') + 1).setValue(user ? user.username : '');
    SpreadsheetApp.flush();
    return { customerId: '', name: name, contact: contact, purchases: 0, totalSpent: 0, totalPaid: 0, balance: 0, lastPurchase: '', status: 'New' };
  });
}

// ---------------------------------------------------------------------------
// Customer photos (Google Drive)
//
// Photos are small JPEGs the app has already resized. They are stored in a private Drive folder
// owned by the script's owner and are never shared by link: the app reads them back through
// getCustomerPhoto, which needs a signed-in user.
// ---------------------------------------------------------------------------

const PHOTO_FOLDER_PROP = 'photos_folder_id';

/**
 * Run once from the Apps Script editor (Run > authorizeDrive) after adding photos, so the owner
 * grants Drive access. The web app runs as the owner and cannot ask for it on its own.
 */
function authorizeDrive() {
  const folder = photosFolder();
  console.log('Customer photos folder: ' + folder.getName() + ' (' + folder.getId() + ')');
}
const PHOTO_MAX_CHARS = 400000; // base64 length, about 300 KB
const PHOTO_TYPES = ['image/jpeg', 'image/png'];

function photosFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PHOTO_FOLDER_PROP);
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {
      // Folder was deleted; make a new one below.
    }
  }
  const folder = DriveApp.createFolder('Calico customer photos');
  props.setProperty(PHOTO_FOLDER_PROP, folder.getId());
  return folder;
}

function trashPhoto(id) {
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    console.warn('Could not trash photo ' + id + ': ' + e);
  }
}

function requireCustomer(name, contact) {
  name = String(name || '').trim();
  contact = String(contact || '').trim();
  if (!name) throw new ApiError('customer name is required');
  const c = actionGetCustomers().find((x) => sameCustomer({ customerName: x.name, contact: x.contact }, name, contact));
  if (!c) throw new ApiError('Customer not found: ' + name);
  return c;
}

/** Checks an uploaded photo and returns its bytes. */
function photoBytes(p) {
  const data = String(p.data || '').replace(/^data:[^,]*,/, '');
  const mimeType = String(p.mimeType || 'image/jpeg');
  if (!data) throw new ApiError('Photo is required');
  if (data.length > PHOTO_MAX_CHARS) throw new ApiError('Photo is too large');
  if (PHOTO_TYPES.indexOf(mimeType) === -1) throw new ApiError('Photo must be a JPEG or PNG');
  try {
    return { bytes: Utilities.base64Decode(data), mimeType: mimeType };
  } catch (e) {
    throw new ApiError('Photo data is not valid');
  }
}

function savePhotoFile(photo, baseName) {
  const ext = photo.mimeType === 'image/png' ? '.png' : '.jpg';
  return photosFolder().createFile(Utilities.newBlob(photo.bytes, photo.mimeType, baseName + ext));
}

function readPhotoFile(id) {
  const blob = DriveApp.getFileById(id).getBlob();
  return { photoId: id, mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** params: { name, contact, data (base64), mimeType } */
function actionSetCustomerPhoto(p, user) {
  const photo = photoBytes(p);
  return withLock(() => {
    const c = requireCustomer(p.name, p.contact);
    const file = savePhotoFile(photo, c.name + (c.contact ? ' ' + c.contact : ''));
    const old = directoryRows().find((d) => sameCustomer({ customerName: d.name, contact: d.contact }, c.name, c.contact));
    const t = readTable(CFG.SHEETS.DIRECTORY, 'Customer Name');
    const cPhoto = need(t, 'Photo ID');
    if (old) {
      t.sh.getRange(old.row, cPhoto + 1).setValue(file.getId());
      trashPhoto(old.photoId);
    } else {
      const row = t.nextRow;
      t.sh.getRange(row, need(t, 'Customer Name') + 1).setValue(c.name);
      setText(t.sh, row, need(t, 'Contact Info'), c.contact);
      t.sh.getRange(row, need(t, 'Added By') + 1).setValue(user ? user.username : '');
      t.sh.getRange(row, cPhoto + 1).setValue(file.getId());
    }
    SpreadsheetApp.flush();
    return { photoId: file.getId() };
  });
}

/** params: { photoId }. Only files the Customer Directory points at can be read. */
function actionGetCustomerPhoto(p) {
  const id = String(p.photoId || '').trim();
  if (!id || !directoryRows().some((d) => d.photoId === id)) throw new ApiError('Photo not found', 'NOT_FOUND');
  return readPhotoFile(id);
}

/** params: { name, contact } */
function actionRemoveCustomerPhoto(p) {
  return withLock(() => {
    const name = String(p.name || '').trim();
    const d = directoryRows().find((x) => sameCustomer({ customerName: x.name, contact: x.contact }, name, p.contact));
    if (!d || !d.photoId) return { removed: false };
    const t = readTable(CFG.SHEETS.DIRECTORY, 'Customer Name');
    t.sh.getRange(d.row, need(t, 'Photo ID') + 1).setValue('');
    trashPhoto(d.photoId);
    SpreadsheetApp.flush();
    return { removed: true };
  });
}

// ---------------------------------------------------------------------------
// Editing stock items, and saving each sale's own price and cost
//
// The Sales tab used to look up "Unit Selling Price" from Inventory, and the dashboard took COGS
// from each item's current cost, so changing an item's price or cost rewrote old sales, customer
// balances and past profit. snapshotSalePrices() (run once from the editor) freezes the current
// figures into every existing sale row, adds a "Unit Cost" column, and points the dashboard's COGS
// at it. From then on recordSale writes both for each new sale, and prices can be edited freely.
// Item Name and Variant on Sales are still lookups on purpose, so name corrections show in history.
// ---------------------------------------------------------------------------

const SALE_COST_HEADER = 'Unit Cost';
const SNAPSHOT_PROP = 'sale_prices_saved';

function salePricesSaved() {
  return readTable(CFG.SHEETS.SALES, 'Item ID').col[SALE_COST_HEADER] !== undefined;
}

function colLetter(idx) {
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Run once from the Apps Script editor. Makes a backup copy of the spreadsheet first, then saves
 * every existing sale's current price and cost as plain values. Safe to run again: it stops if
 * already done.
 */
function snapshotSalePrices() {
  const result = withLock(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const t = readTable(CFG.SHEETS.SALES, 'Item ID');
    if (t.col[SALE_COST_HEADER] !== undefined) return { done: false, message: 'Sale prices are already saved per row.' };

    const backup = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' - BACKUP ' + todayStr() + ' (before saving sale prices)');

    const cPrice = need(t, 'Unit Selling Price');
    const cId = need(t, 'Item ID');
    const cost = {};
    inventoryRows(true).forEach((i) => (cost[String(i.itemId).trim()] = i.costPrice));
    const last = t.rows.length ? t.rows[t.rows.length - 1].row : t.headerRow + 1;
    const byRow = {};
    t.rows.forEach((r) => (byRow[r.row] = r));
    const prices = [];
    const costs = [];
    for (let row = t.headerRow + 1; row <= last; row++) {
      const r = byRow[row];
      prices.push([r ? num(r.v[cPrice]) : '']);
      costs.push([r ? num(cost[String(r.v[cId]).trim()]) : '']);
    }
    const cCost = Math.max.apply(null, Object.keys(t.col).map((k) => t.col[k])) + 1;
    // Writing H2 replaces the lookup formula that filled the whole column.
    t.sh.getRange(t.headerRow + 1, cPrice + 1, prices.length, 1).setValues(prices);
    t.sh.getRange(t.headerRow, cCost + 1).setValue(SALE_COST_HEADER);
    t.sh.getRange(t.headerRow, cCost + 1).setFontWeight('bold');
    t.sh.getRange(t.headerRow + 1, cCost + 1, costs.length, 1).setValues(costs);

    // Dashboard COGS from the saved cost instead of today's cost.
    const qty = colLetter(need(t, 'Qty Sold'));
    const date = colLetter(need(t, 'Date'));
    const cc = colLetter(cCost);
    const dash = sheet(CFG.SHEETS.DASHBOARD);
    const labels = dash.getRange(1, 1, dash.getLastRow(), 1).getValues();
    const i = labels.findIndex((x) => String(x[0]).trim() === 'Cost of Goods Sold (COGS)');
    if (i === -1) throw new ApiError('COGS row not found on the dashboard', 'CONFIG');
    dash.getRange(i + 1, 2).setFormula('=SUMPRODUCT(Sales!' + qty + '2:' + qty + ',Sales!' + cc + '2:' + cc + ')');
    dash.getRange(i + 1, 3).setFormula(
      '=SUMPRODUCT((Sales!' + date + '2:' + date + '>=$F$3)*(Sales!' + date + '2:' + date + '<=$F$4),Sales!' + qty + '2:' + qty + ',Sales!' + cc + '2:' + cc + ')'
    );
    PropertiesService.getScriptProperties().setProperty(SNAPSHOT_PROP, todayStr());
    SpreadsheetApp.flush();
    return { done: true, rows: t.rows.length, backup: backup.getName(), message: 'Saved prices and costs on ' + t.rows.length + ' sale rows. Backup: ' + backup.getName() };
  });
  console.log(result.message);
  return result;
}

/**
 * params: { itemId, category?, name?, size?, color?, costPrice?, sellingPrice?, stock? }
 * The Item ID cannot change: sales point at it. `stock` is the counted number on hand now.
 */
function actionUpdateInventoryItem(p) {
  const itemId = String(p.itemId || '').trim();
  if (!itemId) throw new ApiError('Item ID is required');
  const has = (k) => p[k] !== undefined && p[k] !== null;
  const name = has('name') ? String(p.name).trim() : null;
  if (name !== null && !name) throw new ApiError('Item name is required');
  const cost = has('costPrice') ? num(p.costPrice) : null;
  const price = has('sellingPrice') ? num(p.sellingPrice) : null;
  const stock = has('stock') && String(p.stock) !== '' ? num(p.stock) : null;
  if (cost !== null && cost < 0) throw new ApiError('Enter a valid cost price');
  if (price !== null && price <= 0) throw new ApiError('Enter a valid selling price');
  if (stock !== null && (stock < 0 || Math.floor(stock) !== stock)) throw new ApiError('Stock must be a whole number, 0 or more');

  return withLock(() => {
    const before = inventoryRows(true).find((i) => i.itemId === itemId);
    if (!before) throw new ApiError('Item not found: ' + itemId);
    const priceChanged = (price !== null && price !== before.sellingPrice) || (cost !== null && cost !== before.costPrice);
    if (priceChanged && before.unitsSold > 0 && !salePricesSaved()) {
      throw new ApiError('This item has sales, so changing its price would change those old sales. Run snapshotSalePrices in the script editor first.', 'NEEDS_SNAPSHOT');
    }

    const t = readTable(CFG.SHEETS.INVENTORY, 'Item ID');
    const sh = t.sh;
    const row = before.row;
    const after = {
      category: has('category') ? String(p.category).trim() : before.category,
      name: name !== null ? name : before.name,
      size: has('size') ? String(p.size).trim() : before.size,
      color: has('color') ? String(p.color).trim() : before.color,
    };
    sh.getRange(row, need(t, 'Category') + 1).setValue(after.category);
    sh.getRange(row, need(t, 'Item Name') + 1).setValue(after.name);
    sh.getRange(row, need(t, 'Size') + 1).setValue(after.size);
    sh.getRange(row, need(t, 'Color') + 1).setValue(after.color);
    if (cost !== null) sh.getRange(row, need(t, 'Cost Price') + 1).setValue(cost);
    if (price !== null) sh.getRange(row, need(t, 'Selling Price') + 1).setValue(price);
    if (stock !== null && stock !== before.currentStock) sh.getRange(row, need(t, 'Initial Stock') + 1).setValue(stock + before.unitsSold);
    SpreadsheetApp.flush();

    // Keep the product photo with the item when its name or colour changes.
    const oldKey = itemPhotoKey(before.name, before.color);
    const newKey = itemPhotoKey(after.name, after.color);
    if (oldKey !== newKey) {
      const photos = itemPhotoRows();
      const from = photos.find((r) => itemPhotoKey(r.name, r.color) === oldKey && r.photoId);
      const to = photos.find((r) => itemPhotoKey(r.name, r.color) === newKey && r.photoId);
      if (from && !to) {
        const othersStillUseOld = inventoryRows(false).some((i) => i.itemId !== itemId && itemPhotoKey(i.name, i.color) === oldKey);
        const pt = readTable(CFG.SHEETS.ITEM_PHOTOS, 'Item Name');
        const target = othersStillUseOld ? pt.nextRow : from.row;
        pt.sh.getRange(target, need(pt, 'Item Name') + 1).setValue(after.name);
        setText(pt.sh, target, need(pt, 'Color'), after.color);
        if (othersStillUseOld) {
          pt.sh.getRange(target, need(pt, 'Photo ID') + 1).setValue(from.photoId);
          setText(pt.sh, target, need(pt, 'Thumbnail'), from.thumb);
          pt.sh.getRange(target, need(pt, 'Updated On') + 1).setValue(todayStr());
        }
        SpreadsheetApp.flush();
      }
    }
    return inventoryRows(true).find((i) => i.itemId === itemId);
  });
}

// ---------------------------------------------------------------------------
// Item photos
//
// One photo per product and colour: every size of "Linen shirt / Black" shares it. The full image
// is a Drive file in the same private folder as customer photos; a small thumbnail is kept as
// base64 text on the Item Photos tab so a whole stock list can be drawn from one request.
// ---------------------------------------------------------------------------

const ITEM_PHOTO_HEADERS = ['Item Name', 'Color', 'Photo ID', 'Thumbnail', 'Updated On', 'Updated By'];
const THUMB_MAX_CHARS = 40000; // a sheet cell holds 50,000 characters

function itemPhotoKey(name, color) {
  return String(name || '').trim().toLowerCase() + '|' + String(color || '').trim().toLowerCase();
}

function itemPhotoSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEETS.ITEM_PHOTOS);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEETS.ITEM_PHOTOS);
    sh.getRange(1, 1, 1, ITEM_PHOTO_HEADERS.length).setValues([ITEM_PHOTO_HEADERS]);
    sh.getRange(1, 1, 1, ITEM_PHOTO_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function itemPhotoRows() {
  itemPhotoSheet();
  const t = readTable(CFG.SHEETS.ITEM_PHOTOS, 'Item Name');
  const c = t.col;
  return t.rows.map((r) => ({
    row: r.row,
    name: String(r.v[c['Item Name']]).trim(),
    color: String(r.d[c['Color']] || '').trim(),
    photoId: String(r.v[c['Photo ID']] || '').trim(),
    thumb: String(r.v[c['Thumbnail']] || ''),
  }));
}

function requireItem(itemId) {
  const id = String(itemId || '').trim();
  const item = inventoryRows(false).find((i) => i.itemId === id);
  if (!item) throw new ApiError('Item not found: ' + id);
  return item;
}

/**
 * params: { have?: [photoId] }
 * Every product photo as { name, color, photoId, thumb }. Thumbnails the app already holds
 * (listed in `have`) are left out to keep the response small.
 */
function actionGetItemThumbs(p) {
  const have = Array.isArray(p.have) ? p.have.map(String) : [];
  return itemPhotoRows()
    .filter((r) => r.photoId)
    .map((r) => {
      const out = { name: r.name, color: r.color, photoId: r.photoId };
      if (have.indexOf(r.photoId) === -1) out.thumb = r.thumb;
      return out;
    });
}

/** params: { photoId }. Only files the Item Photos tab points at can be read. */
function actionGetItemPhoto(p) {
  const id = String(p.photoId || '').trim();
  if (!id || !itemPhotoRows().some((r) => r.photoId === id)) throw new ApiError('Photo not found', 'NOT_FOUND');
  return readPhotoFile(id);
}

/** params: { itemId, data (base64 JPEG), thumb (base64 JPEG), mimeType? } */
function actionSetItemPhoto(p, user) {
  const photo = photoBytes(p);
  const thumb = String(p.thumb || '').replace(/^data:[^,]*,/, '');
  if (!thumb) throw new ApiError('Thumbnail is required');
  if (thumb.length > THUMB_MAX_CHARS) throw new ApiError('Thumbnail is too large');
  if (!/^[A-Za-z0-9+/=]+$/.test(thumb)) throw new ApiError('Thumbnail data is not valid');
  return withLock(() => {
    const item = requireItem(p.itemId);
    const file = savePhotoFile(photo, 'Item ' + item.name + (item.color ? ' ' + item.color : ''));
    const key = itemPhotoKey(item.name, item.color);
    const old = itemPhotoRows().find((r) => itemPhotoKey(r.name, r.color) === key);
    const t = readTable(CFG.SHEETS.ITEM_PHOTOS, 'Item Name');
    const row = old ? old.row : t.nextRow;
    t.sh.getRange(row, need(t, 'Item Name') + 1).setValue(item.name);
    setText(t.sh, row, need(t, 'Color'), item.color);
    t.sh.getRange(row, need(t, 'Photo ID') + 1).setValue(file.getId());
    setText(t.sh, row, need(t, 'Thumbnail'), thumb);
    t.sh.getRange(row, need(t, 'Updated On') + 1).setValue(todayStr());
    t.sh.getRange(row, need(t, 'Updated By') + 1).setValue(user ? user.username : '');
    SpreadsheetApp.flush();
    if (old) trashItemPhotoIfUnused(old.photoId);
    SpreadsheetApp.flush();
    return { name: item.name, color: item.color, photoId: file.getId(), thumb: thumb };
  });
}

/** A renamed item can leave two rows sharing one file; only trash it once nothing points at it. */
function trashItemPhotoIfUnused(photoId) {
  if (photoId && !itemPhotoRows().some((r) => r.photoId === photoId)) trashPhoto(photoId);
}

/** params: { itemId }. Removes the photo for that product and colour (all sizes). */
function actionRemoveItemPhoto(p) {
  return withLock(() => {
    const item = requireItem(p.itemId);
    const key = itemPhotoKey(item.name, item.color);
    const old = itemPhotoRows().find((r) => itemPhotoKey(r.name, r.color) === key);
    if (!old || !old.photoId) return { removed: false };
    const t = readTable(CFG.SHEETS.ITEM_PHOTOS, 'Item Name');
    t.sh.getRange(old.row, need(t, 'Photo ID') + 1).setValue('');
    t.sh.getRange(old.row, need(t, 'Thumbnail') + 1).setValue('');
    SpreadsheetApp.flush();
    trashItemPhotoIfUnused(old.photoId);
    SpreadsheetApp.flush();
    return { removed: true };
  });
}

function sameCustomer(s, name, contact) {
  return s.customerName.trim().toLowerCase() === String(name).trim().toLowerCase() && s.contact.trim() === String(contact || '').trim();
}

function actionGetCustomerSales(p) {
  if (!p.customerName) throw new ApiError('customerName is required');
  return salesRows()
    .filter((s) => sameCustomer(s, p.customerName, p.contact))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.row - a.row));
}

/**
 * params: { customerName, contact, amount }
 * Applies the payment to the customer's oldest unpaid sales first.
 */
function actionRecordPayment(p) {
  const amount = round2(p.amount);
  if (!p.customerName) throw new ApiError('customerName is required');
  if (amount <= 0) throw new ApiError('Payment must be more than 0');

  return withLock(() => {
    const open = salesRows()
      .filter((s) => sameCustomer(s, p.customerName, p.contact) && s.balance > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row));
    const owed = round2(open.reduce((s, x) => s + x.balance, 0));
    if (!open.length) throw new ApiError('This customer has no unpaid balance');
    if (amount > owed) throw new ApiError('Payment (' + amount + ') is more than the amount owed (' + owed + ')');

    const t = readTable(CFG.SHEETS.SALES, 'Item ID');
    const cPaid = need(t, 'Amount Paid');
    let left = amount;
    const applied = [];
    open.forEach((s) => {
      if (left <= 0) return;
      const pay = round2(Math.min(left, s.balance));
      t.sh.getRange(s.row, cPaid + 1).setValue(round2(s.paid + pay));
      left = round2(left - pay);
      applied.push({ row: s.row, itemName: s.itemName, date: s.date, applied: pay });
    });
    SpreadsheetApp.flush();
    return { applied: applied, remainingBalance: round2(owed - amount) };
  });
}

// ---------------------------------------------------------------------------
// Dashboard & expenses (owner only)
// ---------------------------------------------------------------------------

const DASH_KEYS = {
  'Gross Sales Revenue': 'grossSales',
  'Total Discounts Given': 'discounts',
  'Net Revenue': 'netRevenue',
  'Actual Cash Collected': 'cashCollected',
  'Total Accounts Receivable': 'receivable',
  'Cost of Goods Sold (COGS)': 'cogs',
  'Total Operational Expenses': 'expenses',
  'Gross Profit': 'grossProfit',
  'Net Profit / Loss': 'netProfit',
  'Gross Margin %': 'grossMargin',
  'Net Margin %': 'netMargin',
  'Inventory Value on Hand (at cost)': 'inventoryValue',
};

/** params: { month?: "YYYY-MM" } — sets the dashboard period to that month, then reads it. */
function actionGetDashboard(p) {
  const sh = sheet(CFG.SHEETS.DASHBOARD);
  if (p.month) {
    if (!/^\d{4}-\d{2}$/.test(String(p.month))) throw new ApiError('month must be YYYY-MM');
    withLock(() => {
      sh.getRange(CFG.DASH_START_CELL).setValue(p.month + '-01');
      SpreadsheetApp.flush();
    });
  }
  const values = sh.getRange('A3:C14').getValues();
  const allTime = {};
  const period = {};
  values.forEach((r) => {
    const key = DASH_KEYS[String(r[0]).trim()];
    if (!key) return;
    allTime[key] = num(r[1]);
    if (r[2] !== '' && r[2] !== null) period[key] = num(r[2]);
  });
  const range = sh.getRange('F3:F4').getDisplayValues();
  return { allTime: allTime, period: period, periodStart: range[0][0], periodEnd: range[1][0] };
}

function actionGetExpenses(p) {
  const t = readTable(CFG.SHEETS.EXPENSES, 'Date');
  const c = t.col;
  const rows = t.rows
    .filter((r) => r.v[c['Amount Paid']] !== '')
    .map((r) => ({
      row: r.row,
      date: r.d[c['Date']],
      category: String(r.v[c['Expense Category']] || ''),
      description: String(r.v[c['Description']] || ''),
      amount: num(r.v[c['Amount Paid']]),
      method: String(r.v[c['Payment Method']] || ''),
    }));
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.row - a.row));
  const limit = Math.min(Math.max(num(p.limit) || 100, 1), 1000);
  return rows.slice(0, limit);
}

function actionAddExpense(p) {
  const date = cleanDate(p.date);
  const category = String(p.category || '').trim();
  const amount = round2(p.amount);
  const method = String(p.method || '').trim();
  if (CFG.EXPENSE_CATEGORIES.indexOf(category) === -1) throw new ApiError('Category must be one of: ' + CFG.EXPENSE_CATEGORIES.join(', '));
  if (amount <= 0) throw new ApiError('Amount must be more than 0');
  return withLock(() => {
    const t = readTable(CFG.SHEETS.EXPENSES, 'Date');
    const row = t.nextRow;
    const sh = t.sh;
    sh.getRange(row, need(t, 'Date') + 1).setValue(date);
    sh.getRange(row, need(t, 'Expense Category') + 1).setValue(category);
    sh.getRange(row, need(t, 'Description') + 1).setValue(String(p.description || '').trim());
    sh.getRange(row, need(t, 'Amount Paid') + 1).setValue(amount);
    sh.getRange(row, need(t, 'Payment Method') + 1).setValue(method);
    SpreadsheetApp.flush();
    return { row: row, date: date, category: category, description: String(p.description || '').trim(), amount: amount, method: method };
  });
}

// ---------------------------------------------------------------------------
// Owners: opening balances, capital and drawings (owner only)
//
// Partner balance = opening capital + capital in − drawings (opening + later)
//                 + profit share × (past profit + net profit since go-live)
// "Past profit" is the profit made before the app that nobody recorded:
//   opening cash + stock value + customer balances − (capital − drawings so far)
// Drawings never go into Expenses, so net profit is not affected by them.
// ---------------------------------------------------------------------------

const LEDGER_HEADERS = ['Date', 'Owner', 'Type', 'Amount', 'Method', 'Note', 'Entered By', 'Created'];
const LEDGER = {
  OPEN_CAPITAL: 'Opening capital',
  OPEN_DRAWINGS: 'Opening drawings',
  OPEN_CASH: 'Opening cash',
  OPEN_PROFIT: 'Opening past profit',
  CAPITAL: 'Capital in',
  DRAWING: 'Drawing',
};
const OPENING_TYPES = [LEDGER.OPEN_CAPITAL, LEDGER.OPEN_DRAWINGS, LEDGER.OPEN_CASH, LEDGER.OPEN_PROFIT];
const OPENING_PROP = 'opening_balances';

function ledgerSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEETS.LEDGER);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEETS.LEDGER);
    sh.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
    sh.getRange(1, 1, 1, LEDGER_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** A sheet date cell (Date object or text) as YYYY-MM-DD. */
function ymd(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').trim().slice(0, 10);
}

function ledgerRows() {
  ledgerSheet();
  const t = readTable(CFG.SHEETS.LEDGER, 'Type');
  const c = t.col;
  return t.rows.map((r) => ({
    row: r.row,
    date: ymd(r.v[c['Date']]),
    owner: String(r.v[c['Owner']] || ''),
    type: String(r.v[c['Type']]),
    amount: num(r.v[c['Amount']]),
    method: String(r.v[c['Method']] || ''),
    note: String(r.v[c['Note']] || ''),
    enteredBy: String(r.v[c['Entered By']] || ''),
  }));
}

function appendLedger(row) {
  const sh = ledgerSheet();
  const t = readTable(CFG.SHEETS.LEDGER, 'Type');
  const r = t.nextRow;
  sh.getRange(r, 1, 1, LEDGER_HEADERS.length).setValues([[
    row.date, row.owner || '', row.type, round2(row.amount), row.method || '', row.note || '', row.enteredBy || '', new Date().toISOString(),
  ]]);
  return r;
}

/** Active users with the owner role — these are the partners. */
function ownerUsernames() {
  const values = getUsersSheet().getDataRange().getValues();
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const name = String(values[r][0]).trim();
    const role = String(values[r][2]).trim().toLowerCase();
    const active = values[r][3] === true || String(values[r][3]).toUpperCase() === 'TRUE';
    if (name && role === ROLES.OWNER && active) out.push(name);
  }
  return out;
}

function findOwner(owners, name) {
  const want = String(name || '').trim().toLowerCase();
  return owners.filter((o) => o.toLowerCase() === want)[0] || null;
}

function getOpening() {
  const raw = PropertiesService.getScriptProperties().getProperty(OPENING_PROP);
  return raw ? JSON.parse(raw) : null;
}

/** Money figures that come from the Sales and Inventory tabs right now. */
function businessSnapshot() {
  const inv = inventoryRows(true);
  const sales = salesRows();
  return {
    stockValue: round2(inv.reduce((s, i) => s + i.costPrice * Math.max(0, i.currentStock), 0)),
    receivable: round2(sales.reduce((s, x) => s + Math.max(0, x.balance), 0)),
    totalPaid: round2(sales.reduce((s, x) => s + x.paid, 0)),
  };
}

/** Profit share as {username: percent}; missing or invalid → equal split. */
function cleanProfitShare(owners, share) {
  const equal = {};
  owners.forEach((o) => (equal[o] = round2(100 / owners.length)));
  if (!share || typeof share !== 'object') return equal;
  const out = {};
  let total = 0;
  owners.forEach((o) => {
    const key = Object.keys(share).filter((k) => k.toLowerCase() === o.toLowerCase())[0];
    const pct = key === undefined ? 0 : num(share[key]);
    if (pct < 0) throw new ApiError('Profit share cannot be negative');
    out[o] = round2(pct);
    total += pct;
  });
  if (Math.abs(total - 100) > 0.05) throw new ApiError('Profit shares must add up to 100% (now ' + round2(total) + '%)');
  return out;
}

/**
 * params: { date, cash, owners: [{ username, capital, drawings }], profitShare?: {username: percent},
 *           preview?: true, overwrite?: true }
 * Saves the go-live snapshot once. Do the stock count (setStockCounts) first, because the
 * stock value is read at the moment this is saved. preview:true only returns the figures.
 */
function actionSaveOpeningBalances(p, user) {
  const date = cleanDate(p.date);
  const cash = round2(p.cash);
  if (cash < 0) throw new ApiError('Cash in hand cannot be negative');
  const owners = ownerUsernames();
  if (!owners.length) throw new ApiError('No owner users found. Add each partner as an owner user first.');
  const input = Array.isArray(p.owners) ? p.owners : [];
  const lines = owners.map((o) => {
    const given = input.filter((x) => String(x.username || '').trim().toLowerCase() === o.toLowerCase())[0] || {};
    const capital = round2(given.capital);
    const drawings = round2(given.drawings);
    if (capital < 0 || drawings < 0) throw new ApiError('Capital and money taken cannot be negative (' + o + ')');
    return { username: o, capital: capital, drawings: drawings };
  });
  input.forEach((x) => {
    if (!findOwner(owners, x.username)) throw new ApiError('Not an owner user: ' + x.username);
  });
  const profitShare = cleanProfitShare(owners, p.profitShare);

  const build = () => {
    const snap = businessSnapshot();
    const capital = round2(lines.reduce((s, l) => s + l.capital, 0));
    const drawings = round2(lines.reduce((s, l) => s + l.drawings, 0));
    const pastProfit = round2(cash + snap.stockValue + snap.receivable - (capital - drawings));
    return {
      date: date,
      cash: cash,
      stockValue: snap.stockValue,
      receivable: snap.receivable,
      paidBaseline: snap.totalPaid,
      capital: capital,
      drawings: drawings,
      pastProfit: pastProfit,
      owners: lines,
      profitShare: profitShare,
      savedBy: user.username,
      savedAt: new Date().toISOString(),
    };
  };

  if (p.preview) return Object.assign(build(), { preview: true });

  return withLock(() => {
    if (getOpening() && !p.overwrite) throw new ApiError('Opening balances are already saved', 'EXISTS');
    const later = ledgerRows().filter((r) => OPENING_TYPES.indexOf(r.type) === -1 && r.date < date);
    if (later.length) throw new ApiError('There are capital or drawing entries before ' + date + '. Pick an earlier go-live date.');
    const sh = ledgerSheet();
    // Clear any old opening rows (overwrite).
    ledgerRows()
      .filter((r) => OPENING_TYPES.indexOf(r.type) !== -1)
      .forEach((r) => sh.getRange(r.row, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS.map(() => '')]));

    const o = build();
    const by = user.username;
    appendLedger({ date: date, type: LEDGER.OPEN_CASH, amount: o.cash, note: 'Cash in hand on go-live date', enteredBy: by });
    o.owners.forEach((l) => {
      appendLedger({ date: date, owner: l.username, type: LEDGER.OPEN_CAPITAL, amount: l.capital, note: 'Total put in before go-live', enteredBy: by });
      appendLedger({ date: date, owner: l.username, type: LEDGER.OPEN_DRAWINGS, amount: l.drawings, note: 'Total taken before go-live', enteredBy: by });
    });
    appendLedger({
      date: date, type: LEDGER.OPEN_PROFIT, amount: o.pastProfit, enteredBy: by,
      note: 'Cash ' + o.cash + ' + stock ' + o.stockValue + ' + owed by customers ' + o.receivable + ' − (capital ' + o.capital + ' − taken ' + o.drawings + ')',
    });
    PropertiesService.getScriptProperties().setProperty(OPENING_PROP, JSON.stringify(o));
    SpreadsheetApp.flush();
    return o;
  });
}

/**
 * params: { counts: [{ itemId, qty }] }
 * Sets each item's stock to the counted quantity. Old sales rows are kept: Initial Stock
 * becomes counted + units already sold, so Current Stock equals the count.
 */
function actionSetStockCounts(p) {
  const counts = Array.isArray(p.counts) ? p.counts : [];
  if (!counts.length) throw new ApiError('Enter at least one count');
  counts.forEach((x, n) => {
    const q = num(x.qty);
    if (String(x.qty) === '' || q < 0 || Math.floor(q) !== q) throw new ApiError('Line ' + (n + 1) + ': count must be a whole number, 0 or more');
  });
  return withLock(() => {
    const t = readTable(CFG.SHEETS.INVENTORY, 'Item ID');
    const idCol = need(t, 'Item ID');
    const stockCol = need(t, 'Initial Stock');
    const soldCol = need(t, 'Units Sold');
    const plan = counts.map((x) => {
      const id = String(x.itemId || '').trim();
      const r = t.rows.filter((row) => String(row.v[idCol]).trim() === id)[0];
      if (!r) throw new ApiError('Item not found: ' + id);
      return { r: r, value: num(x.qty) + num(r.v[soldCol]) };
    });
    plan.forEach((x) => t.sh.getRange(x.r.row, stockCol + 1).setValue(x.value));
    SpreadsheetApp.flush();
    const rows = plan.map((x) => x.r.row);
    return inventoryRows(true).filter((i) => rows.indexOf(i.row) !== -1);
  });
}

/** params: { date?, owner, type: 'Capital in' | 'Drawing', amount, method?, note? } */
function actionAddOwnerTransaction(p, user) {
  const opening = getOpening();
  if (!opening) throw new ApiError('Save the opening balances first', 'NO_OPENING');
  const date = cleanDate(p.date);
  const type = String(p.type || '').trim();
  const amount = round2(p.amount);
  const method = String(p.method || '').trim();
  const owner = findOwner(ownerUsernames(), p.owner);
  if (type !== LEDGER.CAPITAL && type !== LEDGER.DRAWING) throw new ApiError('Type must be "' + LEDGER.CAPITAL + '" or "' + LEDGER.DRAWING + '"');
  if (!owner) throw new ApiError('Pick one of the owners');
  if (amount <= 0) throw new ApiError('Amount must be more than 0');
  if (method && CFG.PAYMENT_METHODS.indexOf(method) === -1) throw new ApiError('Method must be one of: ' + CFG.PAYMENT_METHODS.join(', '));
  if (date < opening.date) throw new ApiError('Date cannot be before the go-live date (' + opening.date + ')');
  return withLock(() => {
    const note = String(p.note || '').trim().slice(0, 200);
    const row = appendLedger({ date: date, owner: owner, type: type, amount: amount, method: method, note: note, enteredBy: user.username });
    SpreadsheetApp.flush();
    return { row: row, date: date, owner: owner, type: type, amount: amount, method: method, note: note, enteredBy: user.username };
  });
}

/** params: { owner?, limit? } — capital and drawing entries after go-live, newest first. */
function actionGetOwnerTransactions(p) {
  const want = String(p.owner || '').trim().toLowerCase();
  const rows = ledgerRows()
    .filter((r) => r.type === LEDGER.CAPITAL || r.type === LEDGER.DRAWING)
    .filter((r) => !want || r.owner.toLowerCase() === want);
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.row - a.row));
  const limit = Math.min(Math.max(num(p.limit) || 100, 1), 1000);
  return rows.slice(0, limit);
}

/** Partner balances, profit since go-live and an estimate of cash in hand. */
function actionGetOwnerSummary() {
  const opening = getOpening();
  const owners = ownerUsernames();
  if (!opening) return { opening: null, owners: owners, partners: [], totals: null };

  const start = opening.date;
  const cost = {};
  inventoryRows(true).forEach((i) => (cost[String(i.itemId).trim()] = i.costPrice));
  const sales = salesRows();
  const since = sales.filter((s) => s.dateYmd >= start);
  const netRevenue = round2(since.reduce((s, x) => s + x.total, 0));
  const cogs = round2(since.reduce((s, x) => s + x.qty * (x.unitCost !== null ? x.unitCost : num(cost[String(x.itemId).trim()])), 0));
  const exp = readTable(CFG.SHEETS.EXPENSES, 'Date');
  const expenses = round2(exp.rows.reduce((s, r) => {
    const d = ymd(r.v[exp.col['Date']]);
    return d && d >= start ? s + num(r.v[exp.col['Amount Paid']]) : s;
  }, 0));
  const profitSince = round2(netRevenue - cogs - expenses);
  const cashCollected = round2(sales.reduce((s, x) => s + x.paid, 0) - num(opening.paidBaseline));

  const ledger = ledgerRows();
  const sumFor = (owner, type) =>
    round2(ledger.filter((r) => r.type === type && (owner === null || r.owner.toLowerCase() === owner.toLowerCase())).reduce((s, r) => s + r.amount, 0));
  const profitPool = round2(num(opening.pastProfit) + profitSince);

  // Owners in the opening snapshot plus any owner users added later.
  const names = (opening.owners || []).map((o) => o.username);
  owners.forEach((o) => {
    if (!findOwner(names, o)) names.push(o);
  });
  const partners = names.map((name) => {
    const shareKey = Object.keys(opening.profitShare || {}).filter((k) => k.toLowerCase() === name.toLowerCase())[0];
    const share = shareKey === undefined ? 0 : num(opening.profitShare[shareKey]);
    const openingCapital = sumFor(name, LEDGER.OPEN_CAPITAL);
    const capitalIn = sumFor(name, LEDGER.CAPITAL);
    const openingDrawings = sumFor(name, LEDGER.OPEN_DRAWINGS);
    const drawings = sumFor(name, LEDGER.DRAWING);
    const profitShare = round2((profitPool * share) / 100);
    return {
      username: name,
      sharePercent: share,
      openingCapital: openingCapital,
      capitalIn: capitalIn,
      openingDrawings: openingDrawings,
      drawings: drawings,
      profitShare: profitShare,
      balance: round2(openingCapital + capitalIn - openingDrawings - drawings + profitShare),
    };
  });

  const capitalIn = sumFor(null, LEDGER.CAPITAL);
  const drawings = sumFor(null, LEDGER.DRAWING);
  return {
    opening: opening,
    owners: owners,
    partners: partners,
    totals: {
      netRevenue: netRevenue,
      cogs: cogs,
      expenses: expenses,
      profitSince: profitSince,
      pastProfit: num(opening.pastProfit),
      cashCollected: cashCollected,
      capitalIn: capitalIn,
      drawings: drawings,
      // Restocks have no cost recorded yet, so stock bought after go-live is not taken off.
      cashEstimate: round2(num(opening.cash) + cashCollected - expenses + capitalIn - drawings),
      equity: round2(partners.reduce((s, x) => s + x.balance, 0)),
    },
  };
}

// ---------------------------------------------------------------------------
// Sheet menu for the owner (add users without touching code)
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Calico App')
    .addItem('Add or reset a user', 'menuAddUser')
    .addItem('Disable a user', 'menuDisableUser')
    .addItem('Sign out all devices', 'menuClearSessions')
    .addToUi();
}

function menuAddUser() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt('Add or reset a user', 'Username (3-30 letters/numbers):', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  const pin = ui.prompt('PIN for ' + u.getResponseText(), 'PIN (4-8 digits):', ui.ButtonSet.OK_CANCEL);
  if (pin.getSelectedButton() !== ui.Button.OK) return;
  const role = ui.prompt('Role', 'Type admin, owner or staff:', ui.ButtonSet.OK_CANCEL);
  if (role.getSelectedButton() !== ui.Button.OK) return;
  try {
    const res = upsertUser(u.getResponseText(), pin.getResponseText(), role.getResponseText());
    ui.alert('Saved: ' + res.username + ' (' + res.role + ')');
  } catch (e) {
    ui.alert('Not saved: ' + e.message);
  }
}

function menuDisableUser() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt('Disable a user', 'Username:', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  const user = findUser(u.getResponseText());
  if (!user) return ui.alert('User not found');
  getUsersSheet().getRange(user.row, 4).setValue(false);
  ui.alert(user.username + ' is disabled. They are signed out on their next request.');
}

function menuClearSessions() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach((k) => {
    if (k.indexOf('sess_') === 0) props.deleteProperty(k);
  });
  SpreadsheetApp.getUi().alert('Everyone has been signed out.');
}
