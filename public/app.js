'use strict';

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const money = (n, cur = '$') =>
  (n === null || n === undefined) ? '—' : `${cur}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let CATEGORIES = ['Diesel', 'Construction materials', 'Machinery and repairs', 'Travel', 'Food and groceries', 'Uncategorized'];
let currentUser = null;
let receipts = [];
let currentReceiptId = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- auth ---------- */
let registerMode = false;

function showAuthError(msg) {
  const el = $('#auth-error');
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

$('#tab-login').addEventListener('click', () => setAuthMode(false));
$('#tab-register').addEventListener('click', () => setAuthMode(true));

function setAuthMode(register) {
  registerMode = register;
  $('#tab-login').classList.toggle('active', !register);
  $('#tab-register').classList.toggle('active', register);
  $('#name-row').classList.toggle('hidden', !register);
  $('#auth-submit').textContent = register ? 'Create account' : 'Sign in';
  showAuthError(null);
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthError(null);
  try {
    if (registerMode) {
      await api('/api/register', {
        method: 'POST',
        body: { name: $('#f-name').value, email: $('#f-email').value, password: $('#f-password').value },
      });
    } else {
      await api('/api/login', {
        method: 'POST',
        body: { email: $('#f-email').value, password: $('#f-password').value },
      });
    }
    await boot();
  } catch (err) {
    showAuthError(err.message);
  }
});

$('#btn-logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  $('#view-dashboard').classList.add('hidden');
  $('#view-upload').classList.add('hidden');
  $('#topnav').classList.add('hidden');
  $('#view-auth').classList.remove('hidden');
});

/* ---------- navigation ---------- */
document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(name) {
  $('#view-auth').classList.add('hidden');
  $('#view-dashboard').classList.toggle('hidden', name !== 'dashboard');
  $('#view-upload').classList.toggle('hidden', name !== 'upload');
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name)
  );
  if (name === 'dashboard') loadDashboard();
}

/* ---------- dashboard ---------- */
const CAT_COLORS = {
  'Diesel': '#f59e0b',
  'Construction materials': '#78716c',
  'Machinery and repairs': '#3b82f6',
  'Travel': '#22c55e',
  'Food and groceries': '#ec4899',
  'Uncategorized': '#94a3b8',
};

async function loadDashboard() {
  const month = $('#dash-month').value;
  const category = $('#dash-category').value;
  try {
    const [summary, list] = await Promise.all([
      api(`/api/summary?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`),
      api(`/api/receipts?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}&q=${encodeURIComponent($('#search').value || '')}`),
    ]);
    receipts = list.receipts;
    renderStats(summary);
    renderCategoryBars(summary);
    renderMonthChart(summary.monthly);
    renderTable(receipts);
    $('#btn-export').href = `/api/receipts/export.csv?month=${encodeURIComponent(month)}`;
    populateMonthOptions(summary.monthly);
  } catch (err) {
    if (err.message.includes('401') || /Not signed in/.test(err.message)) return forceAuth();
    toast(err.message);
  }
}

function populateMonthOptions(monthly) {
  const sel = $('#dash-month');
  const current = sel.value;
  const months = new Set(monthly.map((m) => m.month).filter(Boolean));
  const sorted = [...months].sort().reverse();
  sel.innerHTML = '<option value="">All months</option>' +
    sorted.map((m) => `<option value="${m}">${m}</option>`).join('');
  if (sorted.includes(current)) sel.value = current;
}

function renderStats(summary) {
  const cur = receipts[0]?.currency || '$';
  const byCat = summary.by_category || [];
  const top = byCat[0];
  $('#stat-row').innerHTML = `
    <div class="stat"><div class="label">Total spend</div><div class="value">${money(summary.grand_total, cur)}</div></div>
    <div class="stat"><div class="label">Receipts</div><div class="value">${summary.count}</div></div>
    <div class="stat"><div class="label">Top category</div><div class="value" style="font-size:17px">${top ? top.category : '—'}</div></div>
    <div class="stat"><div class="label">Categories used</div><div class="value">${byCat.filter((c) => c.category !== 'Uncategorized').length}</div></div>`;
}

function renderCategoryBars(summary) {
  const cur = receipts[0]?.currency || '$';
  const rows = summary.by_category || [];
  const max = Math.max(...rows.map((r) => r.total || 0), 1);
  $('#cat-bars').innerHTML = rows.length === 0
    ? '<p class="empty">No data for this filter yet.</p>'
    : rows.map((r) => `
      <div class="catbar">
        <div class="cat-head"><span>${r.category} <span class="hint">(${r.count})</span></span>
        <span class="amt">${money(r.total, cur)}</span></div>
        <div class="track"><div class="fill" style="width:${(100 * (r.total || 0)) / max}%;background:${CAT_COLORS[r.category] || '#94a3b8'}"></div></div>
      </div>`).join('');
}

function renderMonthChart(monthly) {
  const cur = receipts[0]?.currency || '$';
  const rows = [...(monthly || [])].reverse();
  const max = Math.max(...rows.map((r) => r.total || 0), 1);
  $('#month-chart').innerHTML = rows.length === 0
    ? '<p class="empty">No dated receipts yet.</p>'
    : `<div class="mchart">${rows.map((m) => `
        <div class="bar-col" title="${m.month}: ${money(m.total, cur)}">
          <div class="bar-value">${money(m.total, cur)}</div>
          <div class="bar" style="height:${Math.max(2, (100 * (m.total || 0)) / max)}%"></div>
          <div class="bar-label">${m.month?.slice(2) || ''}</div>
        </div>`).join('')}</div>`;
}

function renderTable(rows) {
  $('#empty-state').classList.toggle('hidden', rows.length > 0);
  $('#receipt-rows').innerHTML = rows
    .map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td><img class="thumb" src="/api/receipts/${r.id}/image" loading="lazy" alt="" /></td>
        <td>${r.receipt_date || '—'}</td>
        <td>${escapeHtml(r.merchant || 'Unknown merchant')}</td>
        <td><span class="badge" data-v="${r.category}">${r.category}</span></td>
        <td class="num">${money(r.total, r.currency)}</td>
        <td>✏️</td>
      </tr>`)
    .join('');
  document.querySelectorAll('#receipt-rows tr').forEach((tr) =>
    tr.addEventListener('click', () => openReceipt(Number(tr.dataset.id)))
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#dash-month').addEventListener('change', loadDashboard);
$('#dash-category').addEventListener('change', loadDashboard);
let searchTimer;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadDashboard, 300);
});

/* ---------- upload ---------- */
const dropzone = $('#dropzone');
const fileInput = $('#file-input');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type));
  if (files.length === 0) return toast('Please use PNG, JPEG or WebP images');

  const box = $('#upload-progress');
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'upl-item';
    const url = URL.createObjectURL(file);
    row.innerHTML = `
      <img class="upl-thumb" src="${url}" />
      <div class="upl-info">
        <div class="upl-name">${escapeHtml(file.name)}</div>
        <div class="upl-sub">${(file.size / 1024).toFixed(0)} kB · uploading…</div>
      </div>
      <div class="upl-status">⏳</div>`;
    box.prepend(row);
    const statusEl = row.querySelector('.upl-status');
    const subEl = row.querySelector('.upl-sub');

    try {
      const b64 = await fileToBase64(file);
      subEl.textContent = `${(file.size / 1024).toFixed(0)} kB · reading text…`;
      const { receipt } = await api('/api/receipts', {
        method: 'POST',
        body: { filename: file.name, mime: file.type, data: b64 },
      });
      statusEl.textContent = '✅';
      statusEl.classList.add('ok');
      subEl.innerHTML = `${(file.size / 1024).toFixed(0)} kB → <b>${escapeHtml(receipt.merchant || '?')}</b> · ${money(receipt.total, receipt.currency)} · <span class="badge" data-v="${receipt.category}">${receipt.category}</span>`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => { switchView('dashboard'); setTimeout(() => openReceipt(receipt.id), 200); });
    } catch (err) {
      statusEl.textContent = '⚠️';
      statusEl.classList.add('err');
      subEl.textContent = err.message;
    }
  }
  if (!box.querySelector('.upl-item .upl-status.ok')) return;
  toast('Receipts processed — review them on the dashboard');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- receipt modal ---------- */
function fillCategorySelect(sel, selected) {
  sel.innerHTML = CATEGORIES.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

async function openReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;
  currentReceiptId = id;
  $('#modal-title').textContent = r.merchant || 'Receipt';
  $('#modal-image').src = `/api/receipts/${id}/image`;
  $('#e-merchant').value = r.merchant || '';
  $('#e-date').value = r.receipt_date || '';
  $('#e-total').value = r.total ?? '';
  $('#e-tax').value = r.tax ?? '';
  fillCategorySelect($('#e-category'), r.category);
  $('#edit-error').classList.add('hidden');
  $('#e-items').innerHTML = (r.items || []).length
    ? r.items.map((i) => `<li>${escapeHtml(i.name)} — ${money(i.amount, r.currency)}</li>`).join('')
    : '<li class="hint">No line items detected</li>';
  try {
    const { raw_text } = await api(`/api/raw-text/${id}`);
    $('#modal-raw').textContent = raw_text || '(no text)';
  } catch { $('#modal-raw').textContent = '(unavailable)'; }
  $('#modal').classList.remove('hidden');
}

$('#modal-close').addEventListener('click', () => $('#modal').classList.add('hidden'));
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) $('#modal').classList.add('hidden'); });

$('#btn-save').addEventListener('click', async () => {
  try {
    await api(`/api/receipts/${currentReceiptId}`, {
      method: 'PATCH',
      body: {
        merchant: $('#e-merchant').value,
        receipt_date: $('#e-date').value,
        total: $('#e-total').value === '' ? null : Number($('#e-total').value),
        tax: $('#e-tax').value === '' ? null : Number($('#e-tax').value),
        category: $('#e-category').value,
      },
    });
    $('#modal').classList.add('hidden');
    toast('Receipt saved');
    loadDashboard();
  } catch (err) {
    const el = $('#edit-error');
    el.textContent = err.message;
    el.classList.remove('hidden');
  }
});

$('#btn-delete').addEventListener('click', async () => {
  if (!confirm('Delete this receipt?')) return;
  try {
    await api(`/api/receipts/${currentReceiptId}`, { method: 'DELETE' });
    $('#modal').classList.add('hidden');
    toast('Receipt deleted');
    loadDashboard();
  } catch (err) {
    toast(err.message);
  }
});

/* ---------- boot ---------- */
async function boot() {
  try {
    const { user } = await api('/api/me');
    currentUser = user;
    $('#user-badge').textContent = user.email;
    $('#view-auth').classList.add('hidden');
    $('#topnav').classList.remove('hidden');
    switchView('dashboard');
  } catch {
    $('#view-auth').classList.remove('hidden');
  }
}

(async () => {
  try {
    const { categories } = await api('/api/categories');
    CATEGORIES = categories;
  } catch { /* fall back to defaults */ }
  $('#dash-category').innerHTML =
    '<option value="all">All categories</option>' +
    CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  await boot();
})();
