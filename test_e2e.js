'use strict';

// End-to-end smoke test: register, upload each sample receipt, verify OCR +
// category. Run with the server already listening: node test_e2e.js [port]
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.argv[2] || process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const SAMPLES = path.join(__dirname, 'samples');

let cookie = '';

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

(async () => {
  const email = `test-${Date.now()}@example.com`;
  const { user } = await call('POST', '/api/register', { email, password: 'test123', name: 'E2E' });
  console.log('registered:', user.email);

  const files = fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.png'));
  let pass = 0;
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(SAMPLES, f)).toString('base64');
    const { receipt } = await call('POST', '/api/receipts', {
      filename: f,
      mime: 'image/png',
      data: b64,
    });
    console.log(
      `${f}\n  merchant: ${receipt.merchant}\n  date: ${receipt.receipt_date}  total: ${receipt.total}  tax: ${receipt.tax}\n  category: ${receipt.category} (keywords: ${(receipt.matched_keywords || []).join(', ')})`
    );
    if (receipt.category && receipt.total > 0) pass++;
  }

  const summary = await call('GET', '/api/summary');
  console.log('\nsummary:', JSON.stringify(summary, null, 2));

  const csvRes = await fetch(BASE + '/api/receipts/export.csv', { headers: { Cookie: cookie } });
  const csv = await csvRes.text();
  console.log('\ncsv rows:', csv.split('\n').length - 1);

  console.log(`\n${pass}/${files.length} receipts parsed with a category+total`);
  const mine = await call('GET', '/api/receipts');
  const others = await fetch(BASE + '/api/receipts').then((r) => r.status);
  console.log('unauthenticated list status (expect 401):', others);
  console.log('my receipts:', mine.receipts.length);
  process.exit(pass === files.length && mine.receipts.length === files.length ? 0 : 1);
})().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
