# Calico — API + mobile app for the Calico inventory sheet

```
calico-mobile/        React Native app (Expo, TypeScript), the repo root
└── backend/
    ├── apps-script/  The API. Paste into the sheet's Apps Script editor.
    │   ├── Code.gs
    │   └── appsscript.json
    └── test/         Tests for the API logic (node --test test/api.test.js)
```

The Google Sheet stays the database. The API reads and writes the same tabs you already use, so the
sheet, its formulas and the dashboard keep working, and anything entered in the app appears in the sheet.

---

## Part 1: Set up the API (about 10 minutes)

1. Open the **Calico inventory** sheet, then go to **Extensions > Apps Script**.
2. Delete everything in `Code.gs` and paste in the contents of `apps-script/Code.gs`. Click **Save**.
3. Click **Project Settings** (the gear icon) and tick **Show "appsscript.json" manifest file in editor**.
   Go back to **Editor**, open `appsscript.json`, replace its contents with `apps-script/appsscript.json`, and click **Save**.
4. Reload the spreadsheet tab. A **Calico App** menu appears after a few seconds.
5. Go to **Calico App > Add or reset a user**. Google asks you to authorise the script the first time; allow it.
   Create your own account with role `owner`, then one account per staff member with role `staff`.
   This creates a **Users** tab. PINs are stored as salted hashes, not as the PINs themselves.
6. In Apps Script, click **Deploy > New deployment**, select type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Then click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
7. Paste that URL into a browser. You should see `{"ok":true,"data":{"service":"calico-api",...}}`.

**After you change the code:** go to **Deploy > Manage deployments**, click the pencil icon, choose
**Version: New version**, and click **Deploy**. The URL stays the same. If you use "New deployment" instead,
you get a new URL and the app has to be pointed at it.

**About "Anyone" access:** this only means the URL can be reached without a Google account. Every action
except `ping` needs a login token. The sheet itself stays private to you. After 5 wrong PINs a username is
locked for 15 minutes.

### Managing users (from the sheet menu)

Roles: **admin** can do everything an owner can but is not a partner (no profit share or balance); **owner** is a partner and can do everything; **staff** can sell, take payments and view stock and customers.

| Menu item | What it does |
|---|---|
| Add or reset a user | Create a user, or set a new PIN or role (`admin`, `owner` or `staff`) for an existing one |
| Disable a user | Blocks the user. They are signed out on their next request |
| Sign out all devices | Ends every session (for example, if a phone is lost) |

---

## Part 2: Run the mobile app

You need Node.js 20 or newer on your Mac, and the **Expo Go** app on your phone (App Store or Play Store).

```bash
npm install        # from the repo root
cp .env.example .env        # then paste your /exec URL into .env
npx expo start
```

Scan the QR code with your phone's camera (iPhone) or with Expo Go (Android).
You can also leave `.env` empty and enter the URL on the login screen under **Server**.

### Screens

| Tab | Owner | Staff |
|---|---|---|
| **Sell** | Multi-item sale, discount per line, paid in full / part / nothing, new or existing customer | Same |
| **Stock** | Search, low/out-of-stock filters, cost prices, **+ Add** item, tap an item to restock | View only, no cost prices |
| **Customers** | Total owed, customer list, **+** add a customer before their first sale, purchase history, record a payment | Same |
| **Expenses** | List and add expenses | Not shown |
| **Reports** | Profit and loss by month or all time. **Owners & cash**: partner balances, money taken / put in, cash estimate. **Opening balances** setup | Not shown |

### Starting when the business was already trading (opening balances)

Do this once, on the day you start recording everything in the app (the go-live day):

1. Add each partner as an **owner** user (sheet menu → Add or reset a user).
2. In the app: Reports → **Set opening balances**.
   - **Stock**: enter the counted quantity of every item. Old sales rows are kept (Initial Stock becomes count + units already sold).
   - **Cash**: business cash on the go-live day.
   - **Partners**: total each partner put in and took out so far, and their profit share (default equal).
   - **Check**: the app works out *profit before the app* = cash + stock at cost + owed by customers − (put in − taken out), and each partner's starting balance.
3. From then on, record every time an owner takes money in **Owners & cash → Money taken**. Never record it as an expense: it lowers that partner's balance, not the profit.

Partner balance = put in − taken out + share of (profit before the app + profit since go-live).
Everything is stored on the **Owner Ledger** tab (created automatically). The cash figure is an estimate because restocks don't record what the stock cost yet.

### Building installable apps

**Sending an Android build to testers:** from the repo root, run `scripts/deploy-android.sh` and answer the
questions. It builds a release APK, uploads it to Firebase App Distribution and notifies every tester.
See [DEPLOYING.md](../DEPLOYING.md) for setup and options.

To build in the cloud with EAS instead:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # gives an .apk you can install directly
eas build --platform ios                          # needs an Apple Developer account
```

Set `EXPO_PUBLIC_API_URL` in `eas.json` (under `build.<profile>.env`) or as an EAS environment variable, so release builds have the URL.

---

## API reference

Send every request as `POST <web app URL>` with header `Content-Type: text/plain` and a JSON body
`{ "action": "...", "token": "...", ...params }`. The response is `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": "message", "code": "UNAUTHORIZED | FORBIDDEN | NO_STOCK | BAD_REQUEST | BUSY | ..." }`.

| Action | Role | Params | Returns |
|---|---|---|---|
| `ping` | public | none | service info |
| `login` | public | `username`, `pin` | `{ token, user }` (token lasts 30 days) |
| `logout` / `me` / `getMeta` | any | none | session / user / categories and settings |
| `getInventory` | any | none | items (`costPrice` only for owner) |
| `addInventoryItem` | owner | `itemId, category, name, size, color, costPrice, sellingPrice, initialStock` | new item |
| `updateInventoryItem` | owner | `itemId, category?, name?, size?, color?, costPrice?, sellingPrice?, stock?` | updated item (ID cannot change; `stock` is the count on hand) |
| `restockItem` | owner | `itemId, qty` | updated item |
| `recordSale` | any | `customerName, contact, amountPaid, date?, items:[{itemId, qty, discount?}]` | written rows and totals |
| `getRecentSales` | any | `limit?` | sales, newest first |
| `getCustomers` | any | none | customers with balances |
| `addCustomer` | any | `name, contact?` | the new customer (kept on the **Customer Directory** tab until their first sale) |
| `setCustomerPhoto` / `removeCustomerPhoto` | any | `name, contact, data` (base64 JPEG) / `name, contact` | `{ photoId }` / `{ removed }` |
| `getCustomerPhoto` | any | `photoId` | `{ mimeType, data }` (base64) |
| `getItemThumbs` | any | `have?` (photo IDs the app already holds) | `[{ name, color, photoId, thumb? }]` |
| `getItemPhoto` | any | `photoId` | `{ mimeType, data }` (base64) |
| `setItemPhoto` / `removeItemPhoto` | owner | `itemId, data, thumb` / `itemId` | the saved photo / `{ removed }` |
| `getCustomerSales` | any | `customerName, contact` | that customer's sales |
| `recordPayment` | any | `customerName, contact, amount` | how the payment was spread across their unpaid sales |
| `getDashboard` | owner | `month?` (`YYYY-MM`) | all-time and selected-month P&L |
| `getExpenses` / `addExpense` | owner | `date?, category, description, amount, method` | expenses |
| `setStockCounts` | owner | `counts: [{itemId, qty}]` | sets current stock to the counted quantity |
| `saveOpeningBalances` | owner | `date, cash, owners: [{username, capital, drawings}], profitShare?, preview?, overwrite?` | the go-live snapshot (once; `preview` writes nothing) |
| `addOwnerTransaction` | owner | `date?, owner, type` (`Capital in` / `Drawing`)`, amount, method?, note?` | the saved entry |
| `getOwnerTransactions` | owner | `owner?, limit?` | capital and drawing entries, newest first |
| `getOwnerSummary` | owner | none | opening snapshot, partner balances, profit since go-live, cash estimate |

How sales and payments are recorded:
- A sale with several items writes one Sales row per item. The amount paid is applied to the lines in order.
- A sale is rejected if it would take stock below zero, or if a discount or payment is more than the total.
- A later payment clears the customer's **oldest** unpaid sales first.
- Writes use a lock, so two phones saving at the same moment won't overwrite each other.

---

## Things that will break the API

- **Renaming tabs or column headers.** The API finds columns by their header text (`Sales`, `Item ID`,
  `Amount Paid`, and so on). Moving columns is fine; renaming headers is not.
- **Deleting row 2** on Inventory or Sales. That row holds the formulas for the whole column.
- **Changing the P&L Dashboard layout.** The API reads labels from A3:A14, values from B:C, and the period from F3:F4.
- **Using "Reports" in the app.** Picking a month in Reports changes the start date in `P&L Dashboard!F3`. This is expected.

Limits: each request takes about 1–3 seconds, because Apps Script reads the sheet every time.
This is fine for a shop with a few phones. If you later have many staff or thousands of rows a day,
move the same API to Laravel with a real database. The mobile app only needs its base URL changed.

## Tests

```bash
cd backend
node --test test/api.test.js
```

The tests run `Code.gs` against an in-memory copy of the sheet, which recalculates the formula
columns the same way the real sheet does. They cover login and lockout, roles, multi-item sales,
blocking overselling and overpaying, oldest-first payments, stock, expenses and the dashboard.

## Deploying the script with clasp

The live sheet's script is linked in `backend/apps-script/.clasp.json`. After `npm i -g @google/clasp` and `clasp login` (the Apps Script API must be on at script.google.com/home/usersettings):

```bash
cd backend/apps-script
clasp push --force
clasp deploy -i AKfycbxtPdrhCunnKszX2VaNmA6nCb85KZuNe8sktUdLvgb7D8HjltAMWmwUiUxZMtYuHTIm -d "what changed"
```

Always redeploy that deployment ID. It is the `/exec` URL the app uses; a new deployment gets a new URL.

**New Google permissions:** the web app runs as the owner, so when the code starts using a new Google
service (customer photos use Drive), the owner must grant it once before redeploying: open the script
editor, choose `authorizeDrive` in the function list, click **Run** and allow access. Redeploying first
would make every request fail until that is done.

### Customer photos

Photos are taken or chosen in the app, cropped square and shrunk to 400 px before upload. They are
saved in a private Drive folder, **Calico customer photos**, owned by the script owner and never shared
by link. The **Photo ID** column on the **Customer Directory** tab points at each file, and the app
reads photos back through `getCustomerPhoto`, which only serves files that column lists.

### Sale prices are saved per sale

Run `snapshotSalePrices` once from the script editor (after deploying). It makes a backup copy of the
spreadsheet, then turns the Sales tab's **Unit Selling Price** column from a lookup into plain values,
adds a **Unit Cost** column, and points the dashboard's COGS at it. After that every sale keeps the
price and cost it was sold at, so editing an item's prices in the app never changes old sales,
customer balances or past profit. Until it has run, the app locks price edits on items that have sales.

### Product photos

One photo per item name and colour, shared by every size. The app crops to 4:5 and saves two
JPEGs: a full image (longest side 1000 px, quality 0.82, stepped down to no lower than 0.55 if it is
over ~220 KB) stored in the same private Drive folder, and a thumbnail (200 px, ~15 KB at most) kept
as text on the **Item Photos** tab so the whole stock list loads its pictures in one request.
