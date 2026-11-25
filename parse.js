'use strict';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const AMOUNT_RE = /(?:[$£€]\s*)?(-?\d{1,3}(?:[,. ]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})\s*(?:[$£€]|usd|gbp|eur)?\s*$/i;
const CURRENCY_RE = /(?:[$£€]|usd|gbp|eur)/i;
const TOTAL_LABELS = [
  'grand total', 'total due', 'amount due', 'balance due', 'invoice total',
  'total payable', 'purchase total', 'total amount', 'sale total',
  'cash total', 'total *', 'total:', 'total ', 'totel', 'tota1', 'total',
  'entregue', 'a pagar', 'valor pago', 'pago ', 'eur ', 'amount paid',
];
const SUBTOTAL_RE = /sub\s*-?\s*total/i;
// Pre-tax base lines that contain "total" but are not the amount payable.
const BASE_TOTAL_RE = /(incid|base tribut|tribut\.|assinatura|\biva\b|vat agg)/i;
const TAX_RE = /\b(tax|vat|gst|hst|sales tax)\b/i;
const ITEM_LINE_RE = /^[^:]*?\d{1,3}(?:[,. ]\d{3})*[.,]\d{2}\s*(?:[$£€])?\s*$|^[^:]*?[$£€]\s*\d/;
const SKIP_RE = /(subtotal|sub total|balance|amount due|total due|change|cash|card|visa|mastercard|debit|credit|declined|approved|auth|thank|receipt|customer|account|tel:|phone|www\.|com\b|invoice|date|time|cashier|register|store|tax rate|vat red|vat std|quantity|qty|preç|preco|preço|unidade|\/uni|atcud|nif|fatura|incid|ncias|encias|entregue|pagar|troco)/i;

function parseAmount(token) {
  if (!token) return null;
  let s = String(token).replace(/[^0-9,.\- ]/g, '').trim();
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > lastComma) {
    s = s.replace(/[ ,]/g, '');
  } else {
    s = s.replace(/[ .]/g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function amountsOnLine(line) {
  const out = [];
  const re = /(?:[$£€]\s*)?(\d{1,3}(?:[,. ]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const v = parseAmount(m[1]);
    if (v !== null && v < 1000000) out.push(v);
  }
  return out;
}

function parseDate(text) {
  const t = String(text);
  let m;
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    let [, a, b, y] = m;
    let day = Number(a);
    let month = Number(b);
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    if (month > 12 || day > 31 || day === 0) return null;
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
    if (year < 2000 || year > 2100) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\.?\s+(\d{2,4})\b/i);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const month = MONTHS[m[2].toLowerCase()];
    return `${year}-${String(month).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\.?\s+(\d{1,2})\s*,?\s*(\d{2,4})\b/i);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const month = MONTHS[m[1].toLowerCase()];
    return `${year}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  return null;
}

function parseMerchant(lines, rawText) {
  const noise = /^(receipt|invoice|tax invoice|sales receipt|order|customer copy|welcome|thank|www\.|tel|phone|store #|vat reg|ebay|amazon pay)/i;
  for (const line of lines.slice(0, 6)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (noise.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (datesLine(trimmed)) continue;
    if (trimmed.length >= 2 && /[a-z]/i.test(trimmed)) {
      return trimmed
        .replace(/^(receipt|invoice)\s*[:#]?\s*/i, '')
        .replace(/[|_*]{2,}/g, '')
        .trim();
    }
  }
  const fallback = rawText.split('\n').find((l) => /[a-z]/i.test(l || ''));
  return (fallback || '').trim().slice(0, 60);
}

function datesLine(s) {
  return /\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(s);
}

// OCR often drops the decimal point on receipt totals ("28.03" -> "2803").
// On labelled money lines, treat a bare integer >= 100 as whole+cents.
function labelledCentsAmount(line) {
  const cleaned = String(line).replace(/[.,]\d{2}\b/g, '');
  const m = cleaned.match(/(?:[$£€]\s*)?(\d{3,5})\s*$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v < 100 || v >= 100000) return null;
  return Math.round(v) / 100;
}

function parseTotal(lines, rawText) {
  const candidates = [];
  // Returns {value, priority}; priority >= 3 means a confident "amount due" line.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isTaxLine = TAX_RE.test(trimmed) && !/total/i.test(trimmed);
    const labelHit = TOTAL_LABELS.find((lbl) => trimmed.toLowerCase().includes(lbl));
    const amounts = amountsOnLine(trimmed);
    if (amounts.length === 0 && !labelHit) continue;
    if (SUBTOTAL_RE.test(trimmed) || isTaxLine) {
      const value = amounts.length ? amounts[amounts.length - 1] : labelledCentsAmount(trimmed);
      if (value !== null) candidates.push({ value, priority: 1 });
      continue;
    }
    if (labelHit) {
      const value = amounts.length ? amounts[amounts.length - 1] : labelledCentsAmount(trimmed);
      // "Total incidências / base" lines are pre-tax bases, not the amount due.
      const priority = BASE_TOTAL_RE.test(trimmed) ? 1 : 4;
      if (value !== null) candidates.push({ value, priority });
      continue;
    }
    if (/^total/i.test(trimmed) && amounts.length) {
      const priority = BASE_TOTAL_RE.test(trimmed) ? 1 : 3;
      candidates.push({ value: amounts[amounts.length - 1], priority });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.priority - a.priority || b.value - a.value);
    return candidates[0];
  }
  const all = [];
  for (const line of lines) {
    for (const v of amountsOnLine(line)) all.push(v);
  }
  if (all.length) return { value: Math.max(...all), priority: 0 };
  return { value: 0, priority: 0 };
}

function parseTax(lines) {
  for (const line of lines) {
    if (TAX_RE.test(line) && /total/i.test(line) === false && !SUBTOTAL_RE.test(line)) {
      const amounts = amountsOnLine(line);
      if (amounts.length) return amounts[amounts.length - 1];
    }
  }
  return 0;
}

function parseItems(lines, total) {
  const items = [];
  let inTotals = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/total|subtotal|amount due|balance/i.test(trimmed)) {
      inTotals = true;
      continue;
    }
    if (inTotals) continue;
    if (SKIP_RE.test(trimmed) || datesLine(trimmed)) continue;
    const amounts = amountsOnLine(trimmed);
    if (amounts.length === 0) continue;
    const name = trimmed
      .replace(/(?:[$£€])?\s*\d{1,3}(?:[,. ]\d{3})*[.,]\d{2}\s*(?:[$£€])?\s*$/g, '')
      .replace(/\s{2,}\d.*$/, '')
      .replace(/[*x\d.]+\s*$/, '')
      .replace(/[@#]/g, '')
      .trim();
    if (name.length < 2 || name.length > 48) continue;
    if (/^[0-9\s.,-]+$/.test(name)) continue;
    const value = amounts[amounts.length - 1];
    items.push({ name: name.slice(0, 48), amount: value });
  }
  const plausible = total > 0 ? items.filter((i) => i.amount <= total * 1.01) : items;
  return (plausible.length ? plausible : items).slice(0, 12);
}

function parseReceipt(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const currencyMatch = text.match(/(?:[$£€])|(?:\b(usd|gbp|eur)\b)/i);
  const currencySymbol = currencyMatch ? currencyMatch[0].toUpperCase().replace('USD', '$').replace('GBP', '£').replace('EUR', '€') : '$';

  const totalInfo = parseTotal(lines, text);
  let total = totalInfo.value;
  const tax = parseTax(lines);
  const items = parseItems(lines, total);

  // When OCR only found a pre-tax base (priority <= 1), the sum of line items
  // (VAT-inclusive) is a better estimate of the amount due.
  const round2 = (n) => Math.round(n * 100) / 100;
  const itemsSum = round2(items.reduce((s, i) => s + i.amount, 0));
  if (totalInfo.priority < 3 && itemsSum > 0 && Math.abs(itemsSum - total) > 0.01) {
    total = itemsSum;
  }

  return {
    merchant: parseMerchant(lines, text),
    receipt_date: parseDate(text) || '',
    total,
    tax,
    currency: currencySymbol && currencySymbol.length <= 3 ? currencySymbol : '$',
    items,
  };
}

module.exports = { parseReceipt, parseAmount, amountsOnLine };
