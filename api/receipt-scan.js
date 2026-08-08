const ALLOWED_CATEGORIES = [
  'Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan & Subscription',
  'Hiburan', 'Kesehatan', 'Pendidikan', 'Keluarga', 'Bisnis',
  'Tabungan & Investasi', 'Lainnya'
];

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.round(Number(value || 0));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value, max = 120) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const min = new Date('2000-01-01T00:00:00Z');
  const max = new Date(); max.setUTCDate(max.getUTCDate() + 1);
  return d >= min && d <= max ? value : '';
}

function validTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const h = Number(match[1]), m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDataUrl(imageData) {
  const match = String(imageData || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
  const mimeType = match[1].toLowerCase();
  const data = match[2];
  const approxBytes = Math.floor(data.length * 0.75);
  if (approxBytes > 900 * 1024) throw new Error('Foto masih terlalu besar setelah kompresi. Coba foto ulang lebih dekat.');
  return { mimeType, data };
}

function sanitizeResult(raw) {
  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.map(x => cleanText(x, 160)).filter(Boolean).slice(0, 5)
    : [];
  const items = Array.isArray(raw?.items)
    ? raw.items.slice(0, 20).map(item => ({
        name: cleanText(item?.name, 90),
        qty: Math.max(0, Number(item?.qty || 0)),
        total: clampInt(item?.total, 0, 1_000_000_000_000)
      })).filter(item => item.name)
    : [];
  const category = ALLOWED_CATEGORIES.includes(raw?.suggestedCategory) ? raw.suggestedCategory : 'Lainnya';
  const confidence = {
    merchant: clampInt(raw?.confidence?.merchant, 0, 100),
    total: clampInt(raw?.confidence?.total, 0, 100),
    date: clampInt(raw?.confidence?.date, 0, 100),
    category: clampInt(raw?.confidence?.category, 0, 100),
    overall: clampInt(raw?.confidence?.overall, 0, 100)
  };
  const result = {
    merchant: cleanText(raw?.merchant, 100),
    date: validDate(raw?.date),
    time: validTime(raw?.time),
    subtotal: clampInt(raw?.subtotal, 0, 1_000_000_000_000),
    discount: clampInt(raw?.discount, 0, 1_000_000_000_000),
    tax: clampInt(raw?.tax, 0, 1_000_000_000_000),
    serviceCharge: clampInt(raw?.serviceCharge, 0, 1_000_000_000_000),
    total: clampInt(raw?.total, 0, 1_000_000_000_000),
    paymentMethod: cleanText(raw?.paymentMethod, 80),
    suggestedCategory: category,
    items,
    warnings,
    confidence
  };

  if (!result.merchant) result.merchant = 'Struk Belanja';
  if (result.total <= 0) throw new Error('Nominal TOTAL tidak terbaca dengan cukup jelas.');

  const itemSum = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  if (itemSum > 0 && result.subtotal > 0) {
    const diff = Math.abs(itemSum - result.subtotal);
    const tolerance = Math.max(2000, Math.round(result.subtotal * 0.08));
    if (diff > tolerance && !result.warnings.some(w => /item|subtotal/i.test(w))) {
      result.warnings.push('Jumlah item dan subtotal tidak sepenuhnya cocok; periksa nominal sebelum menyimpan.');
      result.confidence.overall = Math.min(result.confidence.overall, 82);
    }
  }
  if (result.confidence.total < 70 && !result.warnings.some(w => /total|nominal/i.test(w))) {
    result.warnings.push('Confidence nominal belum tinggi; cocokkan dengan angka TOTAL pada struk.');
  }
  return result;
}

const responseSchema = {
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'Nama merchant/toko yang tercetak pada struk.' },
    date: { type: 'string', description: 'Tanggal transaksi format YYYY-MM-DD. Kosong jika tidak terbaca.' },
    time: { type: 'string', description: 'Waktu transaksi format HH:MM. Kosong jika tidak terbaca.' },
    subtotal: { type: 'integer', description: 'Subtotal dalam rupiah, tanpa simbol atau pemisah ribuan.' },
    discount: { type: 'integer', description: 'Total diskon dalam rupiah.' },
    tax: { type: 'integer', description: 'Total pajak dalam rupiah.' },
    serviceCharge: { type: 'integer', description: 'Service charge dalam rupiah.' },
    total: { type: 'integer', description: 'Jumlah uang yang benar-benar dibebankan/dibayar pelanggan. BUKAN cash/tender, kembalian, subtotal, atau limit kartu.' },
    paymentMethod: { type: 'string', description: 'Metode pembayaran singkat seperti CASH, QRIS, BCA DEBIT. Jangan kembalikan nomor kartu lengkap.' },
    suggestedCategory: { type: 'string', enum: ALLOWED_CATEGORIES },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          qty: { type: 'number' },
          total: { type: 'integer', description: 'Total baris item setelah qty, dalam rupiah.' }
        },
        required: ['name', 'qty', 'total']
      }
    },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: {
        merchant: { type: 'integer', minimum: 0, maximum: 100 },
        total: { type: 'integer', minimum: 0, maximum: 100 },
        date: { type: 'integer', minimum: 0, maximum: 100 },
        category: { type: 'integer', minimum: 0, maximum: 100 },
        overall: { type: 'integer', minimum: 0, maximum: 100 }
      },
      required: ['merchant', 'total', 'date', 'category', 'overall']
    }
  },
  required: ['merchant', 'date', 'time', 'subtotal', 'discount', 'tax', 'serviceCharge', 'total', 'paymentMethod', 'suggestedCategory', 'items', 'warnings', 'confidence']
};

async function callGemini({ apiKey, model, mimeType, data }) {
  const prompt = `Anda adalah mesin ekstraksi struk Indonesia untuk aplikasi keuangan pribadi. Baca HANYA informasi yang terlihat pada foto.\n\nATURAN KRITIS:\n1. total = uang yang benar-benar dibayar/dibebankan pelanggan. Prioritaskan label GRAND TOTAL, TOTAL BAYAR, TOTAL, AMOUNT DUE, JUMLAH BAYAR, NET TOTAL.\n2. JANGAN salah memakai CASH/TUNAI/TENDER, KEMBALI/CHANGE, SUBTOTAL, DISKON, PAJAK, SALDO, atau limit sebagai total.\n3. Jika foto memuat beberapa angka total, gunakan struktur struk dan label untuk menentukan jumlah akhir setelah diskon + pajak + service.\n4. Jika nominal akhir benar-benar tidak dapat dibaca, set total=0 dan jelaskan pada warnings. Jangan menebak angka.\n5. suggestedCategory ditentukan dari merchant DAN isi item. Riwayat pengguna akan diproses lagi di aplikasi.\n6. Jangan menyalin nomor kartu, nomor rekening, kode QR, atau data sensitif lengkap. paymentMethod cukup nama metode/bank.\n7. Confidence harus mencerminkan keterbacaan nyata, bukan dibuat tinggi.\n8. Rupiah harus integer tanpa titik/koma pemisah ribuan.\n9. Item cukup maksimal 20 baris utama.\n10. Kembalikan JSON sesuai schema dan tanpa penjelasan lain.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const baseBody = {
    contents: [{ parts: [
      { text: prompt },
      { inlineData: { mimeType, data } }
    ] }]
  };

  const configs = [
    { temperature: 0.1, responseMimeType: 'application/json', responseSchema },
    { temperature: 0.1, responseFormat: { text: { mimeType: 'application/json', schema: responseSchema } } }
  ];

  let lastError = '';
  for (const generationConfig of configs) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ ...baseBody, generationConfig })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastError = payload?.error?.message || `Gemini ${response.status}`;
      if (response.status === 400) continue;
      throw new Error(lastError);
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!text) throw new Error('Gemini tidak mengembalikan hasil pembacaan struk.');
    try { return JSON.parse(text); }
    catch {
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    }
  }
  throw new Error(lastError || 'Model Gemini tidak menerima konfigurasi scan struk.');
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      configured: Boolean(process.env.GEMINI_API_KEY),
      pinRequired: Boolean(process.env.RECEIPT_SCAN_PIN),
      model: process.env.GEMINI_RECEIPT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method tidak didukung.' });

  const configuredPin = process.env.RECEIPT_SCAN_PIN || '';
  if (configuredPin && req.headers['x-receipt-pin'] !== configuredPin) {
    return send(res, 401, { error: 'PIN Scan Struk salah atau belum diisi.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 503, { error: 'GEMINI_API_KEY belum diatur di Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { mimeType, data } = parseDataUrl(body.imageData);
    const model = process.env.GEMINI_RECEIPT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const raw = await callGemini({ apiKey, model, mimeType, data });
    const result = sanitizeResult(raw);
    return send(res, 200, result);
  } catch (error) {
    console.error('receipt-scan error:', error);
    const message = cleanText(error?.message || 'Struk gagal diproses.', 220);
    const status = /terlalu besar/i.test(message) ? 413 : /Format foto|JSON/i.test(message) ? 400 : /TOTAL tidak terbaca|Nominal TOTAL/i.test(message) ? 422 : 500;
    return send(res, status, { error: message });
  }
};
