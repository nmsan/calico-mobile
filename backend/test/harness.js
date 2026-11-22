// Mock Apps Script environment with an in-memory copy of the Calico sheet.
// flush() recalculates the formula columns the same way the real sheet does.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function a1(ref) { const m = /^([A-Z]+)(\d+)$/.exec(ref); return [Number(m[2]), colToNum(m[1])]; }

class Sheet {
  constructor(name, rows) { this.name = name; this.cells = rows.map((r) => r.slice()); this.formats = {}; }
  ensure(r, c) { while (this.cells.length < r) this.cells.push([]); const row = this.cells[r - 1]; while (row.length < c) row.push(''); }
  get(r, c) { const row = this.cells[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
  set(r, c, v) { this.ensure(r, c); this.cells[r - 1][c - 1] = v; }
  getLastRow() { for (let r = this.cells.length; r >= 1; r--) if (this.cells[r - 1].some((v) => v !== '' && v !== null)) return r; return 0; }
  getLastColumn() { let m = 0; this.cells.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== null) m = Math.max(m, i + 1); })); return m; }
  getRange(a, b, nr, nc) {
    if (typeof a === 'string') {
      if (a.includes(':')) { const [s, e] = a.split(':').map(a1); return new Range(this, s[0], s[1], e[0] - s[0] + 1, e[1] - s[1] + 1); }
      const [r, c] = a1(a); return new Range(this, r, c, 1, 1);
    }
    return new Range(this, a, b, nr || 1, nc || 1);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); }
  setFrozenRows() {}
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map((row) => row.map((v) => (v === '' || v === null ? '' : String(v)))); }
  getValue() { return this.sh.get(this.r, this.c); }
  setValue(v) {
    // Mimic Sheets parsing a typed value unless the cell is formatted as text.
    const text = this.sh.formats[this.r + ',' + this.c] === '@';
    if (!text && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    this.sh.set(this.r, this.c, v); return this;
  }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  setNumberFormat(f) { this.sh.formats[this.r + ',' + this.c] = f; return this; }
  setFormula(f) { this.sh.formulas = this.sh.formulas || {}; this.sh.formulas[this.r + ',' + this.c] = f; return this; }
  setFontWeight() { return this; }
}

function buildSheets() {
  const S = {};
  S.Inventory = new Sheet('Inventory', [
    ['Item ID', 'Category', 'Item Name', 'Size', 'Color', 'Cost Price', 'Selling Price', 'Initial Stock', 'Units Sold', 'Current Stock', 'Stock Status', '', 'Low stock alert at (units)', 5],
    ['TOP-001-M-BLK', 'Tops', 'Linen Shirt', 'M', 'Black', 1800, 3500, 20],
    ['DRS-001-S-RED', 'Dresses', 'Floral Maxi Dress', 'S', 'Red', 2500, 4800, 6],
    [123, 'Hat', 'Ice cap', 'M', 'Blue', 150, 300, 4],
  ]);
  S.Sales = new Sheet('Sales', [
    ['Date', 'Customer Name', 'Contact Info', 'Item ID', 'Item Name', 'Variant (Size/Color)', 'Qty Sold', 'Unit Selling Price', 'Subtotal', 'Discount Amount', 'Total Amount', 'Amount Paid', 'Balance Due', 'Payment Status'],
    ['2026-11-10', 'Nimal Perera', '0771234567', 'TOP-001-M-BLK', '', '', 2, '', '', 500, '', 6500],
    ['2026-11-12', 'Kamala Silva', '0719876543', 'DRS-001-S-RED', '', '', 1, '', '', 0, '', 4800],
  ]);
  S.Customers = new Sheet('Customers', [['Customer ID', 'Customer Name', 'Contact Info', 'No. of Purchases', 'Total Spent', 'Total Paid', 'Balance Owed', 'Last Purchase', 'Status']]);
  S.Expenses = new Sheet('Expenses', [
    ['Date', 'Expense Category', 'Description', 'Amount Paid', 'Payment Method', '', 'Category', 'Total Spent'],
    ['2026-11-01', 'Rent', 'Shop rent', 25000, 'Bank Transfer', '', 'Rent', ''],
    ['', '', '', '', '', '', 'Utilities', ''],
  ]);
  const dash = [['Profit and Loss'], ['Metric', 'All Time', 'Selected Period', '', 'Period']];
  ['Gross Sales Revenue', 'Total Discounts Given', 'Net Revenue', 'Actual Cash Collected', 'Total Accounts Receivable', 'Cost of Goods Sold (COGS)', 'Total Operational Expenses', 'Gross Profit', 'Net Profit / Loss', 'Gross Margin %', 'Net Margin %', 'Inventory Value on Hand (at cost)'].forEach((l) => dash.push([l, '', '']));
  dash[2][4] = 'Start date'; dash[2][5] = '2026-11-01'; dash[3][4] = 'End date'; dash[3][5] = '2026-11-30';
  S['P&L Dashboard'] = new Sheet('P&L Dashboard', dash);
  return S;
}

function recalc(S) {
  const inv = S.Inventory, sales = S.Sales;
  const invRows = [];
  for (let r = 2; r <= inv.getLastRow(); r++) if (inv.get(r, 1) !== '') invRows.push(r);
  const look = (id) => invRows.find((r) => inv.get(r, 1) === id); // XLOOKUP is type-sensitive
  const saleRows = [];
  // After snapshotSalePrices, column H holds each sale's own price and O its cost.
  const saved = sales.get(1, 15) === 'Unit Cost';
  for (let r = 2; r <= Math.max(sales.getLastRow(), 2); r++) {
    for (let c = 5; c <= 14; c++) if (![7, 10, 12].includes(c) && !(saved && c === 8)) sales.set(r, c, '');
    if (sales.get(r, 4) === '') continue;
    saleRows.push(r);
    const ir = look(sales.get(r, 4));
    sales.set(r, 5, ir ? inv.get(ir, 3) : 'ID not found');
    sales.set(r, 6, ir ? inv.get(ir, 4) + ' / ' + inv.get(ir, 5) : '');
    const price = saved ? Number(sales.get(r, 8)) || 0 : ir ? inv.get(ir, 7) : 0;
    const qty = Number(sales.get(r, 7)) || 0, disc = Number(sales.get(r, 10)) || 0, paid = Number(sales.get(r, 12)) || 0;
    sales.set(r, 8, price); sales.set(r, 9, qty * price); sales.set(r, 11, qty * price - disc);
    const bal = qty * price - disc - paid; sales.set(r, 13, bal);
    sales.set(r, 14, bal <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid');
  }
  invRows.forEach((r) => {
    const sold = saleRows.filter((s) => String(sales.get(s, 4)) === String(inv.get(r, 1))).reduce((a, s) => a + Number(sales.get(s, 7)), 0);
    inv.set(r, 9, sold); const cur = Number(inv.get(r, 8)) - sold; inv.set(r, 10, cur);
    inv.set(r, 11, cur <= 0 ? 'Out of Stock' : cur <= inv.get(1, 14) ? 'Low Stock' : 'In Stock');
  });
  // Customers (UNIQUE of name+contact)
  const cust = S.Customers; cust.cells = [cust.cells[0]];
  const seen = [];
  saleRows.forEach((s) => { const k = sales.get(s, 2) + '|' + sales.get(s, 3); if (!seen.includes(k)) seen.push(k); });
  seen.forEach((k, i) => {
    const [n, c] = k.split('|'); const mine = saleRows.filter((s) => sales.get(s, 2) === n && String(sales.get(s, 3)) === c);
    const spent = mine.reduce((a, s) => a + sales.get(s, 11), 0), paid = mine.reduce((a, s) => a + sales.get(s, 12), 0);
    const last = mine.map((s) => sales.get(s, 1)).sort().pop();
    cust.cells.push(['C' + String(i + 1).padStart(3, '0'), n, c, mine.length, spent, paid, spent - paid, last, spent - paid > 0 ? 'Owes money' : 'Clear']);
  });
  // Dashboard (all-time only is enough for the API test)
  const d = S['P&L Dashboard'];
  const sum = (c) => saleRows.reduce((a, s) => a + (Number(sales.get(s, c)) || 0), 0);
  const cogs = saleRows.reduce((a, s) => {
    if (saved) return a + (Number(sales.get(s, 15)) || 0) * sales.get(s, 7);
    const ir = look(sales.get(s, 4)); return a + (ir ? inv.get(ir, 6) * sales.get(s, 7) : 0);
  }, 0);
  let exp = 0; for (let r = 2; r <= S.Expenses.getLastRow(); r++) exp += Number(S.Expenses.get(r, 4)) || 0;
  const vals = { 3: sum(9), 4: sum(10) }; vals[5] = vals[3] - vals[4]; vals[6] = sum(12); vals[7] = saleRows.reduce((a, s) => a + Math.max(0, sales.get(s, 13)), 0);
  vals[8] = cogs; vals[9] = exp; vals[10] = vals[5] - cogs; vals[11] = vals[10] - exp; vals[12] = vals[5] ? vals[10] / vals[5] : 0; vals[13] = vals[5] ? vals[11] / vals[5] : 0;
  vals[14] = invRows.reduce((a, r) => a + inv.get(r, 6) * inv.get(r, 10), 0);
  Object.keys(vals).forEach((r) => { d.set(Number(r), 2, vals[r]); if (Number(r) < 14) d.set(Number(r), 3, vals[r]); });
}

function makeContext() {
  const S = buildSheets();
  recalc(S);
  const props = {}; const cache = {};
  const ss = {
    getSheetByName: (n) => S[n] || null,
    insertSheet: (n) => (S[n] = new Sheet(n, [])),
    getSpreadsheetTimeZone: () => 'Asia/Colombo',
    getId: () => 'ss1',
    getName: () => 'Calico invetory',
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => recalc(S), getUi: () => { throw new Error('no ui'); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => { if (!/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error('bad base64'); return Array.from(Buffer.from(s, 'base64')); },
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes, getContentType: () => type }),
      formatDate: (d) => d.toISOString().slice(0, 10),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; }, getProperties: () => Object.assign({}, props),
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    DriveApp: (() => {
      const files = {}; const folders = {}; let n = 0;
      const mkFile = (blob) => { const id = 'file' + ++n; const f = { id, blob, trashed: false, getId: () => id, getBlob: () => blob, setTrashed(v) { f.trashed = v; } }; files[id] = f; return f; };
      return {
        files, folders,
        createFolder: (name) => { const id = 'folder' + ++n; const f = { getId: () => id, getName: () => name, isTrashed: () => false, createFile: mkFile }; folders[id] = f; return f; },
        getFolderById: (id) => { if (!folders[id]) throw new Error('no folder'); return folders[id]; },
        copies: [],
        getFileById(id) {
          if (id === 'ss1') return { makeCopy: (name) => { this.copies.push(name); return { getName: () => name, getId: () => 'copy' + this.copies.length }; } };
          if (!files[id]) throw new Error('no file'); return files[id];
        },
      };
    })(),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  ctx.__S = S;
  const call = (body) => { ctx.__e = { postData: { contents: JSON.stringify(body) } }; return JSON.parse(vm.runInContext('doPost(__e)', ctx).body); };
  const run = (code) => vm.runInContext(code, ctx);
  return { S, call, run, ctx };
}

module.exports = { makeContext };
