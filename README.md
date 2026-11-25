# ReceiptScan

A receipt-scanning expense tracker demo: upload receipt photos, OCR extracts the
merchant, date, line items, tax and total, and the expense is auto-categorized
for your books. Includes multi-user accounts and an expense dashboard with CSV
export.

## Features

- **Receipt scanning + OCR** — upload PNG/JPEG/WebP receipt photos; Tesseract
  (via `tesseract.js`, WebAssembly, no system dependencies) extracts text.
- **Data extraction** — merchant, date (several formats), tax, line items and
  grand total; a cents heuristic recovers totals where OCR drops the decimal
  point.
- **Auto-categorization** — keyword rules over merchant + full text assign each
  receipt to one of:
  - Diesel
  - Construction materials
  - Machinery and repairs
  - Travel
  - Food and groceries
  plus *Uncategorized* as the fallback. Categories are editable per receipt.
- **Multi-user accounts** — register/sign-in with scrypt-hashed passwords and
  HTTP-only session cookies; all data is scoped per user.
- **Dashboard & reports** — spend by category bars, monthly trend chart, month
  and category filters, full-text search, and CSV export.

## Run it

```bash
npm install
npm run seed        # creates the demo account
npm start           # http://localhost:3000
```

Demo account: `demo@receiptscan.app` / `demo123`

Then open **Upload** in the app and drop the images from `samples/` to see the
full pipeline.

## API overview

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/register`, `/api/login`, `/api/logout` | Account + session management |
| GET | `/api/me`, `/api/categories` | Current user, category list |
| POST | `/api/receipts` | Upload a receipt (`{filename, mime, data}` base64) |
| GET | `/api/receipts` | List receipts (`?month=YYYY-MM&category=&q=`) |
| PATCH | `/api/receipts/:id` | Correct merchant/date/total/tax/category |
| DELETE | `/api/receipts/:id` | Delete a receipt |
| GET | `/api/summary` | Totals by category + monthly trend |
| GET | `/api/receipts/export.csv` | CSV export |
| GET | `/api/receipts/:id/image`, `/api/raw-text/:id` | Original image, raw OCR text |

## Sample data

`make_samples.py` (Python + Pillow) regenerates the demo receipt images in
`samples/`:

```bash
pip install pillow
npm run samples
```

## Configuration

Environment variables: `PORT` (default 3000), `DATA_DIR` (SQLite database,
default `./data`), `UPLOAD_DIR` (receipt images, default `./uploads`).

## Test

With the server running on port 3000:

```bash
node test_e2e.js 3000
```

Registers a throwaway user, uploads every sample receipt, and verifies OCR
extraction, categorization, the summary endpoint, CSV export and auth scoping.
