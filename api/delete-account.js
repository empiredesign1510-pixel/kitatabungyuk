const { AUTH_PROJECT_URL, authenticatedUser, originAllowed, send, checkRateLimit, rateHeaders, cleanText } = require('./_lib/security');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, { configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) });
  }
  if (req.method !== 'DELETE') return send(res, 405, { error:'Method tidak didukung.' });
  if (!originAllowed(req)) return send(res, 403, { error:'Origin tidak diizinkan.' });
  const user = await authenticatedUser(req);
  if (!user) return send(res, 401, { code:'AUTH_REQUIRED', error:'Sesi login diperlukan.' });
  const rate = checkRateLimit(req, { userId:user.id, scope:'delete-account', limit:3, windowMs:60*60*1000 });
  if (!rate.allowed) return send(res, 429, { error:'Terlalu banyak percobaan penghapusan akun.' }, rateHeaders(rate));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) return send(res, 503, { code:'SERVICE_ROLE_REQUIRED', error:'Penghapusan akun belum dikonfigurasi oleh pemilik aplikasi.' });

  const serviceHeaders = { apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json' };
  try {
    const financeResponse = await fetch(`${AUTH_PROJECT_URL}/rest/v1/user_finance_state?user_id=eq.${encodeURIComponent(user.id)}`, {
      method:'DELETE', headers:{ ...serviceHeaders, Prefer:'return=minimal' }
    });
    if (!financeResponse.ok) {
      const text = await financeResponse.text().catch(()=> '');
      throw new Error(`Data keuangan gagal dihapus (${financeResponse.status}) ${cleanText(text,120)}`);
    }

    const authResponse = await fetch(`${AUTH_PROJECT_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method:'DELETE', headers:serviceHeaders
    });
    if (!authResponse.ok) {
      const text = await authResponse.text().catch(()=> '');
      throw new Error(`Akun login gagal dihapus (${authResponse.status}) ${cleanText(text,120)}`);
    }
    return send(res, 200, { deleted:true });
  } catch (error) {
    console.error('delete-account error:', cleanText(error?.message, 240));
    return send(res, 500, { error:'Penghapusan akun gagal. Hubungi bantuan dan sertakan waktu percobaan.' });
  }
};
