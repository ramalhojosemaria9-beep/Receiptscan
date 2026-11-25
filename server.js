'use strict';

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const {
  db,
  createUser,
  findUserByEmail,
  verifyPassword,
  createSession,
  getSessionUser,
  deleteSession,
} = require('./db');
const { ocrImage } = require('./ocr');
const { parseReceipt } = require('./parse');
const { categorize, CATEGORIES } = require('./categorize');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const COOKIE = 'receiptscan_session';

app.use(express.json({ limit: '16mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

function currentUser(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((p) => p.trim().split('=').map(decodeURIComponent))
      .filter((p) => p.length === 2)
  );
  return getSessionUser(cookies[COOKIE]);
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

app.post('/api/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const id = createUser({ email, password, name });
  const token = createSession(id);
  setSessionCookie(res, token);
  res.json({ user: { id, email: email.toLowerCase(), name: name || '' } });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email || '');
  if (!user || !verifyPassword(user, password || '')) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

app.post('/api/logout', (req, res) => {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((p) => p.trim().split('=').map(decodeURIComponent))
      .filter((p) => p.length === 2)
  );
  if (cookies[COOKIE]) deleteSession(cookies[COOKIE]);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user });
});

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

app.post('/api/receipts', requireAuth, async (req, res) => {
  const { filename, mime, data } = req.body || {};
  if (!data) return res.status(400).json({ error: 'No file data received' });
  if (!ALLOWED_MIME.includes(mime)) {
    return res.status(400).json({ error: 'Only PNG, JPEG or WebP images are supported' });
  }
  let buffer;
  try {
    const base64 = String(data).replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Could not decode file data' });
  }
  if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File larger than 10 MB' });
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const stored = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buffer);

  const info = db
    .prepare(
      `INSERT INTO receipts (user_id, filename, mime, status) VALUES (?, ?, ?, 'processing')`
    )
    .run(req.user.id, filename || stored, mime);
  const receiptId = info.lastInsertRowid;

  try {
    const { text } = await ocrImage(buffer);
    const parsed = parseReceipt(text);
    const cat = categorize(text, parsed.merchant);

    db.prepare(
      `UPDATE receipts SET
        merchant = ?, receipt_date = ?, total = ?, tax = ?,
        category = ?, currency = ?, items_json = ?, raw_text = ?, status = 'ready'
       WHERE id = ?`
    ).run(
      parsed.merchant,
      parsed.receipt_date,
      parsed.total,
      parsed.tax,
      cat.category,
      parsed.currency,
      JSON.stringify(parsed.items),
      text,
      receiptId
    );
    const receipt = db
      .prepare('SELECT * FROM receipts WHERE id = ?')
      .get(receiptId);
    receipt.items = JSON.parse(receipt.items_json);
    receipt.matched_keywords = cat.matched;
    res.json({ receipt });
  } catch (err) {
    db.prepare(`UPDATE receipts SET status = 'error', raw_text = ? WHERE id = ?`).run(
      String(err && err.message).slice(0, 500),
      receiptId
    );
    res.status(500).json({ error: 'OCR failed for this image', detail: String(err && err.message) });
  }
});

app.get('/api/receipts', requireAuth, (req, res) => {
  const { month, category, q } = req.query;
  let sql = 'SELECT * FROM receipts WHERE user_id = ?';
  const params = [req.user.id];
  if (month) {
    sql += " AND substr(receipt_date, 1, 7) = ?";
    params.push(month);
  }
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (merchant LIKE ? OR raw_text LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY COALESCE(NULLIF(receipt_date, ''), substr(created_at, 1, 10)) DESC, id DESC";
  const receipts = db.prepare(sql).all(...params);
  res.json({ receipts });
});

app.get('/api/receipts/export.csv', requireAuth, (req, res) => {
  const { month } = req.query;
  let sql = 'SELECT * FROM receipts WHERE user_id = ?';
  const params = [req.user.id];
  if (month) {
    sql += ' AND substr(receipt_date, 1, 7) = ?';
    params.push(month);
  }
  sql += ' ORDER BY receipt_date, id';
  const rows = db.prepare(sql).all(...params);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'date,merchant,category,total,tax,currency,items,filename';
  const lines = rows.map((r) =>
    [
      r.receipt_date,
      esc(r.merchant),
      esc(r.category),
      r.total !== null ? r.total.toFixed(2) : '',
      r.tax !== null ? r.tax.toFixed(2) : '',
      r.currency,
      esc(r.items_json),
      esc(r.filename),
    ].join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
  res.send([header, ...lines].join('\n'));
});

app.get('/api/summary', requireAuth, (req, res) => {
  const { month, category } = req.query;
  let where = "WHERE user_id = ? AND status = 'ready'";
  const params = [req.user.id];
  if (month) {
    where += ' AND substr(receipt_date, 1, 7) = ?';
    params.push(month);
  }
  if (category && category !== 'all') {
    where += ' AND category = ?';
    params.push(category);
  }

  const totals = db
    .prepare(
      `SELECT category, COUNT(*) as count, SUM(total) as total
       FROM receipts ${where} GROUP BY category ORDER BY total DESC`
    )
    .all(...params);

  const monthly = db
    .prepare(
      `SELECT substr(receipt_date, 1, 7) as month, SUM(total) as total, COUNT(*) as count
       FROM receipts WHERE user_id = ? AND status = 'ready' AND receipt_date != ''
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all(req.user.id);

  const grand = totals.reduce((s, t) => s + (t.total || 0), 0);
  const count = totals.reduce((s, t) => s + t.count, 0);
  res.json({ grand_total: grand, count, by_category: totals, monthly });
});

app.get('/api/receipts/:id/image', requireAuth, (req, res) => {
  const r = db
    .prepare('SELECT * FROM receipts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const p = path.join(UPLOAD_DIR, path.basename(r.filename));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', r.mime);
  fs.createReadStream(p).pipe(res);
});

app.patch('/api/receipts/:id', requireAuth, (req, res) => {
  const r = db
    .prepare('SELECT * FROM receipts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const { merchant, receipt_date, total, category, notes, tax } = req.body || {};
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Unknown category' });
  }
  db.prepare(
    `UPDATE receipts SET
      merchant = COALESCE(?, merchant),
      receipt_date = COALESCE(?, receipt_date),
      total = COALESCE(?, total),
      tax = COALESCE(?, tax),
      category = COALESCE(?, category),
      notes = COALESCE(?, notes)
     WHERE id = ?`
  ).run(
    merchant !== undefined ? merchant : null,
    receipt_date !== undefined ? receipt_date : null,
    typeof total === 'number' ? total : null,
    typeof tax === 'number' ? tax : null,
    category !== undefined ? category : null,
    notes !== undefined ? notes : null,
    r.id
  );
  const updated = db.prepare('SELECT * FROM receipts WHERE id = ?').get(r.id);
  res.json({ receipt: updated });
});

app.delete('/api/receipts/:id', requireAuth, (req, res) => {
  const r = db
    .prepare('SELECT id FROM receipts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM receipts WHERE id = ?').run(r.id);
  res.json({ ok: true });
});

app.get('/api/raw-text/:id', requireAuth, (req, res) => {
  const r = db
    .prepare('SELECT raw_text FROM receipts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ raw_text: r.raw_text });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`ReceiptScan running at http://localhost:${PORT}`);
});
