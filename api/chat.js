const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const buckets = new Map();

export default {
  async fetch(request) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    };

    if (request.method === 'GET') {
      return json({
        ok: true,
        provider: 'Google Gemini',
        aiConfigured: Boolean(process.env.GEMINI_API_KEY),
        pinRequired: Boolean(process.env.AI_ACCESS_PIN),
        model: MODEL
      }, 200, headers);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Metode tidak didukung.' }, 405, { ...headers, Allow: 'GET, POST' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY belum diisi di Vercel.' }, 503, headers);
    }

    const requiredPin = process.env.AI_ACCESS_PIN || '';
    if (requiredPin && !constantTimeEqual(request.headers.get('x-ai-pin') || '', requiredPin)) {
      return json({ error: 'PIN AI salah.' }, 401, headers);
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allowRequest(ip)) {
      return json({ error: 'Terlalu banyak permintaan. Coba lagi satu menit lagi.' }, 429, headers);
    }

    let raw = '';
    try {
      raw = await request.text();
      if (raw.length > 250000) return json({ error: 'Data terlalu besar.' }, 413, headers);
    } catch {
      return json({ error: 'Gagal membaca data.' }, 400, headers);
    }

    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return json({ error: 'Format data tidak valid.' }, 400, headers);
    }

    const message = cleanText(body.message, 1500);
    if (!message) return json({ error: 'Pesan tidak boleh kosong.' }, 400, headers);

    const history = normalizeHistory(body.history);
    const finance = normalizeFinance(body.finance);
    const prompt = buildPrompt(message, history, finance);

    let upstream;
    try {
      upstream = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          system_instruction: [
            'Kamu adalah manajer keuangan pribadi yang tegas, praktis, dan berbasis angka.',
            'Jawab dalam Bahasa Indonesia kecuali pengguna meminta bahasa lain.',
            'Gunakan hanya data yang dikirim. Jangan mengarang saldo, transaksi, pendapatan, target, atau utang.',
            'Bedakan fakta data, asumsi, dan saran.',
            'Utamakan arus kas, pengeluaran membengkak, rasio tabungan, dana darurat, utang, dan tindakan tujuh hari ke depan.',
            'Jangan meminta PIN bank, password, CVV, nomor kartu penuh, atau kredensial keuangan.',
            'Jangan menjanjikan hasil investasi.',
            'Susun jawaban ringkas dengan bagian: Temuan, Masalah Utama, Tindakan Prioritas.'
          ].join(' '),
          input: prompt,
          generation_config: {
            max_output_tokens: 1200,
            temperature: 0.5
          }
        })
      });
    } catch {
      return json({ error: 'Server gagal terhubung ke Google Gemini.' }, 502, headers);
    }

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const apiMessage = cleanText(data?.error?.message, 350);
      const friendly = upstream.status === 400
        ? 'Permintaan ke Gemini tidak valid.'
        : upstream.status === 401 || upstream.status === 403
          ? 'API key Gemini tidak valid atau tidak memiliki izin.'
          : upstream.status === 429
            ? 'Kuota gratis Gemini sedang habis atau batas permintaan tercapai.'
            : 'Google Gemini menolak permintaan.';
      return json({ error: apiMessage ? `${friendly} ${apiMessage}` : friendly }, upstream.status >= 500 ? 502 : upstream.status, headers);
    }

    const answer = extractGeminiText(data);
    if (!answer) return json({ error: 'Gemini tidak mengirim jawaban teks.' }, 502, headers);

    return json({
      answer,
      provider: 'Google Gemini',
      model: data?.model || MODEL,
      usage: {
        inputTokens: finiteNumber(data?.usage?.total_input_tokens),
        outputTokens: finiteNumber(data?.usage?.total_output_tokens)
      }
    }, 200, headers);
  }
};

function buildPrompt(message, history, finance) {
  const historyText = history.length
    ? history.map(item => `${item.role === 'assistant' ? 'Asisten' : 'Pengguna'}: ${item.content}`).join('\n')
    : 'Belum ada riwayat percakapan.';

  return [
    'RIWAYAT CHAT:',
    historyText,
    '',
    'PERTANYAAN TERBARU:',
    message,
    '',
    'DATA KEUANGAN TERSTRUKTUR:',
    JSON.stringify(finance)
  ].join('\n');
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: cleanText(item?.content, 1200)
  })).filter(item => item.content);
}

function normalizeFinance(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    generatedAt: cleanText(src.generatedAt, 40),
    currentMonth: cleanText(src.currentMonth, 10),
    profile: { name: cleanText(src.profile?.name, 40) || 'Pengguna' },
    accounts: Array.isArray(src.accounts) ? src.accounts.slice(0, 30).map(item => ({
      name: cleanText(item?.name, 60),
      balance: finiteNumber(item?.balance)
    })) : [],
    budgets: Array.isArray(src.budgets) ? src.budgets.slice(0, 50).map(item => ({
      name: cleanText(item?.name, 80),
      limit: finiteNumber(item?.limit)
    })) : [],
    transactions: Array.isArray(src.transactions) ? src.transactions.slice(0, 200).map(item => ({
      date: cleanText(item?.date, 10),
      type: ['income', 'expense', 'transfer', 'debt'].includes(item?.type) ? item.type : 'expense',
      amount: finiteNumber(item?.amount),
      category: cleanText(item?.category, 100),
      account: cleanText(item?.account, 60),
      budget: cleanText(item?.budget, 80) || null
    })) : []
  };
}

function extractGeminiText(data) {
  const textParts = [];
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type !== 'model_output') continue;
    for (const content of Array.isArray(step?.content) ? step.content : []) {
      if (content?.type === 'text' && typeof content.text === 'string') textParts.push(content.text);
    }
  }
  return textParts.join('\n').trim();
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

function allowRequest(key) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter(time => now - time < 60000);
  if (recent.length >= 10) return false;
  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > 500) {
    for (const [ip, times] of buckets) {
      if (!times.some(time => now - time < 60000)) buckets.delete(ip);
    }
  }
  return true;
}

function constantTimeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
        }
    
