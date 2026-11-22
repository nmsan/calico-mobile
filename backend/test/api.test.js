const test = require('node:test');
const assert = require('node:assert');
const { makeContext } = require('./harness');

function setup() {
  const t = makeContext();
  t.run("upsertUser('asanka', '1234', 'owner'); upsertUser('staff1', '5678', 'staff');");
  const owner = t.call({ action: 'login', username: 'asanka', pin: '1234' }).data.token;
  const staff = t.call({ action: 'login', username: 'Staff1', pin: '5678' }).data.token;
  return Object.assign(t, { owner, staff });
}

test('ping is public, other actions need a token', () => {
  const t = makeContext();
  assert.equal(t.call({ action: 'ping' }).ok, true);
  const r = t.call({ action: 'getInventory' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'UNAUTHORIZED');
  assert.equal(t.call({ action: 'nope' }).ok, false);
});

test('login: wrong PIN rejected, lockout after 5 fails, PIN stored hashed', () => {
  const t = makeContext();
  t.run("upsertUser('asanka', '1234', 'owner')");
  assert.notEqual(t.S.Users.get(2, 2), '1234');
  assert.match(String(t.S.Users.get(2, 2)), /^[0-9a-f]{32}\$[0-9a-f]{64}$/);
  for (let i = 0; i < 5; i++) assert.equal(t.call({ action: 'login', username: 'asanka', pin: '0000' }).code, 'UNAUTHORIZED');
  assert.equal(t.call({ action: 'login', username: 'asanka', pin: '1234' }).code, 'LOCKED');
});

test('staff cannot see cost prices, dashboard or expenses', () => {
  const t = setup();
  const inv = t.call({ action: 'getInventory', token: t.staff });
  assert.equal(inv.ok, true);
  assert.equal(inv.data.items[0].costPrice, undefined);
  assert.equal(t.call({ action: 'getInventory', token: t.owner }).data.items[0].costPrice, 1800);
  assert.equal(t.call({ action: 'getDashboard', token: t.staff }).code, 'FORBIDDEN');
  assert.equal(t.call({ action: 'addExpense', token: t.staff, category: 'Rent', amount: 1 }).code, 'FORBIDDEN');
  assert.equal(t.call({ action: 'addInventoryItem', token: t.staff }).code, 'FORBIDDEN');
});

test('recordSale writes one row per item into the right columns and applies payment in order', () => {
  const t = setup();
  const r = t.call({
    action: 'recordSale', token: t.staff, date: '2026-11-14', customerName: 'Ruwan Fernando', contact: '0712223334', amountPaid: 3500,
    items: [{ itemId: 'TOP-001-M-BLK', qty: 1, discount: 200 }, { itemId: '123', qty: 2 }],
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.rows.length, 2);
  assert.equal(r.data.total, 3300 + 600);
  assert.equal(r.data.paid, 3500);
  assert.equal(r.data.balance, 400);
  const S = t.S.Sales;
  // rows 4 and 5 (after the 2 existing sales)
  assert.equal(S.get(4, 1), '2026-11-14');
  assert.equal(S.get(4, 2), 'Ruwan Fernando');
  assert.equal(S.get(4, 3), '0712223334'); // leading zero kept
  assert.equal(S.get(4, 4), 'TOP-001-M-BLK');
  assert.equal(S.get(4, 10), 200);
  assert.equal(S.get(4, 12), 3300); // first line fully paid
  assert.equal(S.get(5, 4), 123); // numeric ID written as number so lookup matches
  assert.equal(S.get(5, 5), 'Ice cap');
  assert.equal(S.get(5, 12), 200); // remainder goes to the second line
  assert.equal(S.get(5, 14), 'Partial');
  assert.equal(S.get(4, 14), 'Paid');
});

test('amountPaid more than total is rejected (was: overpay)', () => {
  const t = setup();
  const r = t.call({ action: 'recordSale', token: t.staff, customerName: 'X', amountPaid: 99999, items: [{ itemId: '123', qty: 1 }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /more than the total/);
});

test('recordSale blocks overselling and bad input, writes nothing on failure', () => {
  const t = setup();
  const before = t.S.Sales.getLastRow();
  let r = t.call({ action: 'recordSale', token: t.staff, customerName: 'X', amountPaid: 0, items: [{ itemId: 'DRS-001-S-RED', qty: 10 }] });
  assert.equal(r.code, 'NO_STOCK');
  r = t.call({ action: 'recordSale', token: t.staff, customerName: 'X', amountPaid: 0, items: [{ itemId: 'TOP-001-M-BLK', qty: 1 }, { itemId: 'NOPE', qty: 1 }] });
  assert.match(r.error, /not found/);
  r = t.call({ action: 'recordSale', token: t.staff, customerName: 'X', amountPaid: 0, items: [{ itemId: 'TOP-001-M-BLK', qty: 1, discount: 5000 }] });
  assert.match(r.error, /discount/);
  r = t.call({ action: 'recordSale', token: t.staff, customerName: 'X', date: '2026-02-30', amountPaid: 0, items: [{ itemId: 'TOP-001-M-BLK', qty: 1 }] });
  assert.match(r.error, /Invalid date/);
  assert.equal(t.S.Sales.getLastRow(), before);
});

test('unpaid sale shows on customer, payment is applied oldest-first', () => {
  const t = setup();
  t.call({ action: 'recordSale', token: t.staff, date: '2026-11-13', customerName: 'Mala', contact: '0701112223', amountPaid: 1000, items: [{ itemId: 'TOP-001-M-BLK', qty: 1 }] });
  t.call({ action: 'recordSale', token: t.staff, date: '2026-11-14', customerName: 'Mala', contact: '0701112223', amountPaid: 0, items: [{ itemId: '123', qty: 1 }] });
  let cust = t.call({ action: 'getCustomers', token: t.staff }).data.find((c) => c.name === 'Mala');
  assert.equal(cust.balance, 2500 + 300);
  assert.equal(cust.status, 'Owes money');

  assert.match(t.call({ action: 'recordPayment', token: t.staff, customerName: 'Mala', contact: '0701112223', amount: 5000 }).error, /more than the amount owed/);
  const pay = t.call({ action: 'recordPayment', token: t.staff, customerName: 'Mala', contact: '0701112223', amount: 2600 });
  assert.equal(pay.ok, true, pay.error);
  assert.equal(pay.data.applied[0].applied, 2500); // oldest sale cleared first
  assert.equal(pay.data.applied[1].applied, 100);
  assert.equal(pay.data.remainingBalance, 200);
  cust = t.call({ action: 'getCustomers', token: t.staff }).data.find((c) => c.name === 'Mala');
  assert.equal(cust.balance, 200);
  const hist = t.call({ action: 'getCustomerSales', token: t.staff, customerName: 'Mala', contact: '0701112223' }).data;
  assert.equal(hist.length, 2);
  assert.equal(hist[0].date, '2026-11-14'); // newest first
});

test('owner: add item, restock, duplicate ID rejected', () => {
  const t = setup();
  let r = t.call({ action: 'addInventoryItem', token: t.owner, itemId: 'BTM-001-L-BLU', category: 'Bottoms', name: 'Denim Jeans', size: 'L', color: 'Blue', costPrice: 2000, sellingPrice: 4200, initialStock: 10 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.currentStock, 10);
  assert.equal(t.S.Inventory.get(5, 1), 'BTM-001-L-BLU');
  r = t.call({ action: 'addInventoryItem', token: t.owner, itemId: 'btm-001-l-blu', name: 'Dup', costPrice: 1, sellingPrice: 2, initialStock: 1 });
  assert.match(r.error, /already exists/);
  r = t.call({ action: 'restockItem', token: t.owner, itemId: 'BTM-001-L-BLU', qty: 5 });
  assert.equal(r.data.currentStock, 15);
});

test('owner: expenses and dashboard', () => {
  const t = setup();
  const e = t.call({ action: 'addExpense', token: t.owner, date: '2026-11-14', category: 'Shipping', description: 'Courier', amount: 750, method: 'Cash' });
  assert.equal(e.ok, true, e.error);
  assert.equal(t.S.Expenses.get(3, 1), '2026-11-14'); // first empty row, not after the summary block
  assert.equal(t.S.Expenses.get(3, 7), 'Utilities'); // summary untouched
  assert.equal(t.call({ action: 'addExpense', token: t.owner, category: 'Food', amount: 1 }).ok, false);
  const list = t.call({ action: 'getExpenses', token: t.owner }).data;
  assert.equal(list.length, 2);
  assert.equal(list[0].amount, 750);
  const d = t.call({ action: 'getDashboard', token: t.owner, month: '2026-11' });
  assert.equal(d.ok, true, d.error);
  assert.equal(d.data.allTime.expenses, 25750);
  assert.equal(d.data.allTime.grossSales, 7000 + 4800);
  assert.equal(t.S['P&L Dashboard'].get(3, 6), '2026-11-01');
});

test('disabled user is signed out on next request', () => {
  const t = setup();
  t.S.Users.set(3, 4, false);
  assert.equal(t.call({ action: 'me', token: t.staff }).code, 'UNAUTHORIZED');
  assert.equal(t.call({ action: 'me', token: t.owner }).ok, true);
});

function setupPartners() {
  const t = setup();
  t.run("upsertUser('partner', '4321', 'owner');");
  return t;
}

function goLive(t) {
  const c = t.call({ action: 'setStockCounts', token: t.owner, counts: [{ itemId: 'TOP-001-M-BLK', qty: 10 }, { itemId: 'DRS-001-S-RED', qty: 3 }, { itemId: '123', qty: 4 }] });
  assert.equal(c.ok, true, c.error);
  const o = t.call({
    action: 'saveOpeningBalances', token: t.owner, date: '2026-11-15', cash: 50000,
    owners: [{ username: 'asanka', capital: 40000, drawings: 5000 }, { username: 'Partner', capital: 30000, drawings: 5000 }],
  });
  assert.equal(o.ok, true, o.error);
  return o.data;
}

test('stock count sets current stock without touching old sales', () => {
  const t = setupPartners();
  const r = t.call({ action: 'setStockCounts', token: t.owner, counts: [{ itemId: 'TOP-001-M-BLK', qty: 10 }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data[0].currentStock, 10);
  assert.equal(t.S.Inventory.get(2, 8), 12); // 10 counted + 2 already sold
  assert.equal(t.S.Sales.getLastRow(), 3);
  assert.match(t.call({ action: 'setStockCounts', token: t.owner, counts: [{ itemId: 'TOP-001-M-BLK', qty: -1 }] }).error, /whole number/);
  assert.equal(t.call({ action: 'setStockCounts', token: t.staff, counts: [] }).code, 'FORBIDDEN');
});

test('opening balances: past profit is the balancing figure, saved once', () => {
  const t = setupPartners();
  const prev = t.call({ action: 'saveOpeningBalances', token: t.owner, preview: true, date: '2026-11-15', cash: 1, owners: [] });
  assert.equal(prev.data.preview, true);
  assert.equal(t.call({ action: 'getOwnerSummary', token: t.owner }).data.opening, null); // preview wrote nothing

  const o = goLive(t);
  assert.equal(o.stockValue, 10 * 1800 + 3 * 2500 + 4 * 150); // 26100
  assert.equal(o.receivable, 0);
  assert.equal(o.capital, 70000);
  assert.equal(o.drawings, 10000);
  assert.equal(o.pastProfit, 50000 + 26100 - (70000 - 10000)); // 16100
  assert.deepEqual(o.profitShare, { asanka: 50, partner: 50 });
  const types = t.S['Owner Ledger'].cells.slice(1).map((r) => r[2]);
  assert.deepEqual(types, ['Opening cash', 'Opening capital', 'Opening drawings', 'Opening capital', 'Opening drawings', 'Opening past profit']);

  const again = t.call({ action: 'saveOpeningBalances', token: t.owner, date: '2026-11-15', cash: 0, owners: [] });
  assert.equal(again.code, 'EXISTS');
  const bad = t.call({ action: 'saveOpeningBalances', token: t.owner, overwrite: true, date: '2026-11-15', cash: 0, owners: [], profitShare: { asanka: 70, partner: 20 } });
  assert.match(bad.error, /add up to 100/);
  assert.equal(t.call({ action: 'saveOpeningBalances', token: t.staff, date: '2026-11-15' }).code, 'FORBIDDEN');
});

test('drawings lower the partner balance and cash, not profit', () => {
  const t = setupPartners();
  assert.equal(t.call({ action: 'addOwnerTransaction', token: t.owner, owner: 'asanka', type: 'Drawing', amount: 1 }).code, 'NO_OPENING');
  goLive(t);
  const dashBefore = t.call({ action: 'getDashboard', token: t.owner }).data.allTime;

  t.call({ action: 'recordSale', token: t.owner, date: '2026-11-16', customerName: 'Sunil', amountPaid: 3000, items: [{ itemId: 'TOP-001-M-BLK', qty: 1 }] });
  t.call({ action: 'addExpense', token: t.owner, date: '2026-11-16', category: 'Shipping', amount: 1000, method: 'Cash' });
  let r = t.call({ action: 'addOwnerTransaction', token: t.owner, date: '2026-11-17', owner: 'ASANKA', type: 'Drawing', amount: 2000, method: 'Cash', note: 'Personal' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.owner, 'asanka');
  r = t.call({ action: 'addOwnerTransaction', token: t.owner, date: '2026-11-17', owner: 'partner', type: 'Capital in', amount: 5000 });
  assert.equal(r.ok, true, r.error);
  assert.match(t.call({ action: 'addOwnerTransaction', token: t.owner, date: '2026-11-01', owner: 'partner', type: 'Drawing', amount: 5 }).error, /before the go-live/);
  assert.match(t.call({ action: 'addOwnerTransaction', token: t.owner, owner: 'staff1', type: 'Drawing', amount: 5 }).error, /owners/);
  assert.match(t.call({ action: 'addOwnerTransaction', token: t.owner, owner: 'partner', type: 'Expense', amount: 5 }).error, /Type must be/);
  assert.equal(t.call({ action: 'addOwnerTransaction', token: t.staff, owner: 'partner', type: 'Drawing', amount: 5 }).code, 'FORBIDDEN');

  const s = t.call({ action: 'getOwnerSummary', token: t.owner }).data;
  assert.equal(s.totals.netRevenue, 3500);
  assert.equal(s.totals.cogs, 1800);
  assert.equal(s.totals.expenses, 1000); // rent from 2026-11-01 is before go-live
  assert.equal(s.totals.profitSince, 700);
  assert.equal(s.totals.cashCollected, 3000);
  assert.equal(s.totals.cashEstimate, 50000 + 3000 - 1000 + 5000 - 2000);
  const a = s.partners.find((p) => p.username === 'asanka');
  const b = s.partners.find((p) => p.username === 'partner');
  assert.equal(a.profitShare, 8400); // half of 16100 + 700
  assert.equal(a.balance, 40000 - 5000 - 2000 + 8400);
  assert.equal(b.balance, 30000 + 5000 - 5000 + 8400);
  // Equity = what the business has: cash + stock at cost + owed by customers.
  assert.equal(s.totals.equity, 55000 + (9 * 1800 + 3 * 2500 + 4 * 150) + 500);

  const dashAfter = t.call({ action: 'getDashboard', token: t.owner }).data.allTime;
  assert.equal(dashAfter.expenses, dashBefore.expenses + 1000); // the drawing is not an expense

  const list = t.call({ action: 'getOwnerTransactions', token: t.owner }).data;
  assert.equal(list.length, 2);
  assert.equal(t.call({ action: 'getOwnerTransactions', token: t.owner, owner: 'asanka' }).data[0].amount, 2000);
});

test('admin can do everything an owner can, but is not a partner', () => {
  const t = setupPartners();
  t.run("upsertUser('boss', '9999', 'admin');");
  const admin = t.call({ action: 'login', username: 'boss', pin: '9999' }).data.token;
  assert.equal(t.call({ action: 'me', token: admin }).data.role, 'admin');
  assert.equal(t.call({ action: 'getInventory', token: admin }).data.items[0].costPrice, 1800);
  assert.equal(t.call({ action: 'getDashboard', token: admin }).ok, true);
  assert.equal(t.call({ action: 'addExpense', token: admin, category: 'Rent', amount: 10 }).ok, true);
  assert.equal(t.call({ action: 'recordSale', token: admin, customerName: 'A', amountPaid: 0, items: [{ itemId: '123', qty: 1 }] }).ok, true);

  const o = t.call({ action: 'saveOpeningBalances', token: admin, date: '2026-11-15', cash: 1000, owners: [{ username: 'asanka', capital: 500 }] });
  assert.equal(o.ok, true, o.error);
  assert.deepEqual(o.data.owners.map((x) => x.username), ['asanka', 'partner']); // admin is not a partner
  assert.match(t.call({ action: 'addOwnerTransaction', token: admin, owner: 'boss', type: 'Drawing', amount: 5 }).error, /owners/);
  assert.equal(t.call({ action: 'addOwnerTransaction', token: admin, owner: 'partner', type: 'Drawing', amount: 5 }).ok, true);
  assert.match(t.run("try { upsertUser('newbie', '1234', 'boss'); '' } catch (e) { e.message }"), /admin, owner or staff/);
});

test('getSalesDaily: totals per day, empty days filled, lines on request', () => {
  const t = setup();
  t.call({ action: 'recordSale', token: t.staff, date: '2026-11-12', customerName: 'Mala', amountPaid: 0, items: [{ itemId: '123', qty: 2 }] });
  const r = t.call({ action: 'getSalesDaily', token: t.staff, from: '2026-11-09', to: '2026-11-15' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.days.length, 7);
  assert.deepEqual(r.data.days.map((d) => d.date), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(r.data.days[0], { date: '2026-11-09', total: 0, paid: 0, balance: 0, qty: 0, lines: 0 });
  assert.equal(r.data.days[1].total, 6500);
  assert.equal(r.data.days[1].qty, 2);
  const d12 = r.data.days[3];
  assert.equal(d12.total, 4800 + 600);
  assert.equal(d12.balance, 600);
  assert.equal(d12.qty, 3);
  assert.equal(d12.lines, 2);
  assert.match(r.data.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.data.lines, undefined);

  const one = t.call({ action: 'getSalesDaily', token: t.staff, from: '2026-11-12', to: '2026-11-12', includeLines: true });
  assert.equal(one.data.days.length, 1);
  assert.equal(one.data.lines.length, 2);
  assert.equal(one.data.lines[0].customerName, 'Mala'); // newest row first
  assert.equal(one.data.lines[0].date, '2026-11-12');
});

test('getSalesDaily: range crosses months, rejects bad ranges', () => {
  const t = setup();
  const r = t.call({ action: 'getSalesDaily', token: t.owner, from: '2026-10-30', to: '2026-11-02' });
  assert.deepEqual(r.data.days.map((d) => d.date), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(t.call({ action: 'getSalesDaily', token: t.owner, from: '2026-11-10' }).code, 'BAD_REQUEST');
  assert.equal(t.call({ action: 'getSalesDaily', token: t.owner, from: '2026-11-10', to: '2026-11-01' }).ok, false);
  assert.equal(t.call({ action: 'getSalesDaily', token: t.owner, from: '2026-02-30', to: '2026-03-01' }).ok, false);
  assert.match(t.call({ action: 'getSalesDaily', token: t.owner, from: '2026-01-01', to: '2026-03-31' }).error, /62 days/);
  assert.equal(t.call({ action: 'getSalesDaily', from: '2026-11-01', to: '2026-11-02' }).code, 'UNAUTHORIZED');
});

test('addCustomer: shows before a first sale, rejects duplicates, merges once they buy', () => {
  const t = setup();
  assert.equal(t.call({ action: 'addCustomer', token: t.staff, name: '' }).ok, false);
  assert.match(t.call({ action: 'addCustomer', token: t.staff, name: 'Nimali', contact: 'abc' }).error, /phone/);
  const r = t.call({ action: 'addCustomer', token: t.staff, name: 'Nimali', contact: '0771234567' });
  assert.equal(r.ok, true);
  assert.equal(t.S['Customer Directory'].get(2, 2), '0771234567'); // kept as text
  let c = t.call({ action: 'getCustomers', token: t.owner }).data.filter((x) => x.name === 'Nimali');
  assert.equal(c.length, 1);
  assert.equal(c[0].status, 'New');
  assert.equal(c[0].balance, 0);
  assert.equal(t.call({ action: 'addCustomer', token: t.owner, name: ' nimali ', contact: '0771234567' }).code, 'EXISTS');
  // After the first sale the formula-built row wins and there is no duplicate.
  t.call({ action: 'recordSale', token: t.staff, customerName: 'Nimali', contact: '0771234567', amountPaid: 0, items: [{ itemId: '123', qty: 1 }] });
  c = t.call({ action: 'getCustomers', token: t.owner }).data.filter((x) => x.name === 'Nimali');
  assert.equal(c.length, 1);
  assert.equal(c[0].balance, 300);
});

test('customer photos: stored in Drive, read back only by ID on the directory, replaced and removed', () => {
  const t = setup();
  const jpeg = Buffer.from('fake-jpeg-bytes').toString('base64');
  t.call({ action: 'addCustomer', token: t.staff, name: 'Nimali', contact: '0771234567' });
  assert.equal(t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Nobody', data: jpeg }).ok, false);
  assert.match(t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Nimali', contact: '0771234567', data: jpeg, mimeType: 'image/gif' }).error, /JPEG or PNG/);
  assert.match(t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Nimali', contact: '0771234567', data: 'x'.repeat(400001) }).error, /too large/);

  const first = t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Nimali', contact: '0771234567', data: jpeg, mimeType: 'image/jpeg' });
  assert.equal(first.ok, true);
  let c = t.call({ action: 'getCustomers', token: t.staff }).data.find((x) => x.name === 'Nimali');
  assert.equal(c.photoId, first.data.photoId);
  const got = t.call({ action: 'getCustomerPhoto', token: t.staff, photoId: first.data.photoId });
  assert.equal(got.data.data, jpeg);
  assert.equal(got.data.mimeType, 'image/jpeg');
  // Any other Drive file ID is refused, even if it exists.
  assert.equal(t.call({ action: 'getCustomerPhoto', token: t.staff, photoId: 'folder1' }).code, 'NOT_FOUND');

  // Replacing trashes the old file.
  const second = t.call({ action: 'setCustomerPhoto', token: t.owner, name: 'nimali', contact: '0771234567', data: jpeg });
  assert.notEqual(second.data.photoId, first.data.photoId);
  assert.equal(t.ctx.DriveApp.files[first.data.photoId].trashed, true);
  assert.equal(t.call({ action: 'getCustomerPhoto', token: t.staff, photoId: first.data.photoId }).code, 'NOT_FOUND');

  // A customer who came from a sale gets a photo-only row, and is still listed once.
  t.call({ action: 'recordSale', token: t.staff, customerName: 'Sunil', contact: '0712223334', amountPaid: 0, items: [{ itemId: '123', qty: 1 }] });
  const s = t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Sunil', contact: '0712223334', data: jpeg });
  const sunil = t.call({ action: 'getCustomers', token: t.staff }).data.filter((x) => x.name === 'Sunil');
  assert.equal(sunil.length, 1);
  assert.equal(sunil[0].photoId, s.data.photoId);

  assert.equal(t.call({ action: 'removeCustomerPhoto', token: t.staff, name: 'Nimali', contact: '0771234567' }).data.removed, true);
  c = t.call({ action: 'getCustomers', token: t.staff }).data.find((x) => x.name === 'Nimali');
  assert.equal(c.photoId, undefined);
  assert.equal(t.ctx.DriveApp.files[second.data.photoId].trashed, true);
});

test('Customer Directory tab made before photos gets a Photo ID column', () => {
  const t = setup();
  t.S['Customer Directory'] = new (t.S.Customers.constructor)('Customer Directory', [['Customer Name', 'Contact Info', 'Added On', 'Added By'], ['Old', '0770000000', '2026-11-01', 'asanka']]);
  const jpeg = Buffer.from('x').toString('base64');
  assert.equal(t.call({ action: 'setCustomerPhoto', token: t.staff, name: 'Old', contact: '0770000000', data: jpeg }).ok, true);
  assert.equal(t.S['Customer Directory'].get(1, 5), 'Photo ID');
});

test('item photos: shared by name and colour, thumbnails in one call, owner only', () => {
  const t = setup();
  const full = Buffer.from('full-jpeg').toString('base64');
  const thumb = Buffer.from('thumb-jpeg').toString('base64');
  t.call({ action: 'addInventoryItem', token: t.owner, itemId: 'TOP-001-L-BLK', category: 'Tops', name: 'Linen Shirt', size: 'L', color: 'Black', costPrice: 1800, sellingPrice: 3500, initialStock: 3 });

  assert.equal(t.call({ action: 'setItemPhoto', token: t.staff, itemId: 'TOP-001-M-BLK', data: full, thumb }).code, 'FORBIDDEN');
  assert.match(t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'NOPE', data: full, thumb }).error, /not found/);
  assert.match(t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK', data: full }).error, /Thumbnail is required/);
  assert.match(t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK', data: full, thumb: 'A'.repeat(40001) }).error, /Thumbnail is too large/);

  const a = t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK', data: full, thumb });
  assert.equal(a.ok, true);
  // Another size of the same shirt and colour replaces the shared photo; it does not add a row.
  const b = t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'TOP-001-L-BLK', data: full, thumb });
  assert.equal(t.ctx.DriveApp.files[a.data.photoId].trashed, true);
  let list = t.call({ action: 'getItemThumbs', token: t.staff }).data;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].name, list[0].color, list[0].photoId, list[0].thumb], ['Linen Shirt', 'Black', b.data.photoId, thumb]);
  // Thumbnails the app already has are not sent again.
  list = t.call({ action: 'getItemThumbs', token: t.staff, have: [b.data.photoId] }).data;
  assert.equal(list[0].thumb, undefined);

  assert.equal(t.call({ action: 'getItemPhoto', token: t.staff, photoId: b.data.photoId }).data.data, full);
  assert.equal(t.call({ action: 'getItemPhoto', token: t.staff, photoId: a.data.photoId }).code, 'NOT_FOUND');

  assert.equal(t.call({ action: 'removeItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK' }).data.removed, true);
  assert.equal(t.call({ action: 'getItemThumbs', token: t.staff }).data.length, 0);
  assert.equal(t.ctx.DriveApp.files[b.data.photoId].trashed, true);
});

test('snapshotSalePrices: old sales keep their price and cost when the item is repriced', () => {
  const t = setup();
  const before = t.call({ action: 'getDashboard', token: t.owner }).data.allTime;
  // Without the snapshot, repricing an item that has sales is refused.
  assert.equal(t.call({ action: 'getInventory', token: t.owner }).data.salePricesSaved, false);
  assert.equal(t.call({ action: 'updateInventoryItem', token: t.owner, itemId: 'TOP-001-M-BLK', sellingPrice: 9999 }).code, 'NEEDS_SNAPSHOT');
  // An item with no sales can be repriced.
  assert.equal(t.call({ action: 'updateInventoryItem', token: t.owner, itemId: '123', sellingPrice: 350 }).data.sellingPrice, 350);

  const r = t.run('snapshotSalePrices()');
  assert.equal(r.done, true);
  assert.equal(t.ctx.DriveApp.copies.length, 1); // backup made first
  assert.match(t.ctx.DriveApp.copies[0], /BACKUP/);
  assert.equal(t.S.Sales.get(1, 15), 'Unit Cost');
  assert.equal(t.S.Sales.get(2, 8), 3500); // price frozen as a value
  assert.equal(t.S.Sales.get(2, 15), 1800); // cost frozen
  assert.match(t.S['P&L Dashboard'].formulas['8,2'], /SUMPRODUCT\(Sales!G2:G,Sales!O2:O\)/);
  assert.equal(t.run('snapshotSalePrices()').done, false); // idempotent
  assert.equal(t.ctx.DriveApp.copies.length, 1);

  // Reprice and recost: the old sales and the dashboard do not move.
  const up = t.call({ action: 'updateInventoryItem', token: t.owner, itemId: 'TOP-001-M-BLK', sellingPrice: 4000, costPrice: 2000 });
  assert.equal(up.ok, true);
  assert.equal(up.data.sellingPrice, 4000);
  const after = t.call({ action: 'getDashboard', token: t.owner }).data.allTime;
  assert.equal(after.netRevenue, before.netRevenue);
  assert.equal(after.cogs, before.cogs);

  // A new sale uses the new price and cost, written on its own row.
  const sale = t.call({ action: 'recordSale', token: t.staff, customerName: 'Mala', amountPaid: 0, items: [{ itemId: 'TOP-001-M-BLK', qty: 1 }] });
  assert.equal(sale.data.total, 4000);
  const row = sale.data.rows[0].row;
  assert.equal(t.S.Sales.get(row, 15), 2000);
  assert.equal(t.call({ action: 'getDashboard', token: t.owner }).data.allTime.cogs, before.cogs + 2000);
});

test('updateInventoryItem: edits details and stock, keeps ID, owner only, photo follows a rename', () => {
  const t = setup();
  assert.equal(t.call({ action: 'updateInventoryItem', token: t.staff, itemId: '123', name: 'X' }).code, 'FORBIDDEN');
  assert.match(t.call({ action: 'updateInventoryItem', token: t.owner, itemId: 'NOPE', name: 'X' }).error, /not found/);
  assert.match(t.call({ action: 'updateInventoryItem', token: t.owner, itemId: '123', name: '  ' }).error, /name is required/);
  assert.match(t.call({ action: 'updateInventoryItem', token: t.owner, itemId: '123', stock: 1.5 }).error, /whole number/);

  // Name corrections show on old sales too (Item Name on Sales is a lookup).
  const thumb = Buffer.from('t').toString('base64');
  const photo = t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'DRS-001-S-RED', data: thumb, thumb }).data;
  const e = t.call({ action: 'updateInventoryItem', token: t.owner, itemId: 'DRS-001-S-RED', name: 'Floral Midi Dress', color: 'Crimson', stock: 2 });
  assert.equal(e.ok, true);
  assert.equal(e.data.itemId, 'DRS-001-S-RED');
  assert.equal(e.data.name, 'Floral Midi Dress');
  assert.equal(e.data.currentStock, 2); // 1 sold, so initial stock becomes 3
  assert.equal(t.S.Sales.get(3, 5), 'Floral Midi Dress');
  // The only item with the old name and colour moved, so its photo moved with it.
  const thumbs = t.call({ action: 'getItemThumbs', token: t.owner }).data;
  assert.deepEqual(thumbs.map((x) => [x.name, x.color, x.photoId]), [['Floral Midi Dress', 'Crimson', photo.photoId]]);
});

test('updateInventoryItem: renaming one size copies the shared photo, and the file is kept until unused', () => {
  const t = setup();
  t.call({ action: 'addInventoryItem', token: t.owner, itemId: 'TOP-001-L-BLK', category: 'Tops', name: 'Linen Shirt', size: 'L', color: 'Black', costPrice: 1800, sellingPrice: 3500, initialStock: 3 });
  const thumb = Buffer.from('t').toString('base64');
  const photo = t.call({ action: 'setItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK', data: thumb, thumb }).data;
  t.call({ action: 'updateInventoryItem', token: t.owner, itemId: 'TOP-001-L-BLK', color: 'Navy' });
  let thumbs = t.call({ action: 'getItemThumbs', token: t.owner }).data;
  assert.equal(thumbs.length, 2);
  assert.ok(thumbs.every((x) => x.photoId === photo.photoId));
  // Removing the black one's photo must not delete the file the navy one still uses.
  t.call({ action: 'removeItemPhoto', token: t.owner, itemId: 'TOP-001-M-BLK' });
  assert.equal(t.ctx.DriveApp.files[photo.photoId].trashed, false);
  t.call({ action: 'removeItemPhoto', token: t.owner, itemId: 'TOP-001-L-BLK' });
  assert.equal(t.ctx.DriveApp.files[photo.photoId].trashed, true);
});
