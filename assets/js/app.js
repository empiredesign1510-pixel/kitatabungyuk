// ================= SUPABASE CONFIG =================
// WAJIB: ganti dua nilai di bawah sebelum file dipublish.
// Project URL: Supabase Dashboard → Project Settings / Connect
// Publishable Key: gunakan sb_publishable_... atau anon key, JANGAN secret/service_role.
const SUPABASE_URL = 'https://xmodzjfhsrqgunrkrwbp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CzFv_8l_3Dl9zYh0axf6yA_gssPk3AR';
const AUTH_REDIRECT_URL = 'https://www.kitabung.online/app.html';
// Email templates V9.3 supports OTP-first email verification and recovery; direct token_hash remains as fallback to this domain, then verifyOtp() below.

const LEGACY_STORAGE_KEY = 'GENZ_MONEY_DATA_V2';
const LEGACY_OWNER_KEY = 'KITA_TABUNG_LEGACY_OWNER';
const CLOUD_TABLE = 'user_finance_state';
const CLOUD_SCHEMA_VERSION = 2;

let supabaseClient = null;
let activeUserId = null;
let activeUserEmail = null;
let cloudReady = false;
let cloudSyncTimer = null;
let cloudSyncRunning = false;
let cloudLastSavedAt = null;

// V10.0: OTP entry is visible above login, persists across mobile app switching, and can be reopened from the auth screen.
let pendingEmailOtp = { flow: null, email: '', displayName: '', emoji: '' };
const PENDING_EMAIL_OTP_KEY = 'KITA_TABUNG_PENDING_EMAIL_OTP_V1';

function updatePendingOtpEntry() {
  const box = $('auth-pending-otp');
  const hint = $('auth-pending-otp-hint');
  const valid = !!(pendingEmailOtp?.flow && pendingEmailOtp?.email);
  if (box) box.classList.toggle('show', valid);
  if (hint && valid) {
    const label = pendingEmailOtp.flow === 'recovery' ? 'Kode reset password' : 'Kode verifikasi akun';
    hint.textContent = `${label} dikirim ke ${pendingEmailOtp.email}.`;
  }
}

function savePendingEmailOtp() {
  try {
    if (pendingEmailOtp?.flow && pendingEmailOtp?.email) {
      localStorage.setItem(PENDING_EMAIL_OTP_KEY, JSON.stringify({
        flow: pendingEmailOtp.flow, email: pendingEmailOtp.email,
        displayName: pendingEmailOtp.displayName || '', emoji: pendingEmailOtp.emoji || ''
      }));
    } else {
      localStorage.removeItem(PENDING_EMAIL_OTP_KEY);
    }
  } catch (_) {}
  updatePendingOtpEntry();
}

function restorePendingEmailOtp() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_EMAIL_OTP_KEY) || 'null');
    if (saved && ['signup','recovery'].includes(saved.flow) && saved.email) {
      pendingEmailOtp = {
        flow: saved.flow, email: String(saved.email),
        displayName: String(saved.displayName || ''), emoji: String(saved.emoji || '')
      };
    }
  } catch (_) {}
  updatePendingOtpEntry();
}

function clearPendingEmailOtp() {
  pendingEmailOtp = { flow: null, email: '', displayName: '', emoji: '' };
  savePendingEmailOtp();
}

function reopenPendingEmailOtp() {
  if (!pendingEmailOtp?.flow || !pendingEmailOtp?.email) {
    showAuthMessage('Belum ada kode aktif. Buat akun atau minta reset password terlebih dahulu.', true);
    return;
  }
  openAuthOtpModal(pendingEmailOtp.flow, pendingEmailOtp.email);
}

function isSupabaseConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
    SUPABASE_PUBLISHABLE_KEY.length > 20 &&
    !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
}

function initializeSupabaseClient() {
  if (!isSupabaseConfigured() || !window.supabase?.createClient) return null;
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
  return supabaseClient;
}

// ================= DATA & TRANSLATIONS =================
const langDict = {
  id: {
    t_greeting: "Halo 👋", t_month_title: "Bulan Ini", t_total_balance: "Saldo Saat Ini",
    t_income: "Masuk", t_expense: "Keluar", t_overview: "Overview Pengeluaran",
    t_empty_chart: "Belum ada pengeluaran 💸", t_latest_tx: "Transaksi Terakhir", t_see_all: "Lihat Semua",
    t_budget_title: "Amplop Budgeting", t_add_btn: "+ Tambah", t_budget_sub: "Atur jatah jajan, bensin, dan healingmu.",
    t_btn_ai_history: "<i class='fa-solid fa-history'></i> Riwayat Rencana Budget",
    t_history_title: "Riwayat Lengkap", t_wallet_title: "Dompet & Rekening", t_wallet_sub: "Atur saldo nyata kamu di sini.",
    t_setting_title: "Pengaturan", t_dashboard_summary: "Ringkasan Keuangan", t_dark_mode: "Mode Gelap", t_language: "Bahasa",
    t_danger_zone: "Zona Berbahaya", t_reset_desc: "Hapus semua data transaksimu secara permanen. Tidak bisa dikembalikan!",
    t_reset_btn: "Reset Semua Data", t_nav_home: "Home", t_nav_budget: "Budget", t_nav_history: "Riwayat",
    t_nav_wallet: "Dompet", t_nav_plan: "Rencana", t_nav_setting: "Pengaturan", t_plan_title: "Rencana Keuangan", t_payday_settings: "Tanggal Gajian", t_bills: "Tagihan Berulang", t_goals: "Target Tabungan", t_calendar: "Kalender Keuangan", t_safe_today: "Aman Dipakai Hari Ini", t_forecast: "Prediksi Saldo Akhir Bulan", t_weekly_recap: "Ringkasan Mingguan", t_month_compare: "Perbandingan Bulan", t_modal_tx_title: "Catat Transaksi",
    t_type_exp: "Pengeluaran", t_type_inc: "Pemasukan", t_type_trf: "Transfer", t_type_debt: "Utang/Piutang",
    t_lbl_amount: "Nominal", t_lbl_budget_opt: "Potong dari Budget (Ops)", t_lbl_to_acc: "Ke Rekening",
    t_lbl_date: "Tanggal", t_btn_save_tx: "Simpan Catatan 🚀", t_lbl_wallet_name: "Nama Dompet/Rekening",
    t_lbl_wallet_bal: "Saldo Saat Ini", t_btn_save_wallet: "Simpan Dompet 💳", t_lbl_budget_name: "Nama Amplop / Kategori",
    t_lbl_budget_limit: "Batas Maksimal Sebulan", t_btn_save_budget: "Atur Budget 🎯", t_ai_desc: "Biar gajimu ngga cuma numpang lewat.",
    t_ai_hint: "Gunakan pembagian otomatis 45/30/15/10 dari estimasi pemasukanmu.",
    t_lbl_ai_inc: "Estimasi Pemasukan", t_btn_gen_ai: "Generate Plan 🪄", t_ai_res: "Rekomendasi Pembagian:",
    t_ai_warn: "*Terapkan ini akan mengganti susunan budget kamu saat ini.", t_btn_apply_ai: "Terapkan Sekarang 🚀",
    t_ai_loading: "Sistem sedang menyusun pembagian budget... ⚙️", t_btn_add_tx: "Catat Transaksi",
    t_download_apk_title: "Unduh Aplikasi Android", t_download_apk_desc: "Pasang KITA TABUNG di HP kamu untuk pengalaman yang lebih maksimal.", t_btn_download: "Download APK",
    t_export_pdf_text: "Export PDF", t_ai_history_title: "Riwayat Rencana Budget", t_ai_detail_hint: "Ini adalah porsi budget otomatis pada bulan tersebut.",
    // dynamic strings
    lblCatExp: "Beli / Bayar apa?", lblCatInc: "Dapat uang dari mana?", lblCatTrf: "Keterangan Transfer", lblCatDebt: "Nama Peminjam/Utang",
    lblAccFrom: "Dari Rekening", lblAccTo: "Masuk ke Rekening", optNoAcc: "-- Buat Rekening Dulu --", optNoBud: "-- Tidak masuk budget --",
    no_budget: "Belum ada amplop budget. Bikin yuk!", no_history: "Belum ada transaksi pada periode ini.",
    no_tx: "Belum ada riwayat.", confirm_del: "Hapus transaksi ini?", confirm_reset: "⚠️ PERINGATAN!\n\nApakah kamu yakin ingin menghapus semua data? Data yang dihapus tidak bisa dikembalikan.",
    alert_acc: "Pilih rekening terlebih dahulu!", alert_trf: "Rekening asal dan tujuan tidak boleh sama!", alert_no_pdf_data: "Tidak ada data untuk di-export pada bulan ini!",
    no_ai_history: "Belum ada riwayat rencana. Coba gunakan Perencana Budget Otomatis dulu!"
  },
  en: {
    t_greeting: "Hello, Bestie! 👋", t_month_title: "This Month", t_total_balance: "Total Balance",
    t_income: "Income", t_expense: "Expense", t_overview: "Expenses Overview",
    t_empty_chart: "No expenses yet 💸", t_latest_tx: "Recent Transactions", t_see_all: "See All",
    t_budget_title: "Budget Envelopes", t_add_btn: "+ Add", t_budget_sub: "Manage your food, gas, and healing funds.",
    t_btn_ai_history: "<i class='fa-solid fa-history'></i> View Past Budget Plans",
    t_history_title: "Full History", t_wallet_title: "Wallets & Accounts", t_wallet_sub: "Manage your real balances here.",
    t_setting_title: "Settings", t_dashboard_summary: "Financial Summary", t_dark_mode: "Dark Mode", t_language: "Language",
    t_danger_zone: "Danger Zone", t_reset_desc: "Permanently delete all your transaction data. Cannot be undone!",
    t_reset_btn: "Reset All Data", t_nav_home: "Home", t_nav_budget: "Budget", t_nav_history: "History",
    t_nav_wallet: "Wallet", t_nav_plan: "Plan", t_nav_setting: "Pengaturan", t_plan_title: "Financial Plan", t_payday_settings: "Payday", t_bills: "Recurring Bills", t_goals: "Savings Goals", t_calendar: "Financial Calendar", t_safe_today: "Safe to Spend Today", t_forecast: "End-of-Month Forecast", t_weekly_recap: "Ringkasan Mingguan", t_month_compare: "Monthly Comparison", t_modal_tx_title: "Add Transaction",
    t_type_exp: "Expense", t_type_inc: "Income", t_type_trf: "Transfer", t_type_debt: "Debt",
    t_lbl_amount: "Amount", t_lbl_budget_opt: "Deduct from Budget (Opt)", t_lbl_to_acc: "To Account",
    t_lbl_date: "Date", t_btn_save_tx: "Save Record 🚀", t_lbl_wallet_name: "Wallet/Account Name",
    t_lbl_wallet_bal: "Current Balance", t_btn_save_wallet: "Save Wallet 💳", t_lbl_budget_name: "Envelope/Category Name",
    t_lbl_budget_limit: "Monthly Limit", t_btn_save_budget: "Set Budget 🎯", t_ai_desc: "Don't let your salary just pass by.",
    t_ai_hint: "Use an automatic 45/30/15/10 split from your estimated income.",
    t_lbl_ai_inc: "Estimated Income", t_btn_gen_ai: "Generate Plan 🪄", t_ai_res: "Recommended Allocation:",
    t_ai_warn: "*Applying this will replace your current budget envelopes.", t_btn_apply_ai: "Apply Now 🚀",
    t_ai_loading: "The system is building your budget split... ⚙️", t_btn_add_tx: "Add Record",
    t_download_apk_title: "Download Android App", t_download_apk_desc: "Install KITA TABUNG on your phone for a better experience.", t_btn_download: "Download APK",
    t_export_pdf_text: "Export PDF", t_ai_history_title: "Budget Plan History", t_ai_detail_hint: "This is the automatic budget split for that month.",
    // dynamic strings
    lblCatExp: "What did you pay for?", lblCatInc: "Where is the money from?", lblCatTrf: "Transfer Details", lblCatDebt: "Borrower/Lender Name",
    lblAccFrom: "From Account", lblAccTo: "To Account", optNoAcc: "-- Create Wallet First --", optNoBud: "-- Not in budget --",
    no_budget: "No budget envelopes yet. Let's create one!", no_history: "It's empty bestie. No money movement.",
    no_tx: "No recent transactions.", confirm_del: "Delete this transaction?", confirm_reset: "⚠️ WARNING!\n\nAre you sure you want to delete all data? Deleted data cannot be recovered.",
    alert_acc: "Please select an account first!", alert_trf: "Source and destination accounts cannot be the same!", alert_no_pdf_data: "No data to export for this month!",
    no_ai_history: "No budget plan history yet. Try Perencana Budget Otomatis first!"
  }
};
let state = {
  transactions: [], accounts: [], budgets: [], aiHistory: [],
  payday: { day: 25, expectedIncome: 0, safetyReserve: 0 },
  recurringBills: [],
  goals: [],
  theme: 'light', adaptiveTheme: false, lang: 'id',
  user: { name: '', emoji: '💸' },
  onboarding: { dismissed: false, walletConfigured: false, dashboardReviewed: false },
  customTheme: { enabled: false, primary: '#4F46E5', bg: '#F2F4F7', surface: '#FFFFFF', wallpaper: '', appEmoji: '💸' },
  aiChat: []
};

const defaultAccounts = [
  { id: 'acc_1', name: 'Tunai', balance: 0 },
  { id: 'acc_2', name: 'BCA', balance: 0 },
  { id: 'acc_3', name: 'Gopay', balance: 0 }
];

let myChart = null;
let aiTempBudgets = [];
let activeThemeTarget = 'primary';
let wheelHue = 0;
let wheelSaturation = 0;
let wheelValue = 1;
let wheelDrawFrame = 0;
let themeSaveTimer = 0;
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
const THEME_STORAGE_KEY = 'KITA_TABUNG_THEME_V3';

// ================= UTILITIES & STORAGE =================
const $ = id => document.getElementById(id);
const toRp = num => {
  const symbol = state.lang === 'id' ? 'Rp ' : 'Rp '; // Keep Rp
  return symbol + Number(num || 0).toLocaleString(state.lang === 'id' ? 'id-ID' : 'en-US');
}
const generateId = () => '_' + Math.random().toString(36).slice(2, 11);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const getMonthKey = (dateStr) => typeof dateStr === 'string' && /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : '';
const getCurrentMonthKey = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const pad2 = value => String(value).padStart(2, '0');
const toDateKey = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const parseLocalDate = value => {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};
const startOfLocalDay = value => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const addDaysLocal = (date, amount) => {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + Number(amount || 0));
  return result;
};
const daysBetweenInclusive = (from, to) => {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
};
const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
const clampDayForMonth = (year, monthIndex, day) => Math.min(Math.max(1, Number(day || 1)), daysInMonth(year, monthIndex));
const formatDateShort = value => {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return '-';
  return date.toLocaleDateString(state.lang === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};
const t = (key) => langDict[state.lang]?.[key] || langDict.id[key] || key;
const formatCompactRp = num => {
  const n = Number(num || 0);
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace('.0','')} M`;
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace('.0','')} jt`;
  if (Math.abs(n) >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n)}`;
};
const validHex = value => /^#[0-9a-f]{6}$/i.test(value || '');
const hexToRgb = hex => {
  const value = validHex(hex) ? hex.slice(1) : '4F46E5';
  return { r: parseInt(value.slice(0,2),16), g: parseInt(value.slice(2,4),16), b: parseInt(value.slice(4,6),16) };
};
const readableText = hex => {
  const {r,g,b} = hexToRgb(hex);
  const luminance = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  return luminance > .58 ? '#0F172A' : '#F8FAFC';
};

const rgbToHex = (r, g, b) => '#' + [r,g,b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2,'0')).join('').toUpperCase();
const hsvToRgb = (h, s, v) => {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r,g,b] = [c,x,0];
  else if (h < 120) [r,g,b] = [x,c,0];
  else if (h < 180) [r,g,b] = [0,c,x];
  else if (h < 240) [r,g,b] = [0,x,c];
  else if (h < 300) [r,g,b] = [x,0,c];
  else [r,g,b] = [c,0,x];
  return { r:(r+m)*255, g:(g+m)*255, b:(b+m)*255 };
};
const rgbToHsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max-min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g-b)/delta) % 6);
    else if (max === g) h = 60 * (((b-r)/delta) + 2);
    else h = 60 * (((r-g)/delta) + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta/max, v: max };
};
const hexToHsv = hex => {
  const {r,g,b} = hexToRgb(hex);
  return rgbToHsv(r,g,b);
};
const themeTargetLabel = target => ({ primary:'Warna utama', bg:'Warna latar', surface:'Warna kartu' }[target] || 'Warna');
const blendHex = (fromHex, toHex, amount = .5) => {
  const from = hexToRgb(fromHex), to = hexToRgb(toHex);
  const mix = key => from[key] + (to[key] - from[key]) * Math.max(0, Math.min(1, amount));
  return rgbToHex(mix('r'), mix('g'), mix('b'));
};


const metricAnimationFrames = new WeakMap();
function animateMetricValue(element, target, options = {}) {
  if (!element) return;
  const numericTarget = Number(target || 0);
  const {
    currency = false, prefix = '', suffix = '', decimals = 0,
    duration = 520, formatter = null
  } = options;
  const signature = `${numericTarget}|${currency}|${prefix}|${suffix}|${decimals}|${state.lang}`;
  if (element.dataset.metricSignature === signature && element.textContent) return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const previous = Number(element.dataset.metricValue);
  const start = Number.isFinite(previous) ? previous : 0;
  const format = value => {
    if (typeof formatter === 'function') return formatter(value);
    if (currency) return `${prefix}${toRp(Math.round(value))}${suffix}`;
    return `${prefix}${Number(value).toLocaleString(state.lang === 'en' ? 'en-US' : 'id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  };

  const oldFrame = metricAnimationFrames.get(element);
  if (oldFrame) cancelAnimationFrame(oldFrame);
  element.dataset.metricSignature = signature;
  element.dataset.metricValue = String(numericTarget);

  if (reduced || duration <= 0 || start === numericTarget) {
    element.textContent = format(numericTarget);
    return;
  }

  const started = performance.now();
  const distance = numericTarget - start;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const tick = now => {
    const progress = Math.min(1, (now - started) / duration);
    element.textContent = format(start + distance * easeOut(progress));
    if (progress < 1) metricAnimationFrames.set(element, requestAnimationFrame(tick));
    else {
      element.textContent = format(numericTarget);
      metricAnimationFrames.delete(element);
      element.classList.remove('micro-pop');
      void element.offsetWidth;
      element.classList.add('micro-pop');
      setTimeout(() => element.classList.remove('micro-pop'), 340);
    }
  };
  metricAnimationFrames.set(element, requestAnimationFrame(tick));
}

const normalizeSearchText = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ').replace(/\s+/g, ' ').trim();
function getGlobalSearchItems() {
  const items = [
    { type:'page', id:'home', icon:'fa-house', title: state.lang === 'en' ? 'Home dashboard' : 'Dashboard Home', subtitle: state.lang === 'en' ? 'Balance, insights and latest activity' : 'Saldo, insight, dan aktivitas terbaru', keywords:'home dashboard saldo insight' },
    { type:'page', id:'plan', icon:'fa-calendar-check', title: state.lang === 'en' ? 'Financial plan' : 'Rencana Keuangan', subtitle: state.lang === 'en' ? 'Payday, bills, goals and calendar' : 'Gajian, tagihan, target, dan kalender', keywords:'rencana plan gajian tagihan target kalender' },
    { type:'page', id:'history', icon:'fa-clock-rotate-left', title: state.lang === 'en' ? 'Transaction history' : 'Riwayat Transaksi', subtitle: state.lang === 'en' ? 'Browse all transactions' : 'Lihat seluruh transaksi', keywords:'riwayat history transaksi' },
    { type:'page', id:'setting', icon:'fa-gear', title: state.lang === 'en' ? 'Settings' : 'Pengaturan', subtitle: state.lang === 'en' ? 'Profile, theme and account' : 'Profil, tema, dan akun', keywords:'setting pengaturan profil tema akun' }
  ];

  state.transactions.forEach(tx => {
    const account = state.accounts.find(a => a.id === tx.accountId);
    items.push({
      type:'transaction', id:tx.id, icon: getIconData(tx.type).icon,
      title: safeText(tx.category, 100) || (state.lang === 'en' ? 'Transaction' : 'Transaksi'),
      subtitle: `${formatDateShort(tx.date)} · ${account?.name || '-'} · ${toRp(tx.amount)}`,
      keywords: `${tx.category} ${tx.smartCategory || ''} ${tx.type} ${tx.date} ${tx.amount} ${account?.name || ''}`
    });
  });
  state.accounts.forEach(account => items.push({
    type:'wallet', id:account.id, icon:'fa-wallet', title:account.name,
    subtitle:`${state.lang === 'en' ? 'Wallet balance' : 'Saldo dompet'} · ${toRp(account.balance)}`,
    keywords:`dompet wallet rekening ${account.name} ${account.balance}`
  }));
  state.budgets.forEach(budget => items.push({
    type:'budget', id:budget.id, icon:'fa-chart-pie', title:budget.name,
    subtitle:`${state.lang === 'en' ? 'Monthly budget' : 'Budget bulanan'} · ${toRp(budget.limit)}`,
    keywords:`budget amplop ${budget.name} ${budget.limit}`
  }));
  state.recurringBills.forEach(bill => items.push({
    type:'bill', id:bill.id, icon:'fa-calendar-day', title:bill.name,
    subtitle:`${formatDateShort(bill.nextDueDate)} · ${toRp(bill.amount)} · ${getBillFrequencyLabel(bill.frequency)}`,
    keywords:`tagihan bill recurring ${bill.name} ${bill.category} ${bill.amount} ${bill.nextDueDate}`
  }));
  state.goals.forEach(goal => items.push({
    type:'goal', id:goal.id, icon:'fa-bullseye', title:`${goal.emoji || '🎯'} ${goal.name}`,
    subtitle:`${toRp(goal.saved)} / ${toRp(goal.target)}${goal.deadline ? ` · ${formatDateShort(goal.deadline)}` : ''}`,
    keywords:`target goal tabungan ${goal.name} ${goal.saved} ${goal.target} ${goal.deadline || ''}`
  }));
  return items;
}

function renderGlobalSearchResults(query = '') {
  const container = $('global-search-results');
  if (!container) return;
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  let items = getGlobalSearchItems();
  if (terms.length) {
    items = items.map(item => {
      const haystack = normalizeSearchText(`${item.title} ${item.subtitle} ${item.keywords || ''}`);
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0) + (normalizeSearchText(item.title).startsWith(term) ? 2 : 0), 0);
      return { ...item, score };
    }).filter(item => item.score >= terms.length * 2).sort((a,b) => b.score - a.score).slice(0, 30);
  } else {
    const pages = items.filter(item => item.type === 'page');
    const recent = items.filter(item => item.type === 'transaction').slice(-6).reverse();
    items = [...pages, ...recent];
  }

  if (!items.length) {
    container.innerHTML = `<div class="search-empty"><i class="fa-solid fa-magnifying-glass" style="font-size:1.4rem;color:var(--primary);margin-bottom:10px;"></i><br>${state.lang === 'en' ? 'No matching data found.' : 'Tidak ada data yang cocok.'}</div>`;
    return;
  }

  const typeLabel = { page:'Menu', transaction:'Transaksi', wallet:'Dompet', budget:'Budget', bill:'Tagihan', goal:'Target' };
  container.innerHTML = `${normalizedQuery ? '' : `<div class="search-section-label">${state.lang === 'en' ? 'Quick access & recent' : 'Akses cepat & terbaru'}</div>`}${items.map(item => `
    <button type="button" class="global-search-result" data-search-type="${escapeHtml(item.type)}" data-search-id="${escapeHtml(item.id)}">
      <span class="search-result-icon"><i class="fa-solid ${escapeHtml(item.icon)}"></i></span>
      <span class="search-result-main"><span class="search-result-title">${escapeHtml(item.title)}</span><span class="search-result-sub">${escapeHtml(item.subtitle)}</span></span>
      <span class="search-result-type">${escapeHtml(typeLabel[item.type] || item.type)}</span>
    </button>`).join('')}`;
}

function openGlobalSearch() {
  closeProfileMenu();
  openModal('modal-global-search');
  renderGlobalSearchResults('');
  const input = $('global-search-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus({ preventScroll:true }), 70);
  }
}
function closeGlobalSearch() { closeModal('modal-global-search'); }
function handleGlobalSearchBackdrop(event) { if (event.target === $('modal-global-search')) closeGlobalSearch(); }
function openGlobalSearchResult(type, id) {
  closeGlobalSearch();
  const action = () => {
    if (type === 'page') return go(id);
    if (type === 'transaction') { go('history'); return setTimeout(() => openTxModal(id), 80); }
    if (type === 'wallet') { go('wallet'); return setTimeout(() => openWalletModal(id), 80); }
    if (type === 'budget') { go('budget'); return setTimeout(() => openBudgetModal(id), 80); }
    if (type === 'bill') { go('plan'); return setTimeout(() => openRecurringBillModal(id), 80); }
    if (type === 'goal') { go('plan'); return setTimeout(() => openGoalModal(id), 80); }
  };
  action();
}
function bindGlobalSearch() {
  const input = $('global-search-input');
  const results = $('global-search-results');
  if (input && input.dataset.bound !== '1') {
    input.dataset.bound = '1';
    input.addEventListener('input', () => renderGlobalSearchResults(input.value));
  }
  if (results && results.dataset.bound !== '1') {
    results.dataset.bound = '1';
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-search-type][data-search-id]');
      if (!button) return;
      openGlobalSearchResult(button.dataset.searchType, button.dataset.searchId);
    });
  }
}

function bindAdaptiveThemeListener() {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media || media.__kitaTabungBound) return;
  media.__kitaTabungBound = true;
  const listener = () => {
    if (!state.adaptiveTheme) return;
    applyTheme();
    render();
  };
  if (media.addEventListener) media.addEventListener('change', listener);
  else if (media.addListener) media.addListener(listener);
}


const BALANCE_VISIBILITY_KEY = 'KITA_TABUNG_BALANCE_VISIBLE';
const PRIVACY_SETTINGS_KEY = 'KITA_TABUNG_PRIVACY_V2';

function normalizePrivacySettings(candidate = {}) {
  const legacyHidden = localStorage.getItem(BALANCE_VISIBILITY_KEY) === '0';
  const mode = ['remember','hidden','visible'].includes(candidate?.reopenMode) ? candidate.reopenMode : 'remember';
  return {
    enabled: typeof candidate?.enabled === 'boolean' ? candidate.enabled : legacyHidden,
    reopenMode: mode
  };
}

let privacySettings = normalizePrivacySettings(readJsonStorage(PRIVACY_SETTINGS_KEY) || {});
let privacyModeEnabled = privacySettings.reopenMode === 'hidden'
  ? true
  : privacySettings.reopenMode === 'visible'
    ? false
    : privacySettings.enabled === true;
let balanceAmountsVisible = !privacyModeEnabled;

function persistPrivacySettings() {
  privacySettings.enabled = privacyModeEnabled;
  try { localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(privacySettings)); } catch (error) { console.warn('Privasi gagal disimpan:', error); }
  localStorage.setItem(BALANCE_VISIBILITY_KEY, privacyModeEnabled ? '0' : '1');
}

function maskCurrencyText(text) {
  return String(text ?? '').replace(/([+\-]?\s*Rp\s*)(?:\d[\d.,]*)(?:\s*(?:rb|ribu|jt|juta|k|m))?/gi, '$1•••••••');
}

function applyPrivacyModeToDOM() {
  const nodes = document.querySelectorAll('body *');
  nodes.forEach(el => {
    if (['SCRIPT','STYLE','INPUT','TEXTAREA','CANVAS'].includes(el.tagName)) return;
    if (el.children.length > 0) return;
    if (privacyModeEnabled) {
      const current = el.textContent || '';
      if (!/Rp\s*\d/i.test(current)) return;
      el.dataset.privacyOriginalText = current;
      el.textContent = maskCurrencyText(current);
    } else if (el.dataset.privacyOriginalText) {
      el.textContent = el.dataset.privacyOriginalText;
      delete el.dataset.privacyOriginalText;
    }
  });
}

function updatePrivacySettingsUI() {
  const toggle = $('setting-privacy-toggle');
  const select = $('privacy-reopen-mode');
  if (toggle) toggle.checked = privacyModeEnabled;
  if (select) select.value = privacySettings.reopenMode;
}

function setPrivacyMode(enabled, options = {}) {
  const wasPrivacyEnabled = privacyModeEnabled;
  privacyModeEnabled = Boolean(enabled);
  if (wasPrivacyEnabled && !privacyModeEnabled) applyPrivacyModeToDOM();
  balanceAmountsVisible = !privacyModeEnabled;
  persistPrivacySettings();
  updateBalanceVisibilityControl();
  updatePrivacySettingsUI();
  if (options.renderApp !== false) render();
  else requestAnimationFrame(applyPrivacyModeToDOM);
  if (options.toast !== false) showToast(privacyModeEnabled ? 'Mode Privasi aktif. Nominal uang disembunyikan.' : 'Mode Privasi dimatikan. Nominal uang ditampilkan.');
}

function togglePrivacyFromSetting() {
  setPrivacyMode($('setting-privacy-toggle')?.checked === true);
}

function changePrivacyReopenMode() {
  const value = $('privacy-reopen-mode')?.value || 'remember';
  privacySettings.reopenMode = ['remember','hidden','visible'].includes(value) ? value : 'remember';
  persistPrivacySettings();
  showToast(privacySettings.reopenMode === 'hidden'
    ? 'Saat aplikasi dibuka, nominal akan selalu disembunyikan.'
    : privacySettings.reopenMode === 'visible'
      ? 'Saat aplikasi dibuka, nominal akan selalu ditampilkan.'
      : 'KITA TABUNG akan mengingat pilihan privasi terakhir.');
}

function maskMetricValue(element, text = 'Rp •••••••') {
  if (!element) return;
  const oldFrame = metricAnimationFrames.get(element);
  if (oldFrame) cancelAnimationFrame(oldFrame);
  metricAnimationFrames.delete(element);
  element.textContent = text;
  delete element.dataset.metricSignature;
}

function updateBalanceVisibilityControl() {
  const button = $('balance-visibility-toggle');
  const icon = $('balance-visibility-icon');
  if (!button || !icon) return;
  const hidden = privacyModeEnabled;
  icon.className = `fa-solid ${hidden ? 'fa-eye-slash' : 'fa-eye'}`;
  const label = hidden
    ? (state.lang === 'en' ? 'Show all money amounts' : 'Tampilkan semua nominal')
    : (state.lang === 'en' ? 'Hide all money amounts' : 'Aktifkan Mode Privasi');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
}

function toggleBalanceVisibility() {
  setPrivacyMode(!privacyModeEnabled);
}

function renderPrivateBalanceMetric(element, target, options = {}) {
  if (privacyModeEnabled) {
    const prefix = options.prefix || '';
    maskMetricValue(element, `${prefix}${options.mask || 'Rp •••••••'}`);
    return;
  }
  animateMetricValue(element, target, options);
}

function formatMonthLabel(monthKey) {
  const d = new Date(monthKey + '-01');
  return d.toLocaleDateString(state.lang==='en'?'en-US':'id-ID', {month:'long', year:'numeric'});
}

function getThemeSnapshot() {
  return {
    theme: state.theme === 'dark' ? 'dark' : 'light',
    adaptiveTheme: state.adaptiveTheme === true,
    customTheme: {
      enabled: state.customTheme?.enabled === true,
      primary: validHex(state.customTheme?.primary) ? state.customTheme.primary.toUpperCase() : '#4F46E5',
      bg: validHex(state.customTheme?.bg) ? state.customTheme.bg.toUpperCase() : '#F2F4F7',
      surface: validHex(state.customTheme?.surface) ? state.customTheme.surface.toUpperCase() : '#FFFFFF',
      wallpaper: '',
      appEmoji: safeText(state.customTheme?.appEmoji, 8) || '💸'
    }
  };
}

function persistThemeState() {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(getThemeSnapshot()));
    const badge = $('theme-live-badge');
    if (badge) {
      badge.classList.remove('saving');
      badge.innerHTML = '<span></span>Tersimpan';
    }
  } catch (error) {
    console.error('Tema gagal disimpan:', error);
  }
}

function scheduleThemePersist() {
  const badge = $('theme-live-badge');
  if (badge) {
    badge.classList.add('saving');
    badge.innerHTML = '<span></span>Menyimpan';
  }
  clearTimeout(themeSaveTimer);
  themeSaveTimer = setTimeout(() => {
    persistThemeState();
    saveData(false);
  }, 120);
}

function getUserCacheKey(userId = activeUserId) {
  return userId ? `KITA_TABUNG_CACHE_${userId}` : LEGACY_STORAGE_KEY;
}

function getUserCacheMetaKey(userId = activeUserId) {
  return `${getUserCacheKey(userId)}_UPDATED_AT`;
}

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`Data lokal ${key} rusak:`, error);
    return null;
  }
}

function normalizeFinanceState(raw, savedTheme = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const sourceTheme = savedTheme?.customTheme || source.customTheme || {};

  return {
    transactions: Array.isArray(source.transactions)
      ? source.transactions.map(tx => ({
          ...tx,
          smartCategory: safeText(tx?.smartCategory, 60)
        }))
      : [],
    accounts: Array.isArray(source.accounts) && source.accounts.length
      ? source.accounts
      : defaultAccounts.map(account => ({ ...account })),
    budgets: Array.isArray(source.budgets)
      ? source.budgets.map(budget => ({
          ...budget,
          id: safeText(budget?.id, 40) || generateId(),
          name: safeText(budget?.name, 80) || 'Budget',
          limit: Math.max(0, Number(budget?.limit || 0)),
          rollover: budget?.rollover === true,
          rolloverStart: /^\d{4}-\d{2}-\d{2}$/.test(budget?.rolloverStart || '') ? budget.rolloverStart : '',
          limitHistory: Array.isArray(budget?.limitHistory)
            ? budget.limitHistory
                .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item?.effectivePeriodStart || '') && Number.isFinite(Number(item?.limit)))
                .map(item => ({ effectivePeriodStart: item.effectivePeriodStart, limit: Math.max(0, Number(item.limit || 0)) }))
                .sort((a,b) => a.effectivePeriodStart.localeCompare(b.effectivePeriodStart))
            : []
        }))
      : [],
    aiHistory: Array.isArray(source.aiHistory) ? source.aiHistory : [],
    payday: {
      day: Math.min(31, Math.max(1, Number(source.payday?.day || 25))),
      expectedIncome: Math.max(0, Number(source.payday?.expectedIncome || 0)),
      safetyReserve: Math.max(0, Number(source.payday?.safetyReserve || 0))
    },
    recurringBills: Array.isArray(source.recurringBills)
      ? source.recurringBills.map(bill => ({
          id: safeText(bill?.id, 40) || generateId(),
          name: safeText(bill?.name, 80) || 'Tagihan',
          amount: Math.max(0, Number(bill?.amount || 0)),
          category: safeText(bill?.category, 60) || 'Tagihan',
          accountId: safeText(bill?.accountId, 60),
          frequency: ['weekly','monthly','yearly'].includes(bill?.frequency) ? bill.frequency : 'monthly',
          anchorDate: /^\d{4}-\d{2}-\d{2}$/.test(bill?.anchorDate || '') ? bill.anchorDate : (bill?.nextDueDate || toDateKey(new Date())),
          nextDueDate: /^\d{4}-\d{2}-\d{2}$/.test(bill?.nextDueDate || '') ? bill.nextDueDate : toDateKey(new Date()),
          active: bill?.active !== false,
          lastPaidDate: /^\d{4}-\d{2}-\d{2}$/.test(bill?.lastPaidDate || '') ? bill.lastPaidDate : '',
          lastPaidAmount: Math.max(0, Number(bill?.lastPaidAmount || 0))
        }))
      : [],
    goals: Array.isArray(source.goals)
      ? source.goals.map(goal => ({
          id: safeText(goal?.id, 40) || generateId(),
          name: safeText(goal?.name, 80) || 'Target',
          emoji: safeText(goal?.emoji, 8) || '🎯',
          target: Math.max(1, Number(goal?.target || 1)),
          saved: Math.max(0, Number(goal?.saved || 0)),
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(goal?.deadline || '') ? goal.deadline : '',
          monthlyContribution: Math.max(0, Number(goal?.monthlyContribution || 0)),
          createdAt: /^\d{4}-\d{2}-\d{2}$/.test(goal?.createdAt || '') ? goal.createdAt : toDateKey(new Date()),
          contributions: Array.isArray(goal?.contributions)
            ? goal.contributions.slice(-120).map(item => ({
                id: safeText(item?.id, 40) || generateId(),
                amount: Number(item?.amount || 0),
                date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : toDateKey(new Date()),
                note: safeText(item?.note, 100),
                type: item?.type === 'withdraw' ? 'withdraw' : 'deposit'
              }))
            : []
        }))
      : [],
    theme: savedTheme?.theme === 'dark' || (!savedTheme && source.theme === 'dark') ? 'dark' : 'light',
    adaptiveTheme: typeof savedTheme?.adaptiveTheme === 'boolean' ? savedTheme.adaptiveTheme : source.adaptiveTheme === true,
    lang: source.lang === 'en' ? 'en' : 'id',
    user: {
      name: safeText(source.user?.name, 40),
      emoji: safeText(source.user?.emoji, 8) || '💸'
    },
    onboarding: {
      dismissed: source.onboarding?.dismissed === true,
      walletConfigured: source.onboarding?.walletConfigured === true,
      dashboardReviewed: source.onboarding?.dashboardReviewed === true
    },
    customTheme: {
      enabled: sourceTheme.enabled === true,
      primary: validHex(sourceTheme.primary) ? sourceTheme.primary.toUpperCase() : '#4F46E5',
      bg: validHex(sourceTheme.bg) ? sourceTheme.bg.toUpperCase() : '#F2F4F7',
      surface: validHex(sourceTheme.surface) ? sourceTheme.surface.toUpperCase() : '#FFFFFF',
      wallpaper: '',
      appEmoji: safeText(sourceTheme.appEmoji, 8) || '💸'
    },
    aiChat: Array.isArray(source.aiChat) ? source.aiChat.slice(-20) : []
  };
}

function hasMeaningfulFinanceData(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return Boolean(
    candidate.transactions?.length ||
    candidate.budgets?.length ||
    candidate.aiHistory?.length ||
    candidate.budgetHistory?.length ||
    candidate.inboxDrafts?.length ||
    candidate.smartRules?.length ||
    candidate.recurringTransactions?.length ||
    candidate.periodClosings?.length ||
    candidate.recurringBills?.length ||
    candidate.goals?.length ||
    Number(candidate.payday?.expectedIncome || 0) > 0 ||
    candidate.accounts?.some(account => Number(account.balance || 0) !== 0)
  );
}

function getSavedThemeSnapshot() {
  return readJsonStorage(THEME_STORAGE_KEY);
}

function loadLegacySnapshot() {
  return readJsonStorage(LEGACY_STORAGE_KEY);
}

function loadUserCache() {
  if (!activeUserId) return null;
  return readJsonStorage(getUserCacheKey(activeUserId));
}

function getLocalCacheUpdatedAt() {
  const value = localStorage.getItem(getUserCacheMetaKey());
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function saveLocalCache() {
  try {
    const key = getUserCacheKey();
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(`${key}_UPDATED_AT`, new Date().toISOString());
  } catch (error) {
    console.error('Cache lokal gagal disimpan:', error);
    showToast('Cache perangkat penuh. Data cloud akan tetap dicoba.', true);
  }
}

function loadData() {
  const savedTheme = getSavedThemeSnapshot();
  const candidate = activeUserId ? loadUserCache() : loadLegacySnapshot();
  state = normalizeFinanceState(candidate || state, savedTheme);
}

function saveData(saveTheme = true) {
  saveLocalCache();
  if (saveTheme) persistThemeState();
  queueCloudSync();
}

function updateCloudStatus(status, detail = '') {
  const container = $('cloud-sync-status');
  if (!container) return;

  const map = {
    unconfigured: ['fa-plug-circle-xmark', 'Supabase belum diatur', 'var(--danger)', false],
    auth: ['fa-user-lock', 'Silakan login', 'var(--warning)', false],
    loading: ['fa-cloud-arrow-down', 'Memuat cloud', 'var(--primary)', true],
    waiting: ['fa-clock', 'Menunggu sinkron', 'var(--warning)', false],
    syncing: ['fa-rotate', 'Menyinkronkan', 'var(--primary)', true],
    synced: ['fa-cloud-circle-check', 'Tersimpan di cloud', 'var(--success)', false],
    offline: ['fa-cloud-arrow-down', 'Mode offline', 'var(--warning)', false],
    error: ['fa-triangle-exclamation', 'Sync gagal', 'var(--danger)', false]
  };
  const [icon, text, color, spin] = map[status] || map.loading;
  container.style.color = color;
  container.title = detail || text;
  container.innerHTML = `<i class="fa-solid ${icon}${spin ? ' sync-spin' : ''}"></i><span>${escapeHtml(text)}</span>`;
}

async function fetchCloudState() {
  if (!supabaseClient || !activeUserId) return null;
  const { data, error } = await supabaseClient
    .from(CLOUD_TABLE)
    .select('data, schema_version, version, created_at, updated_at')
    .eq('user_id', activeUserId)
    .maybeSingle();

  if (error) throw new Error(`Gagal mengambil data cloud: ${error.message}`);
  return data;
}

async function saveCloudState(options = {}) {
  const { force = false, showSuccess = false } = options;
  if (!supabaseClient || !activeUserId || (!cloudReady && !force)) return false;
  if (cloudSyncRunning) {
    queueCloudSync(500);
    return false;
  }

  cloudSyncRunning = true;
  updateCloudStatus('syncing');
  try {
    const payload = {
      user_id: activeUserId,
      data: normalizeFinanceState(state, null),
      schema_version: CLOUD_SCHEMA_VERSION
    };
    const { data, error } = await supabaseClient
      .from(CLOUD_TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select('updated_at, version')
      .single();

    if (error) throw error;
    cloudLastSavedAt = data?.updated_at || new Date().toISOString();
    updateCloudStatus('synced', `Terakhir tersimpan ${cloudLastSavedAt}`);
    if (showSuccess) showToast('Data berhasil disinkronkan ke Supabase.');
    return true;
  } catch (error) {
    console.error('Cloud sync gagal:', error);
    updateCloudStatus(navigator.onLine ? 'error' : 'offline', error.message);
    if (showSuccess) showToast(`Cloud sync gagal: ${error.message}`, true);
    return false;
  } finally {
    cloudSyncRunning = false;
  }
}

function queueCloudSync(delay = 1200) {
  if (!supabaseClient || !activeUserId || !cloudReady) return;
  clearTimeout(cloudSyncTimer);
  updateCloudStatus(navigator.onLine ? 'waiting' : 'offline');
  cloudSyncTimer = setTimeout(() => saveCloudState(), delay);
}

async function forceCloudSync() {
  saveLocalCache();
  await saveCloudState({ force: true, showSuccess: true });
}

function applyAuthenticatedProfileFallback(user) {
  if (state.user?.name) return;
  const metadataName = safeText(user?.user_metadata?.display_name, 40);
  const emailName = safeText(String(user?.email || '').split('@')[0], 40);
  state.user.name = metadataName || emailName || 'Pengguna';
  state.user.emoji = safeText(user?.user_metadata?.emoji, 8) || state.user.emoji || '💸';
}

async function hydrateUserFinanceData(user) {
  activeUserId = user.id;
  activeUserEmail = user.email || '';
  cloudReady = false;
  updateCloudStatus('loading');

  const savedTheme = getSavedThemeSnapshot();
  const userCache = loadUserCache();
  const legacySnapshot = loadLegacySnapshot();
  let cloudRecord = null;

  try {
    cloudRecord = await fetchCloudState();
  } catch (error) {
    console.error(error);
    state = normalizeFinanceState(userCache || legacySnapshot || state, savedTheme);
    applyAuthenticatedProfileFallback(user);
    cloudReady = true;
    saveLocalCache();
    updateCloudStatus(navigator.onLine ? 'error' : 'offline', error.message);
    return;
  }

  const cloudSnapshot = cloudRecord?.data || null;
  const cloudHasData = hasMeaningfulFinanceData(cloudSnapshot);
  const cacheHasData = hasMeaningfulFinanceData(userCache);
  const legacyHasData = hasMeaningfulFinanceData(legacySnapshot);

  if (cloudHasData) {
    const cloudUpdated = cloudRecord?.updated_at ? Date.parse(cloudRecord.updated_at) : 0;
    const localUpdated = getLocalCacheUpdatedAt();
    const localLooksNewer = cacheHasData && localUpdated > cloudUpdated + 10000;

    if (localLooksNewer) {
      const useDevice = confirm(
        'Ditemukan data perangkat yang lebih baru daripada data cloud.\n\n' +
        'OK: unggah data perangkat ke Supabase.\nCancel: gunakan data Supabase.'
      );
      state = normalizeFinanceState(useDevice ? userCache : cloudSnapshot, useDevice ? savedTheme : null);
      applyAuthenticatedProfileFallback(user);
      cloudReady = true;
      saveLocalCache();
      if (useDevice) await saveCloudState({ force: true });
      else updateCloudStatus('synced');
      return;
    }

    state = normalizeFinanceState(cloudSnapshot, null);
    applyAuthenticatedProfileFallback(user);
    cloudReady = true;
    saveLocalCache();
    updateCloudStatus('synced', cloudRecord.updated_at || 'Data cloud dimuat');
    return;
  }

  let migrationSource = cacheHasData ? userCache : (legacyHasData ? legacySnapshot : null);
  if (migrationSource) {
    const claimedBy = localStorage.getItem(LEGACY_OWNER_KEY);
    const canClaimLegacy = !claimedBy || claimedBy === activeUserId || cacheHasData;
    if (canClaimLegacy) {
      const migrate = confirm(
        'Data lama ditemukan di perangkat ini.\n\n' +
        `Pindahkan data tersebut ke akun ${activeUserEmail}?\n\n` +
        'Pilih OK agar data tidak hilang saat cache browser dihapus.'
      );
      if (migrate) {
        state = normalizeFinanceState(migrationSource, savedTheme);
        applyAuthenticatedProfileFallback(user);
        localStorage.setItem(LEGACY_OWNER_KEY, activeUserId);
        cloudReady = true;
        saveLocalCache();
        await saveCloudState({ force: true });
        showToast('Data lama berhasil dipindahkan ke Supabase.');
        return;
      }
    }
  }

  state = normalizeFinanceState(null, savedTheme);
  applyAuthenticatedProfileFallback(user);
  cloudReady = true;
  saveLocalCache();
  await saveCloudState({ force: true });
}

// ================= FINANCIAL PLANNING ENGINE =================
function getNextPaydayDate(reference = new Date()) {
  const today = startOfLocalDay(reference);
  const day = Math.min(31, Math.max(1, Number(state.payday?.day || 25)));
  let year = today.getFullYear();
  let month = today.getMonth();
  let candidate = new Date(year, month, clampDayForMonth(year, month, day));
  if (candidate < today) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(year, month, clampDayForMonth(year, month, day));
  }
  return candidate;
}


function getBudgetPeriodBounds(reference = new Date()) {
  const date = startOfLocalDay(reference);
  const paydayDay = Math.min(31, Math.max(1, Number(state.payday?.day || 25)));
  let year = date.getFullYear();
  let month = date.getMonth();
  const thisMonthStart = new Date(year, month, clampDayForMonth(year, month, paydayDay));
  let start;

  if (date >= thisMonthStart) {
    start = thisMonthStart;
  } else {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    start = new Date(year, month, clampDayForMonth(year, month, paydayDay));
  }

  let nextYear = start.getFullYear();
  let nextMonth = start.getMonth() + 1;
  if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
  const nextStart = new Date(nextYear, nextMonth, clampDayForMonth(nextYear, nextMonth, paydayDay));
  const end = addDaysLocal(nextStart, -1);

  return {
    start,
    end,
    nextStart,
    startKey: toDateKey(start),
    endKey: toDateKey(end)
  };
}

function getNextBudgetPeriod(periodStart) {
  const start = startOfLocalDay(periodStart);
  const paydayDay = Math.min(31, Math.max(1, Number(state.payday?.day || 25)));
  let year = start.getFullYear();
  let month = start.getMonth() + 1;
  if (month > 11) { month = 0; year += 1; }
  const nextStart = new Date(year, month, clampDayForMonth(year, month, paydayDay));
  return getBudgetPeriodBounds(nextStart);
}

function getBudgetLimitForPeriod(budget, periodStartKey) {
  const fallback = Math.max(0, Number(budget?.limit || 0));
  const history = Array.isArray(budget?.limitHistory) ? budget.limitHistory : [];
  let value = fallback;
  history.forEach(item => {
    if (item?.effectivePeriodStart <= periodStartKey && Number.isFinite(Number(item.limit))) {
      value = Math.max(0, Number(item.limit || 0));
    }
  });
  return value;
}

function upsertBudgetLimitHistory(budget, periodStartKey, limit) {
  if (!budget) return;
  const normalizedLimit = Math.max(0, Number(limit || 0));
  budget.limitHistory = Array.isArray(budget.limitHistory) ? budget.limitHistory : [];
  const existing = budget.limitHistory.find(item => item.effectivePeriodStart === periodStartKey);
  if (existing) existing.limit = normalizedLimit;
  else budget.limitHistory.push({ effectivePeriodStart: periodStartKey, limit: normalizedLimit });
  budget.limitHistory.sort((a,b) => a.effectivePeriodStart.localeCompare(b.effectivePeriodStart));
}

function getBudgetSpentBetween(budgetId, startDate, endDate) {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  return state.transactions.reduce((sum, tx) => {
    if (tx.type !== 'expense') return sum;
    const date = parseLocalDate(tx.date);
    if (!date || date < start || date > end) return sum;
    const splits = Array.isArray(tx.splits) ? tx.splits.filter(part => Number(part?.amount || 0) > 0) : [];
    const splitTotal = splits.reduce((total, part) => total + Math.max(0, Number(part.amount || 0)), 0);
    const useSplits = splits.length >= 2 && Math.abs(splitTotal - Math.max(0, Number(tx.amount || 0))) <= 1;
    if (useSplits) return sum + splits.filter(part => part.budgetId === budgetId).reduce((total, part) => total + Math.max(0, Number(part.amount || 0)), 0);
    if (tx.budgetId !== budgetId) return sum;
    return sum + Math.max(0, Number(tx.amount || 0));
  }, 0);
}

function calculateBudgetStatus(budget, reference = new Date()) {
  const currentPeriod = getBudgetPeriodBounds(reference);
  const currentQuota = getBudgetLimitForPeriod(budget, currentPeriod.startKey);
  const currentSpent = getBudgetSpentBetween(budget.id, currentPeriod.start, currentPeriod.end);

  if (!budget?.rollover) {
    return {
      rollover: false,
      period: currentPeriod,
      carryIn: 0,
      quota: currentQuota,
      available: currentQuota,
      spent: currentSpent,
      remaining: currentQuota - currentSpent
    };
  }

  const activationDate = parseLocalDate(budget.rolloverStart) || currentPeriod.start;
  let period = getBudgetPeriodBounds(activationDate);
  if (period.start > currentPeriod.start) period = currentPeriod;
  let carry = 0;
  let guard = 0;

  while (period.start <= currentPeriod.start && guard < 240) {
    const quota = getBudgetLimitForPeriod(budget, period.startKey);
    const spent = getBudgetSpentBetween(budget.id, period.start, period.end);
    const available = carry + quota;
    const remaining = available - spent;

    if (period.startKey === currentPeriod.startKey) {
      return {
        rollover: true,
        period,
        carryIn: carry,
        quota,
        available,
        spent,
        remaining
      };
    }

    // Hanya sisa positif yang dibawa. Overspending tidak menjadi "utang budget" periode berikutnya.
    carry = Math.max(0, remaining);
    period = getNextBudgetPeriod(period.start);
    guard += 1;
  }

  return {
    rollover: true,
    period: currentPeriod,
    carryIn: 0,
    quota: currentQuota,
    available: currentQuota,
    spent: currentSpent,
    remaining: currentQuota - currentSpent
  };
}

function createBudgetRecord(name, limit, rollover = true) {
  const period = getBudgetPeriodBounds(new Date());
  const normalizedLimit = Math.max(0, Number(limit || 0));
  return {
    id: generateId(),
    name,
    limit: normalizedLimit,
    rollover: rollover === true,
    rolloverStart: rollover ? period.startKey : '',
    limitHistory: rollover ? [{ effectivePeriodStart: period.startKey, limit: normalizedLimit }] : []
  };
}

function budgetPeriodLabel(period) {
  return `${formatDateShort(period.startKey)} – ${formatDateShort(period.endKey)}`;
}

function advanceRecurringDate(bill, fromDateKey) {
  const from = parseLocalDate(fromDateKey) || new Date();
  const anchor = parseLocalDate(bill.anchorDate || bill.nextDueDate) || from;
  if (bill.frequency === 'weekly') return toDateKey(addDaysLocal(from, 7));
  if (bill.frequency === 'yearly') {
    const year = from.getFullYear() + 1;
    const month = anchor.getMonth();
    return toDateKey(new Date(year, month, clampDayForMonth(year, month, anchor.getDate())));
  }
  let year = from.getFullYear();
  let month = from.getMonth() + 1;
  if (month > 11) { month = 0; year += 1; }
  return toDateKey(new Date(year, month, clampDayForMonth(year, month, anchor.getDate())));
}

function projectBillOccurrences(bill, startDate, endDate, limit = 100) {
  if (!bill?.active || Number(bill.amount || 0) <= 0) return [];
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  let currentKey = bill.nextDueDate;
  let current = parseLocalDate(currentKey);
  if (!current) return [];
  let guard = 0;
  while (current < start && guard < limit) {
    currentKey = advanceRecurringDate(bill, currentKey);
    current = parseLocalDate(currentKey);
    guard += 1;
  }
  const results = [];
  while (current && current <= end && results.length < limit) {
    results.push({ billId: bill.id, date: currentKey, name: bill.name, amount: Number(bill.amount || 0), accountId: bill.accountId });
    currentKey = advanceRecurringDate(bill, currentKey);
    current = parseLocalDate(currentKey);
  }
  return results;
}

function getUpcomingBillOccurrences(startDate, endDate) {
  return state.recurringBills.flatMap(bill => projectBillOccurrences(bill, startDate, endDate));
}

function getGoalReservedTotal() {
  return state.goals.reduce((sum, goal) => sum + Math.max(0, Number(goal.saved || 0)), 0);
}

function getGoalContributionForMonth(goal, monthKey) {
  return (goal.contributions || []).reduce((sum, item) => {
    if (getMonthKey(item.date) !== monthKey) return sum;
    return sum + (item.type === 'withdraw' ? -Math.abs(Number(item.amount || 0)) : Math.abs(Number(item.amount || 0)));
  }, 0);
}

function getRemainingGoalCommitment(monthKey = getCurrentMonthKey()) {
  return state.goals.reduce((sum, goal) => {
    const target = Math.max(0, Number(goal.monthlyContribution || 0));
    const contributed = Math.max(0, getGoalContributionForMonth(goal, monthKey));
    return sum + Math.max(0, target - contributed);
  }, 0);
}

function calculateSafeSpend() {
  const today = startOfLocalDay(new Date());
  const nextPayday = getNextPaydayDate(today);
  const totalBalance = state.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const billTotal = getUpcomingBillOccurrences(today, nextPayday).reduce((sum, item) => sum + item.amount, 0);
  const reservedGoals = getGoalReservedTotal();
  const goalCommitment = getRemainingGoalCommitment(getCurrentMonthKey());
  const reserve = Math.max(0, Number(state.payday?.safetyReserve || 0));
  const available = totalBalance - billTotal - reservedGoals - goalCommitment - reserve;
  const days = daysBetweenInclusive(today, nextPayday);
  return {
    totalBalance,
    billTotal,
    reservedGoals,
    goalCommitment,
    reserve,
    available,
    days,
    safeToday: available / days,
    nextPayday
  };
}

function calculateForecast() {
  const today = startOfLocalDay(new Date());
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const totalBalance = state.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const upcomingBills = getUpcomingBillOccurrences(today, monthEnd).reduce((sum, item) => sum + item.amount, 0);
  const nextPayday = getNextPaydayDate(today);
  const scheduledIncome = nextPayday <= monthEnd ? Math.max(0, Number(state.payday?.expectedIncome || 0)) : 0;
  const lookbackStart = addDaysLocal(today, -29);
  const variableSpend = state.transactions.reduce((sum, tx) => {
    const date = parseLocalDate(tx.date);
    if (!date || date < lookbackStart || date > today) return sum;
    if (tx.type !== 'expense' || tx.recurringBillId) return sum;
    return sum + Number(tx.amount || 0);
  }, 0);
  const averageDailyVariable = variableSpend / 30;
  const remainingDays = Math.max(0, Math.floor((monthEnd - today) / 86400000));
  const projectedVariable = averageDailyVariable * remainingDays;
  const remainingGoalCommitment = getRemainingGoalCommitment(getCurrentMonthKey());
  const predictedBalance = totalBalance + scheduledIncome - upcomingBills - projectedVariable - remainingGoalCommitment;
  return {
    totalBalance,
    upcomingBills,
    scheduledIncome,
    averageDailyVariable,
    projectedVariable,
    remainingGoalCommitment,
    predictedBalance,
    monthEnd
  };
}

function summarizeTransactions(startDate, endDate) {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  const categorySpend = {};
  const dailySpend = {};
  let income = 0;
  let expense = 0;
  let debt = 0;
  let count = 0;
  state.transactions.forEach(tx => {
    const date = parseLocalDate(tx.date);
    if (!date || date < start || date > end) return;
    const amount = Number(tx.amount || 0);
    count += 1;
    if (tx.type === 'income') income += amount;
    if (tx.type === 'expense') {
      expense += amount;
      const category = getTransactionDisplayCategory(tx);
      categorySpend[category] = (categorySpend[category] || 0) + amount;
      dailySpend[tx.date] = (dailySpend[tx.date] || 0) + amount;
    }
    if (tx.type === 'debt') debt += amount;
  });
  const topCategory = Object.entries(categorySpend).sort((a,b) => b[1] - a[1])[0] || null;
  const topDay = Object.entries(dailySpend).sort((a,b) => b[1] - a[1])[0] || null;
  return { income, expense, debt, net: income - expense - debt, count, categorySpend, dailySpend, topCategory, topDay };
}

function getStartOfWeek(date = new Date()) {
  const value = startOfLocalDay(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value;
}

function getMonthToDateRange(offset = 0) {
  const today = startOfLocalDay(new Date());
  const currentDay = today.getDate();
  const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const maxDay = daysInMonth(start.getFullYear(), start.getMonth());
  const end = new Date(start.getFullYear(), start.getMonth(), Math.min(currentDay, maxDay));
  return { start, end, monthKey: `${start.getFullYear()}-${pad2(start.getMonth()+1)}` };
}

function getBillFrequencyLabel(value) {
  const id = { weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' };
  const en = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  return (state.lang === 'en' ? en : id)[value] || value;
}

function syncPaydayControls() {
  if (!$('payday-day')) return;
  $('payday-day').value = String(state.payday?.day || 25);
  $('payday-income').value = Number(state.payday?.expectedIncome || 0) || '';
  $('payday-reserve').value = Number(state.payday?.safetyReserve || 0) || '';
  const next = getNextPaydayDate();
  $('next-payday-badge').textContent = `${state.lang === 'en' ? 'Next' : 'Berikutnya'}: ${formatDateShort(next)}`;
  $('next-payday-badge').className = 'status-pill neutral';
}

function renderSafeSpendAndForecast() {
  const safe = calculateSafeSpend();
  const safeValue = $('safe-spend-value');
  renderPrivateBalanceMetric(safeValue, Math.max(0, Math.floor(safe.safeToday)), { currency:true });
  if ($('safe-spend-detail')) {
    $('safe-spend-detail').textContent = state.lang === 'en'
      ? `${safe.days} days until payday. Bills ${toRp(safe.billTotal)}, reserved goals ${toRp(safe.reservedGoals)}, minimum reserve ${toRp(safe.reserve)}.`
      : `${safe.days} hari menuju gajian. Tagihan ${toRp(safe.billTotal)}, dana target ${toRp(safe.reservedGoals)}, dan dana minimum ${toRp(safe.reserve)} sudah dicadangkan.`;
  }
  if ($('safe-spend-status')) {
    const status = $('safe-spend-status');
    if (safe.available < 0) {
      status.className = 'status-pill danger';
      status.textContent = state.lang === 'en' ? 'Budget deficit' : 'Dana belum aman';
    } else if (safe.safeToday < 50000) {
      status.className = 'status-pill warning';
      status.textContent = state.lang === 'en' ? 'Spend carefully' : 'Perlu hemat';
    } else {
      status.className = 'status-pill success';
      status.textContent = state.lang === 'en' ? 'Still safe' : 'Masih aman';
    }
  }

  const forecast = calculateForecast();
  renderPrivateBalanceMetric($('forecast-balance-value'), Math.round(forecast.predictedBalance), { currency:true });
  if ($('forecast-detail')) {
    $('forecast-detail').textContent = state.lang === 'en'
      ? `Scheduled income ${toRp(forecast.scheduledIncome)}, upcoming bills ${toRp(forecast.upcomingBills)}, projected variable spending ${toRp(Math.round(forecast.projectedVariable))}.`
      : `Pemasukan terjadwal ${toRp(forecast.scheduledIncome)}, tagihan mendatang ${toRp(forecast.upcomingBills)}, dan proyeksi pengeluaran harian ${toRp(Math.round(forecast.projectedVariable))}.`;
  }
  if ($('forecast-risk')) {
    const risk = $('forecast-risk');
    if (forecast.predictedBalance < 0) {
      risk.className = 'status-pill danger';
      risk.textContent = state.lang === 'en' ? 'Negative forecast' : 'Risiko saldo minus';
    } else if (forecast.predictedBalance < Number(state.payday?.safetyReserve || 0)) {
      risk.className = 'status-pill warning';
      risk.textContent = state.lang === 'en' ? 'Below reserve' : 'Di bawah dana minimum';
    } else {
      risk.className = 'status-pill success';
      risk.textContent = state.lang === 'en' ? 'Healthy forecast' : 'Proyeksi aman';
    }
  }
}

function renderWeeklyRecap() {
  const container = $('weekly-recap-content');
  if (!container) return;
  const today = startOfLocalDay(new Date());
  const currentStart = getStartOfWeek(today);
  const elapsed = Math.floor((today - currentStart) / 86400000);
  const current = summarizeTransactions(currentStart, today);
  const previousStart = addDaysLocal(currentStart, -7);
  const previousEnd = addDaysLocal(previousStart, elapsed);
  const previous = summarizeTransactions(previousStart, previousEnd);
  const change = previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : (current.expense > 0 ? 100 : 0);
  let noSpendDays = 0;
  const noSpendLabels = [];
  for (let i = 0; i <= elapsed; i += 1) {
    const day = addDaysLocal(currentStart, i);
    if (!current.dailySpend[toDateKey(day)]) {
      noSpendDays += 1;
      noSpendLabels.push(day.toLocaleDateString(state.lang === 'en' ? 'en-US' : 'id-ID', { weekday:'short' }));
    }
  }
  const changePositive = change > 0;
  const topName = current.topCategory?.[0] || '-';
  const topValue = current.topCategory?.[1] || 0;
  const topShare = current.expense > 0 ? (topValue / current.expense) * 100 : 0;
  const trendCopy = change === 0
    ? (state.lang === 'en' ? 'Same pace as last week.' : 'Laju pengeluaran sama dengan minggu lalu.')
    : changePositive
      ? (state.lang === 'en' ? 'Spending is higher than the same period last week.' : 'Pengeluaran lebih tinggi dari periode yang sama minggu lalu.')
      : (state.lang === 'en' ? 'Nice, spending is lower than last week.' : 'Bagus, pengeluaran lebih rendah dari minggu lalu.');

  container.className = 'weekly-carousel';
  container.innerHTML = `
    <div class="weekly-carousel-track" id="weekly-carousel-track">
      <article class="weekly-slide">
        <div><span class="weekly-slide-eyebrow">${state.lang === 'en' ? 'This week' : 'Minggu ini'}</span><strong class="weekly-slide-value" id="weekly-expense-value">${toRp(0)}</strong></div>
        <p class="weekly-slide-detail">${state.lang === 'en' ? 'Total expenses recorded from Monday until today.' : 'Total pengeluaran yang tercatat sejak Senin sampai hari ini.'}</p>
      </article>
      <article class="weekly-slide">
        <div><span class="weekly-slide-eyebrow">${state.lang === 'en' ? 'Compared with last week' : 'Dibanding minggu lalu'}</span><strong class="weekly-slide-value" id="weekly-change-value" style="color:${changePositive ? 'var(--danger)' : 'var(--success)'}">0%</strong></div>
        <p class="weekly-slide-detail">${escapeHtml(trendCopy)}</p>
      </article>
      <article class="weekly-slide">
        <div><span class="weekly-slide-eyebrow">${state.lang === 'en' ? 'Top category' : 'Kategori terbesar'}</span><strong class="weekly-slide-value" style="font-size:var(--type-lg)!important;">${escapeHtml(topName)}</strong></div>
        <p class="weekly-slide-detail">${topValue > 0 ? `${toRp(topValue)} · ${topShare.toFixed(1)}% ${state.lang === 'en' ? 'of weekly expenses' : 'dari pengeluaran minggu ini'}` : (state.lang === 'en' ? 'No expense category yet.' : 'Belum ada kategori pengeluaran.')}</p>
      </article>
      <article class="weekly-slide">
        <div><span class="weekly-slide-eyebrow">${state.lang === 'en' ? 'No-spend days' : 'Hari tanpa pengeluaran'}</span><strong class="weekly-slide-value" id="weekly-no-spend-value">0</strong></div>
        <p class="weekly-slide-detail">${noSpendLabels.length ? escapeHtml(noSpendLabels.join(' · ')) : (state.lang === 'en' ? 'No no-spend day yet this week.' : 'Belum ada hari tanpa pengeluaran minggu ini.')}</p>
      </article>
    </div>
    <div class="weekly-carousel-footer">
      <div class="weekly-carousel-dots" id="weekly-carousel-dots">${[0,1,2,3].map(i => `<button type="button" class="weekly-dot${i===0?' active':''}" onclick="goToWeeklyRecapSlide(${i})" aria-label="Slide ${i+1}"></button>`).join('')}</div>
      <div class="weekly-carousel-controls"><button type="button" class="weekly-carousel-btn" onclick="scrollWeeklyRecap(-1)" aria-label="Sebelumnya"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="weekly-carousel-btn" onclick="scrollWeeklyRecap(1)" aria-label="Berikutnya"><i class="fa-solid fa-chevron-right"></i></button></div>
    </div>`;
  renderPrivateBalanceMetric($('weekly-expense-value'), current.expense, { currency:true });
  animateMetricValue($('weekly-change-value'), change, { prefix: change > 0 ? '+' : '', suffix:'%', decimals:1 });
  animateMetricValue($('weekly-no-spend-value'), noSpendDays, { duration:420 });
  requestAnimationFrame(bindWeeklyCarouselScroll);
}

function getWeeklyCarouselIndex() {
  const track = $('weekly-carousel-track');
  if (!track || !track.clientWidth) return 0;
  return Math.max(0, Math.min(3, Math.round(track.scrollLeft / (track.clientWidth + 10))));
}
function syncWeeklyCarouselDots() {
  const index = getWeeklyCarouselIndex();
  document.querySelectorAll('#weekly-carousel-dots .weekly-dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
}
function goToWeeklyRecapSlide(index) {
  const track = $('weekly-carousel-track');
  if (!track) return;
  const slide = track.children[Math.max(0, Math.min(track.children.length - 1, Number(index || 0)))];
  if (slide) {
    const left = slide.offsetLeft - track.offsetLeft;
    track.scrollTo({ left, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  setTimeout(syncWeeklyCarouselDots, 260);
}
function scrollWeeklyRecap(direction) { goToWeeklyRecapSlide(getWeeklyCarouselIndex() + Number(direction || 0)); }
function bindWeeklyCarouselScroll() {
  const track = $('weekly-carousel-track');
  if (!track || track.dataset.bound === '1') return;
  track.dataset.bound = '1';
  let timer = 0;
  track.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(syncWeeklyCarouselDots, 60); }, { passive:true });
}

function renderMonthComparison() {
  const container = $('month-comparison-content');
  if (!container) return;
  const currentRange = getMonthToDateRange(0);
  const previousRange = getMonthToDateRange(-1);
  const current = summarizeTransactions(currentRange.start, currentRange.end);
  const previous = summarizeTransactions(previousRange.start, previousRange.end);
  const expenseChange = previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : (current.expense > 0 ? 100 : 0);
  const currentLabel = formatMonthLabel(currentRange.monthKey);
  const previousLabel = formatMonthLabel(previousRange.monthKey);
  container.innerHTML = `
    <div class="comparison-columns">
      <div class="comparison-month"><span>${escapeHtml(currentLabel)}</span><strong>${toRp(current.expense)}</strong><span>${state.lang === 'en' ? 'expenses' : 'pengeluaran'}</span></div>
      <div class="comparison-month"><span>${escapeHtml(previousLabel)}</span><strong>${toRp(previous.expense)}</strong><span>${state.lang === 'en' ? 'expenses' : 'pengeluaran'}</span></div>
    </div>
    <div class="comparison-list">
      <div class="comparison-row"><span>${state.lang === 'en' ? 'Expense change' : 'Perubahan pengeluaran'}</span><strong style="color:${expenseChange > 0 ? 'var(--danger)' : 'var(--success)'}">${expenseChange > 0 ? '+' : ''}${expenseChange.toFixed(1)}%</strong></div>
      <div class="comparison-row"><span>${state.lang === 'en' ? 'Income this month' : 'Pemasukan bulan ini'}</span><strong>${toRp(current.income)}</strong></div>
      <div class="comparison-row"><span>${state.lang === 'en' ? 'Current net cashflow' : 'Arus kas bersih bulan ini'}</span><strong style="color:${current.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${toRp(current.net)}</strong></div>
      <div class="comparison-row"><span>${state.lang === 'en' ? 'Top category' : 'Kategori terbesar'}</span><strong>${current.topCategory ? escapeHtml(current.topCategory[0]) : '-'}</strong></div>
    </div>
  `;
}

function openRecurringBillModal(id = null) {
  $('form-recurring-bill').reset();
  $('recurring-bill-id').value = '';
  $('recurring-bill-active').checked = true;
  $('recurring-bill-category').value = 'Tagihan';
  $('recurring-bill-frequency').value = 'monthly';
  $('recurring-bill-next-date').value = toDateKey(new Date());
  $('recurring-bill-account').innerHTML = state.accounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)} (${toRp(account.balance)})</option>`).join('');
  $('recurring-bill-modal-title').textContent = id ? 'Edit Tagihan Berulang' : 'Tambah Tagihan Berulang';
  if (id) {
    const bill = state.recurringBills.find(item => item.id === id);
    if (!bill) return;
    $('recurring-bill-id').value = bill.id;
    $('recurring-bill-name').value = bill.name;
    $('recurring-bill-amount').value = bill.amount;
    $('recurring-bill-category').value = bill.category;
    $('recurring-bill-account').value = bill.accountId;
    $('recurring-bill-frequency').value = bill.frequency;
    $('recurring-bill-next-date').value = bill.nextDueDate;
    $('recurring-bill-active').checked = bill.active;
  }
  openModal('modal-recurring-bill');
}

function deleteRecurringBill(id) {
  const bill = state.recurringBills.find(item => item.id === id);
  if (!bill) return;
  const before = cloneFinanceSnapshot();
  state.recurringBills = state.recurringBills.filter(item => item.id !== id);
  saveData();
  render();
  showUndoToast(`Tagihan “${bill.name}” dihapus.`, before);
}

function markRecurringBillPaid(id) {
  const bill = state.recurringBills.find(item => item.id === id);
  if (!bill) return;
  const before = cloneFinanceSnapshot();
  const account = state.accounts.find(item => item.id === bill.accountId);
  if (!account) return showToast('Dompet pembayaran tidak ditemukan. Edit tagihan terlebih dahulu.', true);
  if (!confirm(`Tandai ${bill.name} sebesar ${toRp(bill.amount)} sudah dibayar dari ${account.name}?`)) return;
  const todayKey = toDateKey(new Date());
  const tx = {
    id: generateId(), type: 'expense', amount: Number(bill.amount || 0), category: bill.category || bill.name,
    accountId: bill.accountId, date: todayKey, budgetId: null, accountToId: null, recurringBillId: bill.id
  };
  state.transactions.push(tx);
  applyBalance(tx);
  bill.lastPaidDate = todayKey;
  bill.lastPaidAmount = Number(bill.amount || 0);
  let nextKey = advanceRecurringDate(bill, bill.nextDueDate);
  let guard = 0;
  while ((parseLocalDate(nextKey) || new Date()) <= startOfLocalDay(new Date()) && guard < 60) {
    nextKey = advanceRecurringDate(bill, nextKey);
    guard += 1;
  }
  bill.nextDueDate = nextKey;
  saveData();
  render();
  showUndoToast('Tagihan dicatat sebagai pengeluaran dan jadwal berikutnya diperbarui.', before);
}

function renderRecurringBills() {
  const container = $('recurring-bill-list');
  if (!container) return;
  if (!state.recurringBills.length) {
    container.innerHTML = '<div class="empty-action-state"><strong>Belum ada tagihan berulang</strong><p>Tambahkan kewajiban rutin agar prediksi saldo memperhitungkan pembayaran yang akan datang.</p><button type="button" onclick="openRecurringBillModal()">Tambah Tagihan</button></div>';
    return;
  }
  const sorted = [...state.recurringBills].sort((a,b) => String(a.nextDueDate).localeCompare(String(b.nextDueDate)));
  container.innerHTML = sorted.map(bill => {
    const account = state.accounts.find(item => item.id === bill.accountId);
    const due = parseLocalDate(bill.nextDueDate);
    const today = startOfLocalDay(new Date());
    const overdue = bill.active && due && due < today;
    const dueSoon = bill.active && due && due >= today && due <= addDaysLocal(today, 7);
    const badgeClass = !bill.active ? 'neutral' : overdue ? 'danger' : dueSoon ? 'warning' : 'success';
    const badgeText = !bill.active ? 'Nonaktif' : overdue ? 'Terlambat' : dueSoon ? 'Segera jatuh tempo' : 'Terjadwal';
    return `<div class="bill-item">
      <div class="bill-main">
        <div>
          <div class="bill-title">${escapeHtml(bill.name)}</div>
          <div class="bill-meta">${getBillFrequencyLabel(bill.frequency)} · ${escapeHtml(account?.name || 'Dompet tidak ditemukan')} · jatuh tempo ${formatDateShort(bill.nextDueDate)}</div>
        </div>
        <div><div class="bill-amount">${toRp(bill.amount)}</div><span class="status-pill ${badgeClass}" style="margin-top:7px;">${badgeText}</span></div>
      </div>
      <div class="bill-actions">
        <button type="button" class="mini-action primary" onclick="markRecurringBillPaid('${bill.id}')" ${bill.active ? '' : 'disabled'}><i class="fa-solid fa-check"></i> Bayar</button>
        <button type="button" class="mini-action" onclick="openRecurringBillModal('${bill.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button type="button" class="mini-action danger" onclick="deleteRecurringBill('${bill.id}')"><i class="fa-solid fa-trash"></i> Hapus</button>
      </div>
    </div>`;
  }).join('');
}

function openGoalModal(id = null) {
  $('form-goal').reset();
  $('goal-id').value = '';
  $('goal-emoji').value = '🎯';
  $('goal-modal-title').textContent = id ? 'Edit Target Tabungan' : 'Buat Target Tabungan';
  if (id) {
    const goal = state.goals.find(item => item.id === id);
    if (!goal) return;
    $('goal-id').value = goal.id;
    $('goal-name').value = goal.name;
    $('goal-emoji').value = goal.emoji;
    $('goal-target').value = goal.target;
    $('goal-saved').value = goal.saved;
    $('goal-deadline').value = goal.deadline || '';
    $('goal-monthly').value = goal.monthlyContribution || '';
  }
  openModal('modal-goal');
}

function openGoalContributionModal(id, mode = 'deposit') {
  const goal = state.goals.find(item => item.id === id);
  if (!goal) return;
  $('form-goal-contribution').reset();
  $('goal-contribution-goal-id').value = id;
  $('goal-contribution-mode').value = mode === 'withdraw' ? 'withdraw' : 'deposit';
  $('goal-contribution-date').value = toDateKey(new Date());
  $('goal-contribution-title').textContent = mode === 'withdraw' ? `Tarik Dana · ${goal.name}` : `Tambah Setoran · ${goal.name}`;
  $('goal-contribution-submit').textContent = mode === 'withdraw' ? 'Simpan Penarikan' : 'Simpan Setoran';
  openModal('modal-goal-contribution');
}

function deleteGoal(id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal) return;
  const before = cloneFinanceSnapshot();
  state.goals = state.goals.filter(item => item.id !== id);
  saveData();
  render();
  showUndoToast(`Target “${goal.name}” dihapus.`, before);
}

function renderGoals() {
  const container = $('goal-list');
  if (!container) return;
  if (!state.goals.length) {
    container.innerHTML = '<div class="empty-action-state"><strong>Belum ada target tabungan</strong><p>Buat tujuan yang jelas agar uang yang disisihkan tidak terasa seperti saldo bebas.</p><button type="button" onclick="openGoalModal()">Buat Target</button></div>';
    return;
  }
  container.innerHTML = [...state.goals].sort((a,b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))).map(goal => {
    const progress = Math.max(0, Math.min(100, (Number(goal.saved || 0) / Math.max(1, Number(goal.target || 1))) * 100));
    const remaining = Math.max(0, Number(goal.target || 0) - Number(goal.saved || 0));
    let estimate = '-';
    if (remaining <= 0) estimate = 'Target tercapai';
    else if (goal.monthlyContribution > 0) estimate = `± ${Math.ceil(remaining / goal.monthlyContribution)} bulan lagi`;
    const recent = (goal.contributions || []).slice(-3).reverse();
    return `<div class="goal-item">
      <div class="goal-main">
        <div>
          <div class="goal-title">${escapeHtml(goal.emoji)} ${escapeHtml(goal.name)}</div>
          <div class="goal-meta">${goal.deadline ? `Deadline ${formatDateShort(goal.deadline)} · ` : ''}${estimate}</div>
        </div>
        <div class="goal-amount">${toRp(goal.saved)}<div class="goal-meta">dari ${toRp(goal.target)}</div></div>
      </div>
      <div class="goal-progress"><span style="width:${progress.toFixed(1)}%"></span></div>
      <div class="goal-meta" style="display:flex;justify-content:space-between;gap:12px;margin-top:7px;"><span>${progress.toFixed(1)}%</span><span>Sisa ${toRp(remaining)}</span></div>
      ${recent.length ? `<div class="goal-history">${recent.map(item => `<div class="goal-history-row"><span>${formatDateShort(item.date)} · ${escapeHtml(item.note || (item.type === 'withdraw' ? 'Penarikan' : 'Setoran'))}</span><strong style="color:${item.type === 'withdraw' ? 'var(--danger)' : 'var(--success)'}">${item.type === 'withdraw' ? '-' : '+'}${toRp(Math.abs(item.amount))}</strong></div>`).join('')}</div>` : ''}
      <div class="goal-actions">
        <button type="button" class="mini-action primary" onclick="openGoalContributionModal('${goal.id}','deposit')"><i class="fa-solid fa-plus"></i> Setor</button>
        <button type="button" class="mini-action" onclick="openGoalContributionModal('${goal.id}','withdraw')" ${goal.saved > 0 ? '' : 'disabled'}><i class="fa-solid fa-minus"></i> Tarik</button>
        <button type="button" class="mini-action" onclick="openGoalModal('${goal.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button type="button" class="mini-action danger" onclick="deleteGoal('${goal.id}')"><i class="fa-solid fa-trash"></i> Hapus</button>
      </div>
    </div>`;
  }).join('');
}

function getCalendarEvents(year, monthIndex) {
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const events = [];
  state.transactions.forEach(tx => {
    const date = parseLocalDate(tx.date);
    if (!date || date < monthStart || date > monthEnd) return;
    events.push({ date: tx.date, type: tx.type === 'income' ? 'income' : 'expense', label: tx.category, amount: Number(tx.amount || 0) });
  });
  const paydayDay = clampDayForMonth(year, monthIndex, state.payday?.day || 25);
  events.push({ date: toDateKey(new Date(year, monthIndex, paydayDay)), type: 'payday', label: 'Tanggal gajian', amount: Number(state.payday?.expectedIncome || 0) });
  getUpcomingBillOccurrences(monthStart, monthEnd).forEach(item => events.push({ date: item.date, type: 'bill', label: item.name, amount: item.amount }));
  state.goals.forEach(goal => {
    if (goal.deadline && getMonthKey(goal.deadline) === `${year}-${pad2(monthIndex + 1)}`) events.push({ date: goal.deadline, type: 'goal', label: `Deadline ${goal.name}`, amount: goal.target });
  });
  return events.sort((a,b) => a.date.localeCompare(b.date));
}

function renderFinancialCalendar() {
  const calendar = $('finance-calendar');
  const agenda = $('calendar-agenda');
  if (!calendar || !agenda) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('calendar-title').textContent = new Date(year, month, 1).toLocaleDateString(state.lang === 'en' ? 'en-US' : 'id-ID', { month: 'long', year: 'numeric' });
  const events = getCalendarEvents(year, month);
  const eventMap = events.reduce((map, event) => {
    (map[event.date] ||= []).push(event);
    return map;
  }, {});
  const weekdays = state.lang === 'en' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
  let html = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDaysLocal(first, -mondayOffset);
  const todayKey = toDateKey(new Date());
  for (let i = 0; i < 42; i += 1) {
    const date = addDaysLocal(gridStart, i);
    const key = toDateKey(date);
    const dayEvents = eventMap[key] || [];
    const className = ['calendar-day', date.getMonth() !== month ? 'muted' : '', key === todayKey ? 'today' : ''].filter(Boolean).join(' ');
    html += `<div class="${className}"><div class="calendar-day-number">${date.getDate()}</div>${dayEvents.slice(0,3).map(event => `<span class="calendar-event ${event.type}" title="${escapeHtml(event.label)}">${escapeHtml(event.label)}</span>`).join('')}${dayEvents.length > 3 ? `<span class="calendar-event">+${dayEvents.length - 3}</span>` : ''}</div>`;
  }
  calendar.innerHTML = html;
  const futureEvents = events.filter(event => parseLocalDate(event.date) >= startOfLocalDay(new Date())).slice(0, 8);
  agenda.innerHTML = futureEvents.length ? futureEvents.map(event => `<div class="agenda-row"><span class="agenda-date">${formatDateShort(event.date)}</span><span class="agenda-label">${escapeHtml(event.label)}</span><span class="agenda-amount" style="color:${event.type === 'income' || event.type === 'payday' ? 'var(--success)' : event.type === 'expense' || event.type === 'bill' ? 'var(--danger)' : 'var(--primary)'}">${event.amount ? toRp(event.amount) : ''}</span></div>`).join('') : '<div class="empty-planner-state">Tidak ada agenda keuangan mendatang pada bulan ini.</div>';
}

function moveCalendarMonth(offset) {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(offset || 0), 1);
  renderFinancialCalendar();
}

function renderPlanning() {
  syncPaydayControls();
  renderRecurringBills();
  renderGoals();
  renderFinancialCalendar();
  renderSafeSpendAndForecast();
  renderWeeklyRecap();
  renderMonthComparison();
}

// ================= UI CONTROLS =================
function applyTheme() {
  const root = document.documentElement;
  const systemDark = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const isDark = state.adaptiveTheme === true ? systemDark : state.theme === 'dark';
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  root.setAttribute('data-theme-mode', state.adaptiveTheme ? 'adaptive' : 'manual');

  const base = isDark
    ? { bg: '#06101F', surface: '#0F1B2D', textMain: '#F8FAFC', textMuted: '#94A3B8', border: 'rgba(148,163,184,.18)', navAlpha: .78 }
    : { bg: '#F3F6FB', surface: '#FFFFFF', textMain: '#0F172A', textMuted: '#64748B', border: 'rgba(15,23,42,.1)', navAlpha: .88 };

  const custom = state.customTheme || {};
  const chosenBg = custom.enabled ? custom.bg : base.bg;
  const chosenSurface = custom.enabled ? custom.surface : base.surface;
  const bg = custom.enabled && isDark ? blendHex(chosenBg, '#020617', .72) : chosenBg;
  const surface = custom.enabled && isDark ? blendHex(chosenSurface, '#0F172A', .72) : chosenSurface;
  const primary = custom.enabled ? custom.primary : (isDark ? '#7C83FF' : '#4F46E5');
  const textMain = custom.enabled ? readableText(surface) : base.textMain;
  const textMuted = custom.enabled ? (textMain === '#0F172A' ? '#64748B' : '#CBD5E1') : base.textMuted;
  const border = custom.enabled ? (textMain === '#0F172A' ? 'rgba(15,23,42,.12)' : 'rgba(248,250,252,.16)') : base.border;
  const primaryRgb = hexToRgb(primary);
  const navRgb = hexToRgb(surface);

  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-soft', `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, .16)`);
  root.style.setProperty('--bg', bg);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--text-main', textMain);
  root.style.setProperty('--text-muted', textMuted);
  root.style.setProperty('--border-color', border);
  root.style.setProperty('--nav-bg', `rgba(${navRgb.r}, ${navRgb.g}, ${navRgb.b}, ${custom.enabled ? .84 : base.navAlpha})`);
  root.style.setProperty('--wallpaper-image', 'none');

  if ($('theme-toggle')) {
    $('theme-toggle').checked = isDark;
    $('theme-toggle').disabled = state.adaptiveTheme === true;
  }
  if ($('adaptive-theme-toggle')) $('adaptive-theme-toggle').checked = state.adaptiveTheme === true;
  if ($('adaptive-theme-status')) $('adaptive-theme-status').textContent = state.adaptiveTheme
    ? `${state.lang === 'en' ? 'Following device' : 'Mengikuti perangkat'} · ${isDark ? (state.lang === 'en' ? 'Dark' : 'Gelap') : (state.lang === 'en' ? 'Light' : 'Terang')}`
    : (state.lang === 'en' ? 'Use your device light/dark preference automatically.' : 'Gunakan mode terang/gelap dari perangkat secara otomatis.');
  syncThemeControls();
  updateGreeting();
  document.body.style.backgroundColor = bg;
  if ($('pwa-theme-color')) $('pwa-theme-color').setAttribute('content', primary);
}
function toggleTheme() {
  if (state.adaptiveTheme) return applyTheme();
  state.theme = $('theme-toggle').checked ? 'dark' : 'light';
  saveData();
  applyTheme();
  render();
}
function toggleAdaptiveTheme() {
  state.adaptiveTheme = Boolean($('adaptive-theme-toggle')?.checked);
  if (state.adaptiveTheme) {
    state.theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  saveData();
  applyTheme();
  render();
  showToast(state.adaptiveTheme ? 'Tema sekarang mengikuti perangkat.' : 'Tema adaptif dimatikan.');
}

function applyLanguageText() {
  const keys = Object.keys(langDict.id).filter(k => k.startsWith('t_'));
  keys.forEach(k => { if($(k)) $(k).innerHTML = langDict[state.lang][k]; });
  $('lang-select').value = state.lang;
  updateTxType($('tx-type').value);
  updateGreeting();
  updateBalanceVisibilityControl();
}

function changeLanguage() {
  state.lang = $('lang-select').value;
  saveData(); applyLanguageText(); render();
}


function updateGreeting() {
  const name = state.user?.name || (state.lang === 'en' ? 'User' : 'Pengguna');
  const emoji = state.user?.emoji || state.customTheme?.appEmoji || '💸';
  if ($('t_greeting')) $('t_greeting').textContent = state.lang === 'en' ? 'Hello' : 'Halo';
  if ($('t_month_title')) $('t_month_title').textContent = name;
  if ($('profile-pic')) $('profile-pic').textContent = emoji || name.slice(0,2).toUpperCase();
  if ($('profile-menu-name')) $('profile-menu-name').textContent = name;
  if ($('profile-menu-email')) $('profile-menu-email').textContent = activeUserEmail || 'Belum login';
}

function openProfileModal() {
  if (!activeUserId) return openModal('modal-login');
  $('profile-name-modal').value = state.user?.name || '';
  $('profile-emoji-modal').value = state.user?.emoji || '💸';
  openModal('modal-profile');
}

async function persistProfile(name, emoji) {
  state.user = { name, emoji };
  saveData();
  updateGreeting();
  syncThemeControls();
  if (supabaseClient && activeUserId) {
    const { error } = await supabaseClient.auth.updateUser({
      data: { display_name: name, emoji }
    });
    if (error) console.warn('Metadata profil gagal diperbarui:', error);
  }
}

async function saveProfileSettings() {
  const name = safeText($('setting-user-name').value, 40);
  const emoji = safeText($('setting-user-emoji').value, 8) || '💸';
  if (!name) return alert('Nama tidak boleh kosong.');
  await persistProfile(name, emoji);
  showToast('Profil tersimpan.');
}

function updateThemeDots() {
  const mapping = { primary:'dot-primary', bg:'dot-bg', surface:'dot-surface' };
  Object.entries(mapping).forEach(([key,id]) => {
    const dot = $(id);
    if (dot) dot.style.background = state.customTheme[key];
  });
}

function syncThemeControls() {
  if (!$('theme-primary')) return;
  $('theme-primary').value = state.customTheme.primary;
  $('theme-bg').value = state.customTheme.bg;
  $('theme-surface').value = state.customTheme.surface;
  $('theme-emoji').value = state.customTheme.appEmoji;
  $('setting-user-name').value = state.user?.name || '';
  $('setting-user-emoji').value = state.user?.emoji || '💸';
  if ($('adaptive-theme-toggle')) $('adaptive-theme-toggle').checked = state.adaptiveTheme === true;
  updateThemeDots();
}

function markThemeLive() {
  state.customTheme.enabled = true;
  state.customTheme.primary = validHex($('theme-primary').value) ? $('theme-primary').value.toUpperCase() : state.customTheme.primary;
  state.customTheme.bg = validHex($('theme-bg').value) ? $('theme-bg').value.toUpperCase() : state.customTheme.bg;
  state.customTheme.surface = validHex($('theme-surface').value) ? $('theme-surface').value.toUpperCase() : state.customTheme.surface;
  state.customTheme.appEmoji = safeText($('theme-emoji').value, 8) || '💸';
  applyTheme();
  updateThemeDots();
  scheduleThemePersist();
}

function bindThemePreviewControls() {
  const emoji = $('theme-emoji');
  if (emoji && emoji.dataset.bound !== '1') {
    emoji.dataset.bound = '1';
    emoji.addEventListener('input', markThemeLive);
  }
}

function saveCustomTheme() {
  markThemeLive();
  persistThemeState();
  saveData(false);
  showToast('Tema tersimpan dan akan tetap aktif saat kamu masuk lagi.');
}

function resetCustomTheme() {
  state.customTheme = { enabled: false, primary: '#4F46E5', bg: '#F2F4F7', surface: '#FFFFFF', wallpaper: '', appEmoji: '💸' };
  state.theme = 'light';
  syncThemeControls();
  persistThemeState();
  saveData(false);
  applyTheme();
  selectThemeTarget('primary');
  showToast('Tema dikembalikan ke pengaturan awal.');
}

function showToast(message, isError = false, options = {}) {
  announceStatus(message);
  let stack = $('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack'; stack.className = 'toast-stack'; stack.setAttribute('aria-live','polite');
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  const duration = Math.max(1600, Number(options.duration || 3200));
  const hasAction = typeof options.onAction === 'function' && options.actionLabel;
  toast.className = `modern-toast${isError ? ' error' : ''}${hasAction ? ' has-action' : ''}`;
  toast.style.setProperty('--toast-duration', `${duration}ms`);
  const title = options.title || (isError ? (state.lang === 'en' ? 'Something went wrong' : 'Terjadi masalah') : (state.lang === 'en' ? 'Done' : 'Berhasil'));
  const icon = options.icon || (isError ? 'fa-triangle-exclamation' : 'fa-circle-check');
  toast.innerHTML = `
    <span class="modern-toast-icon"><i class="fa-solid ${icon}"></i></span>
    <span class="modern-toast-copy"><strong class="modern-toast-title"></strong><span class="modern-toast-message"></span></span>
    ${hasAction ? '<button type="button" class="modern-toast-action"></button>' : ''}
    <button type="button" class="modern-toast-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
    <span class="modern-toast-progress"></span>`;
  toast.querySelector('.modern-toast-title').textContent = title;
  toast.querySelector('.modern-toast-message').textContent = privacyModeEnabled ? maskCurrencyText(String(message || '')) : String(message || '');
  const dismiss = () => {
    if (toast.dataset.closing === '1') return;
    toast.dataset.closing = '1';
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 260);
  };
  toast.querySelector('.modern-toast-close').addEventListener('click', dismiss);
  if (hasAction) {
    const action = toast.querySelector('.modern-toast-action');
    action.textContent = String(options.actionLabel);
    action.addEventListener('click', () => {
      dismiss();
      options.onAction();
    });
  }
  stack.appendChild(toast);
  while (stack.children.length > 4) stack.firstElementChild?.remove();
  requestAnimationFrame(() => { toast.classList.add('show'); applyPrivacyModeToDOM(); });
  setTimeout(dismiss, duration);
  return toast;
}

let pendingUndoAction = null;
let pendingUndoTimer = 0;

function cloneFinanceSnapshot() {
  return JSON.parse(JSON.stringify(state));
}

function stateFingerprint(value = state) {
  try { return JSON.stringify(value); } catch { return ''; }
}

function showUndoToast(message, beforeSnapshot) {
  clearTimeout(pendingUndoTimer);
  pendingUndoAction = {
    before: JSON.parse(JSON.stringify(beforeSnapshot)),
    afterFingerprint: stateFingerprint(state)
  };
  pendingUndoTimer = setTimeout(() => { pendingUndoAction = null; }, 7200);
  showToast(message, false, {
    duration: 7000,
    title: state.lang === 'en' ? 'Saved' : 'Perubahan disimpan',
    icon: 'fa-rotate-left',
    actionLabel: state.lang === 'en' ? 'UNDO' : 'URUNGKAN',
    onAction: undoLastAction
  });
}

function undoLastAction() {
  if (!pendingUndoAction) return showToast('Waktu untuk mengurungkan sudah habis.', true);
  if (stateFingerprint(state) !== pendingUndoAction.afterFingerprint) {
    pendingUndoAction = null;
    clearTimeout(pendingUndoTimer);
    return showToast('Data sudah berubah lagi. Urungkan dibatalkan agar perubahan terbaru tidak ikut hilang.', true);
  }
  const snapshot = pendingUndoAction.before;
  pendingUndoAction = null;
  clearTimeout(pendingUndoTimer);
  clearTimeout(cloudSyncTimer);
  state = normalizeFinanceState(snapshot, getSavedThemeSnapshot());
  saveData();
  applyTheme();
  render();
  showToast('Perubahan berhasil diurungkan.', false, { icon:'fa-arrow-rotate-left' });
}

function setWheelFromHex(hex, redraw = true) {
  const hsv = hexToHsv(hex);
  wheelHue = hsv.h;
  wheelSaturation = hsv.s;
  wheelValue = hsv.v;
  if ($('theme-brightness')) $('theme-brightness').value = String(Math.round(wheelValue * 100));
  if ($('theme-hex')) $('theme-hex').value = hex.toUpperCase();
  if (redraw) drawThemeColorWheel();
  positionWheelCursor();
  updateSelectedColorPreview(hex);
}

function currentWheelHex() {
  const {r,g,b} = hsvToRgb(wheelHue, wheelSaturation, wheelValue);
  return rgbToHex(r,g,b);
}

function drawThemeColorWheel() {
  const canvas = $('theme-color-wheel');
  if (!canvas) return;
  cancelAnimationFrame(wheelDrawFrame);
  wheelDrawFrame = requestAnimationFrame(() => {
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    const width = canvas.width;
    const height = canvas.height;
    const cx = width/2, cy = height/2, radius = Math.min(cx,cy)-3;
    const image = ctx.createImageData(width,height);
    for (let y=0; y<height; y++) {
      for (let x=0; x<width; x++) {
        const dx=x-cx, dy=y-cy;
        const distance=Math.sqrt(dx*dx+dy*dy);
        const index=(y*width+x)*4;
        if (distance <= radius) {
          let hue=Math.atan2(dy,dx)*180/Math.PI;
          if (hue<0) hue+=360;
          const saturation=Math.min(1,distance/radius);
          const rgb=hsvToRgb(hue,saturation,wheelValue);
          image.data[index]=rgb.r;
          image.data[index+1]=rgb.g;
          image.data[index+2]=rgb.b;
          image.data[index+3]=255;
        } else {
          image.data[index+3]=0;
        }
      }
    }
    ctx.clearRect(0,0,width,height);
    ctx.putImageData(image,0,0);
    ctx.beginPath();
    ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,.5)';
    ctx.lineWidth=3;
    ctx.stroke();
    updateBrightnessTrack();
  });
}

function positionWheelCursor() {
  const canvas = $('theme-color-wheel');
  const cursor = $('color-wheel-cursor');
  if (!canvas || !cursor) return;
  const rendered = canvas.getBoundingClientRect();
  const radius = rendered.width/2;
  const angle = wheelHue*Math.PI/180;
  const distance = wheelSaturation*(radius-3);
  cursor.style.left = `${radius + Math.cos(angle)*distance}px`;
  cursor.style.top = `${radius + Math.sin(angle)*distance}px`;
}

function updateBrightnessTrack() {
  const slider = $('theme-brightness');
  if (!slider) return;
  const dark = hsvToRgb(wheelHue,wheelSaturation,.15);
  const bright = hsvToRgb(wheelHue,wheelSaturation,1);
  slider.style.background = `linear-gradient(90deg, ${rgbToHex(dark.r,dark.g,dark.b)}, ${rgbToHex(bright.r,bright.g,bright.b)})`;
}

function updateSelectedColorPreview(hex) {
  const preview = $('selected-color-preview');
  if (!preview) return;
  preview.style.background = hex;
  preview.style.color = readableText(hex);
  $('selected-color-name').textContent = themeTargetLabel(activeThemeTarget);
  $('selected-color-code').textContent = hex.toUpperCase();
  preview.classList.remove('flash');
  requestAnimationFrame(() => preview.classList.add('flash'));
}

function applyWheelColor(hex = currentWheelHex()) {
  if (!validHex(hex)) return;
  const normalized = hex.toUpperCase();
  state.customTheme.enabled = true;
  state.customTheme[activeThemeTarget] = normalized;
  const input = $(`theme-${activeThemeTarget}`);
  if (input) input.value = normalized;
  if ($('theme-hex')) $('theme-hex').value = normalized;
  updateSelectedColorPreview(normalized);
  updateThemeDots();
  applyTheme();
  scheduleThemePersist();
}

function selectThemeTarget(target) {
  if (!['primary','bg','surface'].includes(target)) return;
  activeThemeTarget = target;
  document.querySelectorAll('.theme-target').forEach(button => button.classList.toggle('active', button.dataset.themeTarget === target));
  const hex = state.customTheme[target];
  setWheelFromHex(hex);
}

function applyThemePreset(hex) {
  setWheelFromHex(hex);
  applyWheelColor(hex);
}

function updateWheelFromPointer(event) {
  const canvas = $('theme-color-wheel');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const cx = rect.width/2, cy = rect.height/2;
  const dx=x-cx, dy=y-cy;
  const radius=rect.width/2;
  const distance=Math.min(radius,Math.sqrt(dx*dx+dy*dy));
  let hue=Math.atan2(dy,dx)*180/Math.PI;
  if (hue<0) hue+=360;
  wheelHue=hue;
  wheelSaturation=Math.min(1,distance/radius);
  positionWheelCursor();
  applyWheelColor();
}

function initThemeColorWheel() {
  const canvas = $('theme-color-wheel');
  if (!canvas || canvas.dataset.bound === '1') return;
  canvas.dataset.bound='1';
  let dragging=false;
  canvas.addEventListener('pointerdown', event => {
    dragging=true;
    canvas.setPointerCapture(event.pointerId);
    updateWheelFromPointer(event);
  });
  canvas.addEventListener('pointermove', event => { if (dragging) updateWheelFromPointer(event); });
  canvas.addEventListener('pointerup', event => { dragging=false; try { canvas.releasePointerCapture(event.pointerId); } catch {} });
  canvas.addEventListener('pointercancel', () => { dragging=false; });

  $('theme-brightness').addEventListener('input', event => {
    wheelValue = Math.max(.15, Number(event.target.value)/100);
    drawThemeColorWheel();
    applyWheelColor();
  });
  $('theme-hex').addEventListener('change', event => {
    const value = event.target.value.trim();
    if (!validHex(value)) {
      showToast('Kode warna harus seperti #4F46E5.', true);
      event.target.value = state.customTheme[activeThemeTarget];
      return;
    }
    setWheelFromHex(value.toUpperCase());
    applyWheelColor(value.toUpperCase());
  });
  window.addEventListener('resize', positionWheelCursor, { passive:true });
  selectThemeTarget('primary');
}

function bindInteractiveEffects() {
  document.addEventListener('pointerdown', event => {
    const host = event.target.closest('button, .nav-item, .tx-item, .wallet-card');
    if (!host || host.classList.contains('theme-preset')) return;
    host.classList.add('ripple-host');
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width,rect.height)*1.8;
    const ripple = document.createElement('span');
    ripple.className='ui-ripple';
    ripple.style.width=ripple.style.height=`${size}px`;
    ripple.style.left=`${event.clientX-rect.left}px`;
    ripple.style.top=`${event.clientY-rect.top}px`;
    host.appendChild(ripple);
    ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});
  }, {passive:true});
}

async function confirmReset() {
  const confirmed = confirm(
    '⚠️ PERINGATAN!\n\nSemua transaksi, dompet, budget, chat, cache perangkat, dan data Supabase akun ini akan dihapus permanen.'
  );
  if (!confirmed) return;

  if (supabaseClient && activeUserId) {
    updateCloudStatus('syncing');
    const { error } = await supabaseClient
      .from(CLOUD_TABLE)
      .delete()
      .eq('user_id', activeUserId);
    if (error) {
      updateCloudStatus('error', error.message);
      return showToast(`Gagal menghapus data cloud: ${error.message}`, true);
    }
  }

  localStorage.removeItem(getUserCacheKey());
  localStorage.removeItem(getUserCacheMetaKey());
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_OWNER_KEY);
  localStorage.removeItem('KITA_TABUNG_ACTIVE_TAB');
  localStorage.removeItem(THEME_STORAGE_KEY);

  state = normalizeFinanceState(null, null);
  cloudReady = true;
  saveLocalCache();
  if (activeUserId) await saveCloudState({ force: true });
  location.reload();
}

function go(viewId) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  const targetView = $(`view-${viewId}`);
  const targetNav = document.querySelector(`.nav-item[data-target="${viewId}"]`);
  
  if (targetView && targetNav) {
    targetView.classList.add('active');
    targetNav.classList.add('active');
    localStorage.setItem('KITA_TABUNG_ACTIVE_TAB', viewId);
    const main = document.querySelector('.main-content');
    if (main) main.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    // Fallback if view not found
    $('view-home').classList.add('active');
    document.querySelector(`.nav-item[data-target="home"]`).classList.add('active');
  }
  render();
}


// ================= SMART CATEGORY =================
const SMART_CATEGORY_RULES = [
  { label:'Makanan & Minuman', keywords:['gofood','grabfood','shopeefood','makan','makanan','minum','kopi','coffee','starbucks','restoran','restaurant','warung','bakso','mie','nasi','ayam','burger','pizza','cafe','kafe'] },
  { label:'Transportasi', keywords:['pertamina','shell','bensin','bbm','parkir','parking','tol','gojek','grabcar','grab bike','grab bike','kereta','kai','travel','taksi','taxi','transjakarta','bus'] },
  { label:'Belanja', keywords:['indomaret','alfamart','shopee','tokopedia','lazada','blibli','belanja','marketplace','minimarket','supermarket','mall','toko'] },
  { label:'Tagihan & Subscription', keywords:['netflix','spotify','youtube premium','subscription','langganan','wifi','internet','indihome','listrik','pln','pdam','pulsa','telkomsel','xl','indosat','by.u','tagihan'] },
  { label:'Hiburan', keywords:['bioskop','cinema','xxi','cgv','game','steam','playstation','konser','karaoke','hiburan','tiket'] },
  { label:'Kesehatan', keywords:['apotek','obat','dokter','klinik','rumah sakit','hospital','kesehatan','vitamin','lab','laboratorium'] },
  { label:'Pendidikan', keywords:['sekolah','kuliah','kampus','kursus','les','buku','pendidikan','kelas','udemy','coursera'] },
  { label:'Keluarga', keywords:['keluarga','orang tua','orangtua','anak','adik','kakak','ibu','ayah','rumah tangga'] },
  { label:'Bisnis', keywords:['vendor','supplier','usaha','bisnis','produksi','operasional','printing','percetakan','stok','modal usaha'] },
  { label:'Tabungan & Investasi', keywords:['tabung','tabungan','investasi','reksadana','reksa dana','saham','emas','deposito','invest'] }
];

function normalizeSmartCategoryText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function inferSmartCategory(description) {
  const normalized = normalizeSmartCategoryText(description);
  if (!normalized) return '';

  // Belajar dari transaksi pengguna sendiri terlebih dahulu.
  const learned = {};
  state.transactions.forEach(tx => {
    if (tx.type !== 'expense' || !tx.smartCategory) return;
    const past = normalizeSmartCategoryText(tx.category);
    if (!past) return;
    const exact = past === normalized;
    const related = Math.min(past.length, normalized.length) >= 5 && (past.includes(normalized) || normalized.includes(past));
    if (exact || related) learned[tx.smartCategory] = (learned[tx.smartCategory] || 0) + (exact ? 4 : 1);
  });
  const learnedTop = Object.entries(learned).sort((a,b) => b[1] - a[1])[0];
  if (learnedTop) return learnedTop[0];

  for (const rule of SMART_CATEGORY_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(normalizeSmartCategoryText(keyword)))) return rule.label;
  }
  return 'Lainnya';
}

function updateSmartCategoryHint() {
  const group = $('group-smart-category');
  const hint = $('smart-category-hint');
  const hintText = $('smart-category-hint-text');
  const select = $('tx-smart-category');
  if (!group || !hint || !hintText || !select) return;
  const isExpense = $('tx-type')?.value === 'expense';
  group.style.display = isExpense ? 'block' : 'none';
  if (!isExpense) { hint.classList.remove('show'); return; }
  const description = safeText($('tx-cat')?.value, 100);
  if (!description) { hint.classList.remove('show'); return; }
  const detected = select.value || inferSmartCategory(description);
  if (!detected) { hint.classList.remove('show'); return; }
  hintText.innerHTML = select.value
    ? `Kategori dipilih: <strong>${escapeHtml(detected)}</strong>`
    : `Terdeteksi otomatis: <strong>${escapeHtml(detected)}</strong>`;
  hint.classList.add('show');
}

function getTransactionDisplayCategory(tx) {
  const saved = safeText(tx?.smartCategory, 60);
  if (saved) return saved;
  if (tx?.type === 'expense') return inferSmartCategory(tx?.category) || safeText(tx?.category, 80) || 'Lainnya';
  return safeText(tx?.category, 80) || 'Lainnya';
}

function bindSmartCategory() {
  const input = $('tx-cat');
  const select = $('tx-smart-category');
  if (input && input.dataset.smartBound !== '1') {
    input.dataset.smartBound = '1';
    input.addEventListener('input', updateSmartCategoryHint);
  }
  if (select && select.dataset.smartBound !== '1') {
    select.dataset.smartBound = '1';
    select.addEventListener('change', updateSmartCategoryHint);
  }
}


// ================= RECEIPT SCANNER V9 =================
let receiptDraft = null;
let receiptScanBusy = false;
const RECEIPT_CATEGORIES = ['Makanan & Minuman','Transportasi','Belanja','Tagihan & Subscription','Hiburan','Kesehatan','Pendidikan','Keluarga','Bisnis','Tabungan & Investasi','Lainnya'];

function inferLearnedReceiptCategory(description) {
  const normalized = normalizeSmartCategoryText(description);
  if (!normalized) return '';
  const learned = {};
  state.transactions.forEach(tx => {
    if (tx.type !== 'expense' || !tx.smartCategory) return;
    const past = normalizeSmartCategoryText(tx.category);
    if (!past) return;
    const exact = past === normalized;
    const related = Math.min(past.length, normalized.length) >= 5 && (past.includes(normalized) || normalized.includes(past));
    if (exact || related) learned[tx.smartCategory] = (learned[tx.smartCategory] || 0) + (exact ? 4 : 1);
  });
  return Object.entries(learned).sort((a,b) => b[1] - a[1])[0]?.[0] || '';
}

function chooseReceiptCategory(result) {
  const merchant = safeText(result?.merchant, 100);
  const learned = inferLearnedReceiptCategory(merchant);
  if (learned) return learned;
  const aiCategory = safeText(result?.suggestedCategory, 60);
  if (RECEIPT_CATEGORIES.includes(aiCategory) && aiCategory !== 'Lainnya') return aiCategory;
  return inferSmartCategory(merchant) || (RECEIPT_CATEGORIES.includes(aiCategory) ? aiCategory : 'Lainnya');
}

function isValidReceiptDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const min = new Date('2000-01-01T00:00:00');
  const max = new Date(); max.setDate(max.getDate() + 1);
  return d >= min && d <= max;
}

function normalizeReceiptTime(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function buildReceiptFingerprint(meta) {
  const merchant = normalizeSmartCategoryText(meta?.merchant);
  const date = safeText(meta?.date, 10);
  const time = normalizeReceiptTime(meta?.time);
  const amount = Math.round(Number(meta?.total || meta?.confirmedAmount || 0));
  if (!merchant || !date || !time || amount <= 0) return '';
  return `${merchant}|${date}|${time}|${amount}`;
}

function findReceiptDuplicate(meta, excludeId = '') {
  if (!meta) return null;
  const hash = safeText(meta.imageHash, 128);
  const fingerprint = buildReceiptFingerprint(meta);
  return state.transactions.find(tx => {
    if (tx.id === excludeId || !tx.receiptMeta) return false;
    if (hash && safeText(tx.receiptMeta.imageHash, 128) === hash) return true;
    return Boolean(fingerprint && buildReceiptFingerprint(tx.receiptMeta) === fingerprint);
  }) || null;
}

function receiptConfidenceClass(value) {
  const score = Math.max(0, Math.min(100, Number(value || 0)));
  return score >= 90 ? 'good' : score >= 70 ? 'warn' : 'bad';
}

function setReceiptScanBusy(busy) {
  receiptScanBusy = busy;
  ['receipt-camera-btn','receipt-gallery-btn'].forEach(id => { if ($(id)) $(id).disabled = busy; });
  if ($('receipt-scan-loading')) $('receipt-scan-loading').style.display = busy ? 'flex' : 'none';
}

function resetReceiptScanner({ hidePanel = true } = {}) {
  receiptDraft = null;
  setReceiptScanBusy(false);
  if ($('receipt-camera-input')) $('receipt-camera-input').value = '';
  if ($('receipt-gallery-input')) $('receipt-gallery-input').value = '';
  if ($('receipt-scan-result')) $('receipt-scan-result').classList.remove('show');
  if ($('receipt-scan-error')) { $('receipt-scan-error').classList.remove('show'); $('receipt-scan-error').textContent = ''; }
  if ($('receipt-duplicate-warning')) $('receipt-duplicate-warning').classList.remove('show');
  if ($('receipt-scan-panel')) $('receipt-scan-panel').classList.toggle('show', !hidePanel);
  if ($('receipt-preview')) $('receipt-preview').removeAttribute('src');
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = .82) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal memproses foto struk.')), type, quality));
}

async function loadReceiptBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation:'from-image' }); } catch (_) {}
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak dapat dibaca.')); };
    img.src = url;
  });
}

async function prepareReceiptImage(file) {
  if (!file || (file.type && !String(file.type).toLowerCase().startsWith('image/'))) throw new Error('Pilih file gambar struk.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Foto terlalu besar. Maksimal 15 MB sebelum kompresi.');

  const bitmap = await loadReceiptBitmap(file);
  const sourceW = bitmap.width || bitmap.naturalWidth;
  const sourceH = bitmap.height || bitmap.naturalHeight;
  if (!sourceW || !sourceH) throw new Error('Ukuran foto tidak valid.');

  const maxSide = 1600;
  const initialScale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  let width = Math.max(1, Math.round(sourceW * initialScale));
  let height = Math.max(1, Math.round(sourceH * initialScale));
  let canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  let ctx = canvas.getContext('2d', { alpha:false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  ctx.filter = 'contrast(1.08) brightness(1.02)';
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === 'function') bitmap.close();

  const targetBytes = 600 * 1024;
  let quality = .84;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > targetBytes && quality > .52) {
    quality -= .07;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  let shrinkCount = 0;
  while (blob.size > targetBytes && shrinkCount < 2) {
    shrinkCount += 1;
    width = Math.max(1, Math.round(canvas.width * .82));
    height = Math.max(1, Math.round(canvas.height * .82));
    const next = document.createElement('canvas');
    next.width = width; next.height = height;
    const nextCtx = next.getContext('2d', { alpha:false });
    nextCtx.fillStyle = '#fff'; nextCtx.fillRect(0,0,width,height);
    nextCtx.drawImage(canvas, 0, 0, width, height);
    canvas = next;
    blob = await canvasToBlob(canvas, 'image/jpeg', .58);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca foto.'));
    reader.readAsDataURL(blob);
  });

  let imageHash = '';
  try {
    if (crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      imageHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
  } catch (_) {}

  return { dataUrl, imageHash, width:canvas.width, height:canvas.height, bytes:blob.size };
}

function suggestReceiptAccount(paymentMethod) {
  const payment = normalizeSmartCategoryText(paymentMethod);
  if (!payment || /^(qris|cash|tunai|debit|credit|kartu)$/.test(payment)) return '';
  const candidates = state.accounts.filter(acc => {
    const name = normalizeSmartCategoryText(acc.name);
    return name && (payment.includes(name) || name.includes(payment));
  });
  return candidates.length === 1 ? candidates[0].id : '';
}

function showReceiptDuplicateWarning(duplicate) {
  const box = $('receipt-duplicate-warning');
  if (!box) return;
  const merchant = duplicate.receiptMeta?.merchant || duplicate.category || 'Transaksi';
  $('receipt-duplicate-text').textContent = `${merchant} • ${duplicate.date} • ${toRp(duplicate.amount)}`;
  box.classList.add('show');
}

function renderReceiptScanResult(result) {
  const merchant = safeText(result.merchant, 100) || 'Merchant tidak terbaca';
  const category = chooseReceiptCategory(result);
  const total = Math.max(0, Number(result.total || 0));
  const confidence = Math.max(0, Math.min(100, Number(result.confidence?.overall || result.confidenceOverall || 0)));
  $('receipt-result-merchant').textContent = merchant;
  $('receipt-result-total').textContent = total > 0 ? toRp(total) : 'Perlu dicek';
  $('receipt-result-category').textContent = category;
  $('receipt-result-date').textContent = isValidReceiptDate(result.date) ? result.date : 'Hari ini';
  $('receipt-result-payment').textContent = safeText(result.paymentMethod, 80) || 'Tidak terbaca';
  const badge = $('receipt-confidence');
  badge.className = `receipt-confidence ${receiptConfidenceClass(confidence)}`;
  badge.innerHTML = `<i class="fa-solid fa-shield-halved"></i><span>Keyakinan ${Math.round(confidence)}%</span>`;
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean).slice(0,3) : [];
  $('receipt-scan-note').textContent = warnings.length
    ? `Periksa sebelum simpan: ${warnings.join(' • ')}`
    : 'Hasil scan sudah dimasukkan ke form. Periksa nominal, kategori, tanggal dan dompet sebelum menekan Simpan Catatan.';
  $('receipt-scan-result').classList.add('show');
}

async function getPrivateApiAuthHeader() {
  if (!supabaseClient) throw new Error('Sesi akun belum siap. Masuk kembali lalu coba lagi.');
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sesi login berakhir. Masuk kembali lalu coba lagi.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function requestReceiptScan(dataUrl) {
  const pinKey = 'KITA_TABUNG_RECEIPT_PIN';
  let pin = localStorage.getItem(pinKey) || localStorage.getItem('KITA_TABUNG_AI_PIN') || '';
  const makeRequest = async () => fetch('/api/receipt-scan', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Accept:'application/json', ...(await getPrivateApiAuthHeader()), ...(pin ? {'X-RECEIPT-PIN':pin} : {}) },
    body:JSON.stringify({ imageData:dataUrl })
  });

  let response = await makeRequest();
  if (response.status === 403) {
    pin = safeText(prompt('Masukkan PIN Scan Struk yang diatur di Vercel:') || '', 80);
    if (!pin) throw new Error('PIN Scan Struk diperlukan.');
    localStorage.setItem(pinKey, pin);
    response = await makeRequest();
    if (response.status === 403) localStorage.removeItem(pinKey);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Scan struk gagal (${response.status}).`);
  return result;
}

async function scanReceiptFile(file) {
  if (receiptScanBusy || !file) return;
  resetReceiptScanner({ hidePanel:false });
  $('receipt-scan-panel').classList.add('show');
  setReceiptScanBusy(true);
  try {
    const prepared = await prepareReceiptImage(file);
    $('receipt-preview').src = prepared.dataUrl;
    const result = await requestReceiptScan(prepared.dataUrl);
    if (!Number.isFinite(Number(result.total)) || Number(result.total) <= 0) throw new Error('Nominal total belum terbaca dengan yakin. Ambil foto yang lebih terang dan pastikan bagian TOTAL terlihat.');

    const merchant = safeText(result.merchant, 100) || 'Struk Belanja';
    const category = chooseReceiptCategory(result);
    receiptDraft = {
      merchant,
      date: isValidReceiptDate(result.date) ? result.date : new Date().toISOString().split('T')[0],
      time: normalizeReceiptTime(result.time),
      total: Math.round(Number(result.total || 0)),
      subtotal: Math.max(0, Math.round(Number(result.subtotal || 0))),
      discount: Math.max(0, Math.round(Number(result.discount || 0))),
      tax: Math.max(0, Math.round(Number(result.tax || 0))),
      serviceCharge: Math.max(0, Math.round(Number(result.serviceCharge || 0))),
      paymentMethod: safeText(result.paymentMethod, 80),
      suggestedCategory: category,
      confidence: result.confidence && typeof result.confidence === 'object' ? result.confidence : { overall:Number(result.confidenceOverall || 0) },
      warnings: Array.isArray(result.warnings) ? result.warnings.slice(0,5).map(x => safeText(x, 140)) : [],
      items: Array.isArray(result.items) ? result.items.slice(0,12).map(item => ({ name:safeText(item?.name, 80), qty:Math.max(0,Number(item?.qty || 0)), total:Math.max(0,Math.round(Number(item?.total || 0))) })) : [],
      imageHash: prepared.imageHash,
      scannedAt: Date.now(),
      allowDuplicate: false
    };
    receiptDraft.fingerprint = buildReceiptFingerprint(receiptDraft);

    updateTxType('expense');
    $('tx-amount').value = receiptDraft.total;
    $('tx-cat').value = merchant;
    if ($('tx-smart-category')) $('tx-smart-category').value = category;
    $('tx-date').value = receiptDraft.date;
    const suggestedAccount = suggestReceiptAccount(receiptDraft.paymentMethod);
    if (suggestedAccount && $('tx-acc')) $('tx-acc').value = suggestedAccount;
    updateSmartCategoryHint();

    renderReceiptScanResult({ ...result, merchant, suggestedCategory:category, total:receiptDraft.total, date:receiptDraft.date });
    const duplicate = findReceiptDuplicate(receiptDraft, $('tx-id')?.value || '');
    if (duplicate) showReceiptDuplicateWarning(duplicate);
    showToast('Struk terbaca. Hasil sudah dimasukkan ke form untuk diperiksa.');
  } catch (error) {
    receiptDraft = null;
    $('receipt-scan-result')?.classList.remove('show');
    const errorEl = $('receipt-scan-error');
    if (errorEl) { errorEl.textContent = error.message || 'Struk gagal dibaca.'; errorEl.classList.add('show'); }
    showToast(error.message || 'Struk gagal dibaca.', true);
  } finally {
    setReceiptScanBusy(false);
    if ($('receipt-camera-input')) $('receipt-camera-input').value = '';
    if ($('receipt-gallery-input')) $('receipt-gallery-input').value = '';
  }
}

function bindReceiptScanner() {
  const cameraBtn = $('receipt-camera-btn');
  const galleryBtn = $('receipt-gallery-btn');
  const cameraInput = $('receipt-camera-input');
  const galleryInput = $('receipt-gallery-input');
  const allowDuplicate = $('receipt-allow-duplicate-btn');
  if (cameraBtn && cameraBtn.dataset.bound !== '1') {
    cameraBtn.dataset.bound = '1';
    cameraBtn.addEventListener('click', () => cameraInput?.click());
  }
  if (galleryBtn && galleryBtn.dataset.bound !== '1') {
    galleryBtn.dataset.bound = '1';
    galleryBtn.addEventListener('click', () => galleryInput?.click());
  }
  if (cameraInput && cameraInput.dataset.bound !== '1') {
    cameraInput.dataset.bound = '1';
    cameraInput.addEventListener('change', event => scanReceiptFile(event.target.files?.[0]));
  }
  if (galleryInput && galleryInput.dataset.bound !== '1') {
    galleryInput.dataset.bound = '1';
    galleryInput.addEventListener('change', event => scanReceiptFile(event.target.files?.[0]));
  }
  if (allowDuplicate && allowDuplicate.dataset.bound !== '1') {
    allowDuplicate.dataset.bound = '1';
    allowDuplicate.addEventListener('click', () => {
      if (!receiptDraft) return;
      receiptDraft.allowDuplicate = true;
      $('receipt-duplicate-warning')?.classList.remove('show');
      showToast('Duplikat diizinkan. Pastikan transaksi memang berbeda.');
    });
  }
}


// ================= MODAL HANDLERS =================
let lastModalTrigger = null;
function openModal(id) {
  const modal = $(id); if (!modal) return;
  lastModalTrigger = document.activeElement;
  modal.style.display = 'flex'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
  const focusable = modal.querySelector('input:not([type=hidden]),select,textarea,button:not([disabled]),a[href]');
  setTimeout(() => focusable?.focus({preventScroll:true}), 20);
}
function closeModal(id) {
  if (id === 'modal-login' && !activeUserId) return;
  const modal = $(id); if (!modal) return; modal.style.display = 'none';
  if (lastModalTrigger && document.contains(lastModalTrigger)) setTimeout(() => lastModalTrigger.focus?.({preventScroll:true}), 10);
}

function openTxModal(id = null) {
  resetReceiptScanner({ hidePanel: true });
  $('form-tx').reset(); $('tx-id').value = '';
  if ($('tx-smart-category')) $('tx-smart-category').value = '';
  updateTxType('expense');
  $('tx-date').value = new Date().toISOString().split('T')[0];
  populateSelectOpts();

  if (id) {
    const tx = state.transactions.find(t => t.id === id);
    if(tx) {
      $('tx-id').value = tx.id; updateTxType(tx.type);
      $('tx-amount').value = tx.amount; $('tx-cat').value = tx.category;
      if ($('tx-smart-category')) $('tx-smart-category').value = tx.smartCategory || '';
      $('tx-acc').value = tx.accountId;
      if(tx.type === 'expense') $('tx-budget').value = tx.budgetId || '';
      if(tx.type === 'transfer') $('tx-acc-to').value = tx.accountToId || '';
      $('tx-date').value = tx.date;
    }
  }
  updateSmartCategoryHint();
  openModal('modal-tx');
}

function updateTxType(type) {
  $('tx-type').value = type;
  const receiptBox = $('receipt-scan-box');
  if (receiptBox) receiptBox.style.display = type === 'expense' ? 'block' : 'none';
  if (type !== 'expense' && receiptDraft) resetReceiptScanner({ hidePanel:true });
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.type-btn[data-type="${type}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const lblCat = $('lbl-cat'), groupBudget = $('group-budget'), groupAccTo = $('group-acc-to'), lblAcc = $('lbl-acc');
  groupBudget.style.display = 'none'; groupAccTo.style.display = 'none';
  lblAcc.innerText = t('lblAccFrom');

  if(type === 'expense') { lblCat.innerText = t('lblCatExp'); groupBudget.style.display = 'block'; }
  else if(type === 'income') { lblCat.innerText = t('lblCatInc'); lblAcc.innerText = t('lblAccTo'); }
  else if(type === 'transfer') { lblCat.innerText = t('lblCatTrf'); groupAccTo.style.display = 'block'; }
  else if(type === 'debt') { lblCat.innerText = t('lblCatDebt'); }
  updateSmartCategoryHint();
}

function openWalletModal(id = null) {
  $('form-wallet').reset(); $('wallet-id').value = '';
  $('modal-wallet-title').innerText = state.lang === 'en' ? 'Add Wallet' : 'Tambah Dompet';
  if (id) {
    const acc = state.accounts.find(a => a.id === id);
    if(acc) {
      $('wallet-id').value = acc.id; $('wallet-name').value = acc.name; $('wallet-bal').value = acc.balance;
      $('modal-wallet-title').innerText = state.lang === 'en' ? 'Edit Wallet' : 'Edit Dompet';
    }
  }
  openModal('modal-wallet');
}

function openBudgetModal(id = null) {
  $('form-budget').reset();
  $('budget-id').value = '';

  const deleteBtn = $('btn-delete-budget');
  const submitBtn = $('t_btn_save_budget');
  const title = $('modal-budget-title');
  const rolloverInput = $('budget-rollover');
  const cycleNote = $('budget-cycle-note');
  const period = getBudgetPeriodBounds(new Date());

  if (deleteBtn) deleteBtn.style.display = 'none';
  if (rolloverInput) rolloverInput.checked = true;
  if (cycleNote) cycleNote.textContent = `${state.lang === 'en' ? 'Budget cycle follows payday' : 'Periode budget mengikuti tanggal gajian'}: ${budgetPeriodLabel(period)}.`;
  if (title) title.textContent = state.lang === 'en' ? 'Set Budget Envelope' : 'Set Amplop Budget';
  if (submitBtn) submitBtn.textContent = state.lang === 'en' ? 'Set Budget 🎯' : 'Atur Budget 🎯';

  if(id) {
    const b = state.budgets.find(x => x.id === id);
    if(b) {
      $('budget-id').value = b.id;
      $('budget-name').value = b.name;
      $('budget-limit').value = b.limit;
      if (rolloverInput) rolloverInput.checked = b.rollover === true;
      if (title) title.textContent = state.lang === 'en' ? 'Edit Budget' : 'Edit Budget';
      if (submitBtn) submitBtn.textContent = state.lang === 'en' ? 'Save Changes' : 'Simpan Perubahan';
      if (deleteBtn) {
        deleteBtn.style.display = 'block';
        deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i> ${state.lang === 'en' ? 'Delete Budget' : 'Hapus Budget'}`;
      }
    }
  }
  openModal('modal-budget');
}

function deleteBudgetFromModal() {
  const id = $('budget-id')?.value || '';
  if (!id) return;

  const budget = state.budgets.find(item => item.id === id);
  if (!budget) {
    closeModal('modal-budget');
    return showToast(state.lang === 'en' ? 'Budget not found.' : 'Budget tidak ditemukan.', true);
  }

  const linkedCount = state.transactions.filter(tx => tx.budgetId === id).length;
  const message = state.lang === 'en'
    ? `Delete budget “${budget.name}”?${linkedCount ? `\n\n${linkedCount} transaction(s) linked to this budget will remain in history and only be unlinked from the budget.` : ''}`
    : `Hapus budget “${budget.name}”?${linkedCount ? `\n\n${linkedCount} transaksi yang memakai budget ini tetap tersimpan di riwayat dan hanya akan dilepas dari budget.` : ''}`;

  const before = cloneFinanceSnapshot();

  state.budgets = state.budgets.filter(item => item.id !== id);
  state.transactions.forEach(tx => {
    if (tx.budgetId === id) tx.budgetId = null;
    if (Array.isArray(tx.splits)) tx.splits.forEach(split => { if (split.budgetId === id) split.budgetId = ''; });
  });

  saveData();
  closeModal('modal-budget');
  render();
  showUndoToast(state.lang === 'en' ? `Budget “${budget.name}” deleted.` : `Budget “${budget.name}” dihapus.`, before);
}

// --- AI History Features ---
function openAIHistoryModal() {
  const container = $('ai-history-list');
  let html = '';
  if (state.aiHistory.length === 0) {
    html = `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:20px;">${t('no_ai_history')}</p>`;
  } else {
    // Sort descending by month
    const sortedHistory = [...state.aiHistory].sort((a,b) => b.month.localeCompare(a.month));
    sortedHistory.forEach(h => {
      let totalBudget = h.data.reduce((sum, item) => sum + item.limit, 0);
      html += `
        <div class="ai-history-card" onclick="showAIDetail('${escapeHtml(h.month)}')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:var(--text-main);"><i class="fa-solid fa-calendar-alt"></i> ${escapeHtml(formatMonthLabel(h.month))}</span>
            <span style="color:var(--primary); font-weight:800; font-size:0.9rem;">${toRp(totalBudget)}</span>
          </div>
        </div>
      `;
    });
  }
  container.innerHTML = html;
  openModal('modal-ai-history');
}

function showAIDetail(monthKey) {
  closeModal('modal-ai-history');
  const record = state.aiHistory.find(h => h.month === monthKey);
  if (!record) return;

  $('ai-detail-title').innerText = formatMonthLabel(monthKey);
  let html = '';
  record.data.forEach(b => {
      html += `<div style="background:var(--bg); padding:12px; border-radius:8px; margin-bottom:8px; border: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.9rem; font-weight:700; color:var(--text-main);">${escapeHtml(b.name)}</span>
          <span style="font-weight:800; color:var(--primary);">${toRp(b.limit)}</span></div>`;
  });
  $('ai-detail-content').innerHTML = html;
  openModal('modal-ai-detail');
}

function openAIModal() {
  $('ai-income').value = ''; $('ai-step-1').style.display = 'block';
  $('ai-step-2').style.display = 'none'; $('ai-loading').style.display = 'none';
  openModal('modal-ai');
}

function generateAI() {
  const inc = Number($('ai-income').value);
  if (!inc || inc < 100000) return alert('Input minimum 100,000');
  $('ai-step-1').style.display = 'none'; $('ai-loading').style.display = 'block';

  setTimeout(() => {
    $('ai-loading').style.display = 'none'; $('ai-step-2').style.display = 'block';
    const isEn = state.lang === 'en';
    aiTempBudgets = [
      { name: isEn ? 'Needs (Food, Rent)' : 'Kebutuhan Hidup (Makan, Kos)', limit: inc * 0.45 },
      { name: isEn ? 'Wants & Healing' : 'Healing & Jajan', limit: inc * 0.30 },
      { name: isEn ? 'Savings & Invest' : 'Tabungan & Investasi', limit: inc * 0.15 },
      { name: isEn ? 'Emergency Fund' : 'Dana Darurat / Donasi', limit: inc * 0.10 }
    ];
    let html = '';
    aiTempBudgets.forEach(b => {
      html += `<div style="background:var(--bg); padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">${escapeHtml(b.name)}</span>
          <span style="font-weight:800; color:var(--primary);">${toRp(b.limit)}</span></div>`;
    });
    $('ai-results').innerHTML = html;
  }, 1500);
}

function applyAIBudget() {
  state.budgets = aiTempBudgets.map(b => createBudgetRecord(b.name, b.limit, false));
  
  // Save Evaluation to aiHistory
  const currentMonth = getCurrentMonthKey();
  const existingIndex = state.aiHistory.findIndex(h => h.month === currentMonth);
  if (existingIndex > -1) {
    state.aiHistory[existingIndex].data = [...state.budgets];
  } else {
    state.aiHistory.push({ month: currentMonth, data: [...state.budgets] });
  }

  saveData(); render(); closeModal('modal-ai');
}

// ================= DATA LOGIC =================
$('form-payday').addEventListener('submit', event => {
  event.preventDefault();
  const day = Math.min(31, Math.max(1, Number($('payday-day').value || 25)));
  const expectedIncome = Math.max(0, Number($('payday-income').value || 0));
  const safetyReserve = Math.max(0, Number($('payday-reserve').value || 0));
  state.payday = { day, expectedIncome, safetyReserve };
  saveData();
  render();
  showToast('Pengaturan tanggal gajian tersimpan.');
});

$('form-recurring-bill').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('recurring-bill-id').value;
  const name = safeText($('recurring-bill-name').value, 80);
  const amount = Number($('recurring-bill-amount').value || 0);
  const category = safeText($('recurring-bill-category').value, 60) || 'Tagihan';
  const accountId = $('recurring-bill-account').value;
  const frequency = $('recurring-bill-frequency').value;
  const nextDueDate = $('recurring-bill-next-date').value;
  if (!name || !Number.isFinite(amount) || amount <= 0 || !accountId || !parseLocalDate(nextDueDate)) return showToast('Lengkapi data tagihan dengan benar.', true);
  const existing = state.recurringBills.find(item => item.id === id);
  const bill = {
    id: id || generateId(), name, amount, category, accountId,
    frequency: ['weekly','monthly','yearly'].includes(frequency) ? frequency : 'monthly',
    anchorDate: nextDueDate,
    nextDueDate, active: $('recurring-bill-active').checked,
    lastPaidDate: existing?.lastPaidDate || '', lastPaidAmount: Number(existing?.lastPaidAmount || 0)
  };
  if (existing) Object.assign(existing, bill);
  else state.recurringBills.push(bill);
  saveData();
  render();
  closeModal('modal-recurring-bill');
  showToast('Tagihan berulang tersimpan.');
});

$('form-goal').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('goal-id').value;
  const name = safeText($('goal-name').value, 80);
  const emoji = safeText($('goal-emoji').value, 8) || '🎯';
  const target = Number($('goal-target').value || 0);
  const saved = Math.max(0, Number($('goal-saved').value || 0));
  const deadline = $('goal-deadline').value;
  const monthlyContribution = Math.max(0, Number($('goal-monthly').value || 0));
  if (!name || !Number.isFinite(target) || target <= 0) return showToast('Nama dan target nominal wajib diisi.', true);
  if (deadline && !parseLocalDate(deadline)) return showToast('Tanggal deadline tidak valid.', true);
  const existing = state.goals.find(item => item.id === id);
  const goal = {
    id: id || generateId(), name, emoji, target, saved, deadline, monthlyContribution,
    createdAt: existing?.createdAt || toDateKey(new Date()), contributions: existing?.contributions || []
  };
  if (existing) Object.assign(existing, goal);
  else state.goals.push(goal);
  saveData();
  render();
  closeModal('modal-goal');
  showToast('Target tabungan tersimpan.');
});

$('form-goal-contribution').addEventListener('submit', event => {
  event.preventDefault();
  const goal = state.goals.find(item => item.id === $('goal-contribution-goal-id').value);
  const before = cloneFinanceSnapshot();
  if (!goal) return;
  const amount = Number($('goal-contribution-amount').value || 0);
  const date = $('goal-contribution-date').value;
  const note = safeText($('goal-contribution-note').value, 100);
  const mode = $('goal-contribution-mode').value === 'withdraw' ? 'withdraw' : 'deposit';
  if (!Number.isFinite(amount) || amount <= 0 || !parseLocalDate(date)) return showToast('Nominal dan tanggal harus valid.', true);
  if (mode === 'withdraw' && amount > Number(goal.saved || 0)) return showToast('Dana yang ditarik melebihi saldo target.', true);
  goal.saved = Math.max(0, Number(goal.saved || 0) + (mode === 'withdraw' ? -amount : amount));
  goal.contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
  goal.contributions.push({ id: generateId(), amount, date, note, type: mode });
  goal.contributions = goal.contributions.slice(-120);
  saveData();
  render();
  closeModal('modal-goal-contribution');
  showUndoToast(mode === 'withdraw' ? 'Penarikan dana target tersimpan.' : 'Setoran target tersimpan.', before);
});

$('form-wallet').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('wallet-id').value, name = safeText($('wallet-name').value, 60), bal = Number($('wallet-bal').value);
  if (id) { const idx = state.accounts.findIndex(a => a.id === id); if(idx > -1) { state.accounts[idx].name = name; state.accounts[idx].balance = bal; } } 
  else { state.accounts.push({ id: generateId(), name, balance: bal }); }
  state.onboarding = state.onboarding || {}; state.onboarding.walletConfigured = true;
  saveData(); render(); closeModal('modal-wallet'); showToast('Dompet tersimpan.');
});

$('form-budget').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('budget-id').value;
  const name = safeText($('budget-name').value, 80);
  const limit = Math.max(0, Number($('budget-limit').value || 0));
  const rollover = $('budget-rollover')?.checked === true;
  if (!name) return showToast('Nama budget tidak boleh kosong.', true);
  if (!Number.isFinite(limit) || limit <= 0) return showToast('Jatah budget harus lebih dari Rp0.', true);

  const currentPeriod = getBudgetPeriodBounds(new Date());

  if (id) {
    const idx = state.budgets.findIndex(b => b.id === id);
    if (idx > -1) {
      const budget = state.budgets[idx];
      const wasRollover = budget.rollover === true;
      budget.name = name;
      budget.limit = limit;
      budget.rollover = rollover;

      if (rollover && !wasRollover) {
        // Mengaktifkan rollover dimulai dari periode berjalan agar bulan-bulan lama tidak tiba-tiba ikut terakumulasi.
        budget.rolloverStart = currentPeriod.startKey;
        budget.limitHistory = [{ effectivePeriodStart: currentPeriod.startKey, limit }];
      } else if (rollover) {
        if (!budget.rolloverStart) budget.rolloverStart = currentPeriod.startKey;
        upsertBudgetLimitHistory(budget, currentPeriod.startKey, limit);
      }
    }
  } else {
    state.budgets.push(createBudgetRecord(name, limit, rollover));
  }

  saveData();
  render();
  closeModal('modal-budget');
  showToast(rollover ? 'Budget tersimpan. Sisa positif akan diakumulasi.' : 'Budget tersimpan tanpa akumulasi sisa.');
});

$('form-tx').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('tx-id').value, type = $('tx-type').value, amount = Number($('tx-amount').value), category = safeText($('tx-cat').value, 100);
  const accountId = $('tx-acc').value, date = $('tx-date').value;
  const budgetId = type === 'expense' ? $('tx-budget').value : null, accountToId = type === 'transfer' ? $('tx-acc-to').value : null;
  const smartCategory = type === 'expense' ? (safeText($('tx-smart-category')?.value, 60) || inferSmartCategory(category)) : '';

  if (!Number.isFinite(amount) || amount <= 0) { $('tx-amount')?.focus(); return showToast('Nominal harus lebih dari Rp0.', true); }
  if (!category) { $('tx-cat')?.focus(); return showToast('Keterangan transaksi tidak boleh kosong.', true); }
  if (!accountId) { $('tx-acc')?.focus(); return showToast(t('alert_acc'), true); }
  if (type === 'transfer' && !accountToId) { $('tx-acc-to')?.focus(); return showToast(state.lang === 'en' ? 'Please select destination account!' : 'Pilih rekening tujuan terlebih dahulu!', true); }
  if (type === 'transfer' && accountId === accountToId) { $('tx-acc-to')?.focus(); return showToast(t('alert_trf'), true); }

  const oldTx = id ? state.transactions.find(t => t.id === id) : null;
  if (id && !oldTx) return alert('Transaksi tidak ditemukan.');
  const beforeNewTransaction = id ? null : cloneFinanceSnapshot();

  let receiptMeta = oldTx?.receiptMeta || null;
  if (receiptDraft) {
    const duplicate = findReceiptDuplicate(receiptDraft, id);
    if (duplicate && !receiptDraft.allowDuplicate) {
      showReceiptDuplicateWarning(duplicate);
      showToast('Struk ini kemungkinan sudah pernah dicatat. Periksa peringatan sebelum menyimpan.', true);
      return;
    }
    receiptMeta = {
      merchant: safeText(receiptDraft.merchant, 100),
      date: safeText(receiptDraft.date, 10),
      time: normalizeReceiptTime(receiptDraft.time),
      total: Math.max(0, Math.round(Number(receiptDraft.total || 0))),
      subtotal: Math.max(0, Math.round(Number(receiptDraft.subtotal || 0))),
      discount: Math.max(0, Math.round(Number(receiptDraft.discount || 0))),
      tax: Math.max(0, Math.round(Number(receiptDraft.tax || 0))),
      serviceCharge: Math.max(0, Math.round(Number(receiptDraft.serviceCharge || 0))),
      paymentMethod: safeText(receiptDraft.paymentMethod, 80),
      suggestedCategory: safeText(receiptDraft.suggestedCategory, 60),
      confidence: receiptDraft.confidence || {},
      warnings: Array.isArray(receiptDraft.warnings) ? receiptDraft.warnings.slice(0,5) : [],
      items: Array.isArray(receiptDraft.items) ? receiptDraft.items.slice(0,12) : [],
      imageHash: safeText(receiptDraft.imageHash, 128),
      fingerprint: safeText(receiptDraft.fingerprint, 240),
      scannedAt: Number(receiptDraft.scannedAt || Date.now()),
      confirmedAmount: amount,
      confirmedCategory: smartCategory
    };
  }

  const txData = { id: id || generateId(), type, amount, category, smartCategory, accountId, date, budgetId, accountToId, ...(receiptMeta ? { receiptMeta } : {}) };

  if (id) {
    revertBalance(oldTx);
    const idx = state.transactions.findIndex(t => t.id === id); state.transactions[idx] = txData;
  } else { state.transactions.push(txData); }

  applyBalance(txData); saveData(); render(); closeModal('modal-tx');
  if (!id && beforeNewTransaction) {
    const label = type === 'expense' ? 'Pengeluaran' : type === 'income' ? 'Pemasukan' : type === 'transfer' ? 'Transfer' : 'Transaksi utang/piutang';
    showUndoToast(`${label} ${toRp(amount)} berhasil dicatat.`, beforeNewTransaction);
  } else if (receiptMeta) {
    showToast('Transaksi dari struk berhasil diperbarui.');
  }
  resetReceiptScanner({ hidePanel:true });
});

function applyBalance(tx) {
  const acc = state.accounts.find(a => a.id === tx.accountId); if (!acc) return;
  if (tx.type === 'income') acc.balance += tx.amount;
  else if (tx.type === 'expense' || tx.type === 'debt') acc.balance -= tx.amount;
  else if (tx.type === 'transfer') {
    acc.balance -= tx.amount; const accTo = state.accounts.find(a => a.id === tx.accountToId); if(accTo) accTo.balance += tx.amount;
  }
}
function revertBalance(tx) {
  if (!tx) return;
  const acc = state.accounts.find(a => a.id === tx.accountId); if (!acc) return;
  if (tx.type === 'income') acc.balance -= tx.amount;
  else if (tx.type === 'expense' || tx.type === 'debt') acc.balance += tx.amount;
  else if (tx.type === 'transfer') {
    acc.balance += tx.amount; const accTo = state.accounts.find(a => a.id === tx.accountToId); if(accTo) accTo.balance -= tx.amount;
  }
}
function deleteTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const before = cloneFinanceSnapshot();
  revertBalance(tx);
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveData();
  render();
  showUndoToast(`Transaksi ${toRp(tx.amount)} dihapus.`, before);
}


// ================= V10 BACKUP & RESTORE =================
const BACKUP_VERSION = 1;
const PRE_RESTORE_BACKUP_KEY = 'KITA_TABUNG_PRE_RESTORE_BACKUP_V1';
let pendingRestoreBackup = null;

function buildFinanceBackupPayload() {
  return {
    app: 'KITA TABUNG',
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    finance: normalizeFinanceState(state, null),
    privacy: {
      enabled: privacyModeEnabled,
      reopenMode: privacySettings.reopenMode
    }
  };
}

function formatBackupFilename(date = new Date()) {
  return `KITA-TABUNG-BACKUP-${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}.json`;
}

function downloadFinanceBackup(options = {}) {
  try {
    const payload = buildFinanceBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = formatBackupFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    if (!options.silent) {
      const status = $('backup-status');
      if (status) status.textContent = `Backup terakhir dibuat ${new Date().toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'})}.`;
      showToast('Backup KITA TABUNG berhasil didownload.');
    }
    return true;
  } catch (error) {
    console.error('Backup gagal:', error);
    if (!options.silent) showToast(`Backup gagal: ${error.message}`, true);
    return false;
  }
}

function triggerRestoreBackup() {
  const input = $('restore-backup-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function validateBackupEnvelope(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Isi file tidak valid.');
  if (parsed.app !== 'KITA TABUNG') throw new Error('File ini bukan backup resmi KITA TABUNG.');
  if (Number(parsed.backupVersion) !== BACKUP_VERSION) throw new Error(`Versi backup ${parsed.backupVersion ?? '-'} belum didukung.`);
  const finance = parsed.finance || parsed.data;
  if (!finance || typeof finance !== 'object') throw new Error('Data keuangan tidak ditemukan di file backup.');
  const known = ['transactions','accounts','budgets','recurringBills','goals','payday'];
  if (!known.some(key => Object.prototype.hasOwnProperty.call(finance, key))) throw new Error('Struktur data backup tidak dikenali.');
  return normalizeFinanceState(finance, null);
}

async function handleRestoreBackupFile(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('File backup terlalu besar. Maksimal 5 MB.');
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = validateBackupEnvelope(parsed);
    pendingRestoreBackup = { parsed, normalized, fileName:file.name };
    const created = parsed.createdAt ? new Date(parsed.createdAt) : null;
    const summary = $('restore-backup-summary');
    if (summary) summary.innerHTML = `
      <div class="restore-summary-row"><span>File</span><strong>${escapeHtml(file.name)}</strong></div>
      <div class="restore-summary-row"><span>Dibuat</span><strong>${created && !Number.isNaN(created.getTime()) ? escapeHtml(created.toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'})) : '-'}</strong></div>
      <div class="restore-summary-row"><span>Transaksi</span><strong>${normalized.transactions.length}</strong></div>
      <div class="restore-summary-row"><span>Dompet</span><strong>${normalized.accounts.length}</strong></div>
      <div class="restore-summary-row"><span>Budget</span><strong>${normalized.budgets.length}</strong></div>
      <div class="restore-summary-row"><span>Target / Tagihan</span><strong>${normalized.goals.length} / ${normalized.recurringBills.length}</strong></div>`;
    openModal('modal-restore-backup');
  } catch (error) {
    pendingRestoreBackup = null;
    showToast(error.message || 'File backup tidak dapat dibaca.', true);
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function cancelRestoreBackup() {
  pendingRestoreBackup = null;
  const modal = $('modal-restore-backup');
  if (modal) modal.style.display = 'none';
}

async function confirmRestoreBackup() {
  if (!pendingRestoreBackup) return showToast('Pilih file backup terlebih dahulu.', true);
  const button = $('confirm-restore-backup-btn');
  if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memulihkan...'; }
  try {
    const safetySnapshot = buildFinanceBackupPayload();
    try { localStorage.setItem(PRE_RESTORE_BACKUP_KEY, JSON.stringify(safetySnapshot)); } catch (error) { console.warn('Snapshot pengaman restore gagal disimpan:', error); }

    state = pendingRestoreBackup.normalized;
    if (pendingRestoreBackup.parsed?.privacy) {
      privacySettings = normalizePrivacySettings(pendingRestoreBackup.parsed.privacy);
      privacyModeEnabled = privacySettings.reopenMode === 'hidden'
        ? true
        : privacySettings.reopenMode === 'visible'
          ? false
          : privacySettings.enabled === true;
      balanceAmountsVisible = !privacyModeEnabled;
      persistPrivacySettings();
    }

    saveLocalCache();
    persistThemeState();
    applyTheme();
    syncThemeControls();
    render();
    await saveCloudState({ force:true });
    pendingRestoreBackup = null;
    closeModal('modal-restore-backup');
    showToast('Backup berhasil dipulihkan dan disinkronkan ke cloud.');
  } catch (error) {
    console.error('Restore backup gagal:', error);
    showToast(`Restore gagal: ${error.message}`, true);
  } finally {
    if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Pulihkan Data'; }
  }
}

// ================= EXPORT PDF (NEW) =================
function exportPDF() {
  const filterMonth = $('filter-month').value;
  const txs = state.transactions.filter(t => getMonthKey(t.date) === filterMonth).sort((a,b) => new Date(a.date) - new Date(b.date));
  
  if (txs.length === 0) return alert(t('alert_no_pdf_data'));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const title = `Laporan Keuangan: ${formatMonthLabel(filterMonth)}`;
  
  // Calculate Totals
  let totalInc = 0, totalExp = 0;
  txs.forEach(t => {
    if(t.type === 'income') totalInc += t.amount;
    if(t.type === 'expense') totalExp += t.amount;
  });

  // Headers
  doc.setFontSize(16);
  doc.text(title, 14, 22);
  
  doc.setFontSize(11);
  doc.text(`Total Pemasukan: ${toRp(totalInc)}`, 14, 32);
  doc.text(`Total Pengeluaran: ${toRp(totalExp)}`, 14, 38);

  // Prepare Data for AutoTable
  const tableData = txs.map(t => {
    const acc = state.accounts.find(a => a.id === t.accountId);
    let typeLabel = t.type === 'income' ? 'Masuk' : t.type === 'expense' ? 'Keluar' : t.type === 'transfer' ? 'Transfer' : 'Utang';
    if(state.lang === 'en') typeLabel = t.type;
    return [
      t.date, 
      typeLabel,
      t.category, 
      acc ? acc.name : '-', 
      (t.type === 'expense' || t.type === 'debt' ? '-' : '') + toRp(t.amount)
    ];
  });

  doc.autoTable({
    startY: 45,
    head: [['Tanggal', 'Tipe', 'Keterangan', 'Rekening', 'Nominal']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] }, // matching var(--primary)
    styles: { font: 'helvetica', fontSize: 10 }
  });

  doc.save(`KITA_TABUNG_${filterMonth}.pdf`);
}

// ================= RENDERING =================
function populateSelectOpts() {
  const accHtml = state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${toRp(a.balance)})</option>`).join('');
  $('tx-acc').innerHTML = accHtml || `<option value="">${t('optNoAcc')}</option>`; $('tx-acc-to').innerHTML = accHtml;
  $('tx-budget').innerHTML = `<option value="">${t('optNoBud')}</option>` + state.budgets.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
}

function getIconData(type) {
  switch(type) {
    case 'income': return { icon: 'fa-arrow-down', cls: 'icon-income', sign: '+' };
    case 'expense': return { icon: 'fa-arrow-up', cls: 'icon-expense', sign: '-' };
    case 'transfer': return { icon: 'fa-right-left', cls: 'icon-transfer', sign: '' };
    case 'debt': return { icon: 'fa-handshake', cls: 'icon-debt', sign: '-' };
    default: return { icon: 'fa-circle', cls: '', sign: '' };
  }
}

function getOnboardingStatus() {
  const wallet = state.onboarding?.walletConfigured === true || state.transactions.length > 0 || state.accounts.some(a => Number(a.balance || 0) !== 0);
  const budget = state.budgets.length > 0;
  const transaction = state.transactions.length > 0;
  const goal = state.goals.length > 0;
  const dashboard = state.onboarding?.dashboardReviewed === true;
  return { wallet, budget, transaction, goal, dashboard };
}

function markOnboardingFlag(key, value = true) {
  state.onboarding = state.onboarding || { dismissed:false, walletConfigured:false, dashboardReviewed:false };
  state.onboarding[key] = value;
  saveData();
}

function dismissOnboarding() {
  markOnboardingFlag('dismissed', true);
  renderOnboarding();
  showToast('Panduan awal disembunyikan. Kamu tetap bisa menggunakan semua fitur.');
}

function reviewDashboardFromOnboarding() {
  state.onboarding = state.onboarding || {};
  state.onboarding.dashboardReviewed = true;
  saveData();
  go('home');
  renderOnboarding();
  showToast('Ringkasan dashboard ditandai sudah ditinjau.');
}

function onboardingAction(action) {
  if (action === 'wallet') { go('wallet'); openWalletModal(); }
  else if (action === 'budget') { go('budget'); openBudgetModal(); }
  else if (action === 'transaction') openTxModal();
  else if (action === 'goal') { go('plan'); openGoalModal(); }
  else if (action === 'dashboard') reviewDashboardFromOnboarding();
}

function renderOnboarding() {
  const card = $('onboarding-card');
  const container = $('onboarding-steps');
  if (!card || !container) return;
  state.onboarding = state.onboarding || { dismissed:false, walletConfigured:false, dashboardReviewed:false };
  const status = getOnboardingStatus();
  const doneCount = Object.values(status).filter(Boolean).length;
  if (state.onboarding.dismissed || doneCount === 5) { card.hidden = true; return; }
  card.hidden = false;
  const bar = $('onboarding-progress-bar'); if (bar) bar.style.width = `${doneCount * 20}%`;
  const steps = [
    ['wallet','Atur dompet pertama','Pastikan nama dan saldo awal sesuai kondisi nyata.'],
    ['budget','Buat budget pertama','Mulai dari satu kategori yang paling perlu dikendalikan.'],
    ['transaction','Catat transaksi pertama','Catat manual atau gunakan scan struk sebagai draft.'],
    ['goal','Buat target tabungan','Pisahkan uang tujuan dari uang yang terasa bebas dipakai.'],
    ['dashboard','Tinjau dashboard','Pastikan ringkasan saldo, budget, dan tagihan sudah masuk akal.']
  ];
  container.innerHTML = steps.map(([key,title,desc]) => {
    const done = status[key];
    return `<div class="onboarding-step ${done ? 'done' : ''}"><div class="onboarding-check"><i class="fa-solid ${done ? 'fa-check' : 'fa-circle'}"></i></div><div class="onboarding-copy"><strong>${title}</strong><span>${desc}</span></div>${done ? '' : `<button type="button" class="onboarding-action" onclick="onboardingAction('${key}')">Mulai</button>`}</div>`;
  }).join('');
}

function announceStatus(message) { const live = $('a11y-status'); if (!live) return; live.textContent=''; requestAnimationFrame(() => { live.textContent=String(message || ''); }); }

function render() {
  renderOnboarding();
  renderHome();
  renderBudget();
  renderWallet();
  renderHistoryFilters();
  renderPlanning();
  updatePrivacySettingsUI();
  requestAnimationFrame(applyPrivacyModeToDOM);
}


function dashboardDueLabel(dateKey) {
  const due = parseLocalDate(dateKey);
  if (!due) return '-';
  const today = startOfLocalDay(new Date());
  const diff = Math.round((startOfLocalDay(due) - today) / 86400000);
  if (state.lang === 'en') {
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `${diff} days left`;
  }
  if (diff < 0) return `Terlambat ${Math.abs(diff)} hari`;
  if (diff === 0) return 'Jatuh tempo hari ini';
  if (diff === 1) return 'Besok';
  return `${diff} hari lagi`;
}

function renderHomeUpcomingBills() {
  const container = $('home-upcoming-bills');
  if (!container) return;
  const today = startOfLocalDay(new Date());
  const end = addDaysLocal(today, 60);
  // Dashboard hanya menampilkan satu kejadian terdekat untuk setiap tagihan berulang.
  // Satu tagihan bulanan sebenarnya punya banyak proyeksi tanggal ke depan; tanpa
  // deduplikasi, kartu yang sama bisa muncul 2x (mis. 24 hari dan 54 hari lagi).
  const projected = getUpcomingBillOccurrences(today, end)
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const seenBillIds = new Set();
  const bills = projected
    .filter(item => {
      if (seenBillIds.has(item.billId)) return false;
      seenBillIds.add(item.billId);
      return true;
    })
    .slice(0, 6);
  if (!bills.length) {
    container.innerHTML = `<div class="home-bill-empty">Belum ada tagihan mendatang. Tambahkan tagihan berulang di menu Rencana supaya kewajiban bulanan terlihat dari dashboard.</div>`;
    return;
  }
  container.innerHTML = bills.map(item => {
    const source = state.recurringBills.find(bill => bill.id === item.billId);
    const due = parseLocalDate(item.date);
    const diff = due ? Math.round((startOfLocalDay(due) - today) / 86400000) : 99;
    const urgent = diff <= 1;
    return `<article class="home-bill-card" onclick="openRecurringBillModal('${item.billId}')" title="Buka ${escapeHtml(item.name)}">
      <div class="home-bill-icon"><i class="fa-solid ${source?.category?.toLowerCase().includes('internet') ? 'fa-wifi' : source?.category?.toLowerCase().includes('rumah') ? 'fa-house' : 'fa-receipt'}"></i></div>
      <div class="home-bill-name">${escapeHtml(item.name)}</div>
      <span class="home-bill-amount">${toRp(item.amount)}</span>
      <span class="home-bill-due${urgent ? ' urgent' : ''}">${escapeHtml(dashboardDueLabel(item.date))}</span>
    </article>`;
  }).join('');
}

function renderHomePrimaryGoal() {
  const container = $('home-primary-goal');
  if (!container) return;
  const candidates = [...state.goals]
    .filter(goal => Number(goal.target || 0) > 0)
    .sort((a,b) => {
      const aDone = Number(a.saved || 0) >= Number(a.target || 0);
      const bDone = Number(b.saved || 0) >= Number(b.target || 0);
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aDeadline = a.deadline || '9999-12-31';
      const bDeadline = b.deadline || '9999-12-31';
      if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
      const aProgress = Number(a.saved || 0) / Math.max(1, Number(a.target || 1));
      const bProgress = Number(b.saved || 0) / Math.max(1, Number(b.target || 1));
      return bProgress - aProgress;
    });
  const goal = candidates[0];
  if (!goal) {
    container.innerHTML = `<div class="home-goal-empty">Belum ada target tabungan. Buat satu target utama agar progres yang paling penting selalu terlihat di dashboard.<br><br><button type="button" class="home-goal-btn primary" onclick="openGoalModal()">Buat Target</button></div>`;
    return;
  }
  const saved = Math.max(0, Number(goal.saved || 0));
  const target = Math.max(1, Number(goal.target || 1));
  const progress = Math.max(0, Math.min(100, (saved / target) * 100));
  const remaining = Math.max(0, target - saved);
  container.innerHTML = `
    <div class="home-goal-top">
      <div class="home-goal-emoji">${escapeHtml(goal.emoji || '🎯')}</div>
      <span class="home-goal-percent">${progress.toFixed(0)}%</span>
    </div>
    <strong class="home-goal-name">${escapeHtml(goal.name)}</strong>
    <div class="home-goal-numbers"><span>${toRp(saved)} terkumpul</span><span>Sisa ${toRp(remaining)}</span></div>
    <div class="home-goal-progress"><span style="width:${progress.toFixed(1)}%"></span></div>
    <div class="home-goal-actions">
      <button type="button" class="home-goal-btn primary" onclick="openGoalContributionModal('${goal.id}','deposit')"><i class="fa-solid fa-plus"></i> Setor</button>
      <button type="button" class="home-goal-btn" onclick="openGoalModal('${goal.id}')">Detail</button>
    </div>`;
}

function renderHome() {
  const currentMonth = getCurrentMonthKey();
  const totalBal = state.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  renderPrivateBalanceMetric($('total-balance'), totalBal, { currency:true, duration:620 });

  let inc = 0, exp = 0; const chartData = {};
  const monthTxs = state.transactions.filter(t => getMonthKey(t.date) === currentMonth);
  monthTxs.forEach(t => {
    const amount = Number(t.amount || 0);
    if (t.type === 'income') inc += amount;
    if (t.type === 'expense') {
      const group = getTransactionDisplayCategory(t);
      exp += amount;
      chartData[group] = (chartData[group] || 0) + amount;
    }
  });

  renderPrivateBalanceMetric($('home-income'), inc, { currency:true, prefix:'+ ' });
  renderPrivateBalanceMetric($('home-expense'), exp, { currency:true, prefix:'- ' });
  updateBalanceVisibilityControl();
  drawChart(chartData);
  renderHomeUpcomingBills();
  renderHomePrimaryGoal();

  const latestTx = [...state.transactions]
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  let txHtml = '';
  if (!latestTx.length) {
    txHtml = `<div style="text-align:center;color:var(--text-muted);font-size:.72rem;padding:24px 14px;">${t('no_tx')}</div>`;
  } else {
    latestTx.forEach(item => {
      const icon = getIconData(item.type);
      const account = state.accounts.find(a => a.id === item.accountId);
      const category = item.type === 'expense' ? getTransactionDisplayCategory(item) : item.category;
      let subText = `${item.date} • ${account ? account.name : '?'}`;
      if (item.type === 'expense' && item.smartCategory) subText = `${item.smartCategory} • ${subText}`;
      if (item.type === 'transfer') {
        const toAccount = state.accounts.find(a => a.id === item.accountToId);
        subText = `Ke: ${toAccount ? toAccount.name : '?'} • ${item.date}`;
      }
      const amountColor = item.type === 'income' ? 'var(--success)' : item.type === 'expense' || item.type === 'debt' ? 'var(--danger)' : 'var(--text-main)';
      const receiptBadge = item.receiptMeta ? '<span class="receipt-source-badge"><i class="fa-solid fa-receipt"></i> Struk</span>' : '';
      txHtml += `<div class="tx-item" onclick="openTxModal('${item.id}')">
        <div class="tx-icon ${icon.cls}"><i class="fa-solid ${icon.icon}"></i></div>
        <div class="tx-details"><div class="tx-title">${escapeHtml(category || item.category || '-')}</div><div class="tx-sub">${receiptBadge}${escapeHtml(subText)}</div></div>
        <div class="tx-amount" style="color:${amountColor}">${icon.sign}${toRp(item.amount)}</div>
      </div>`;
    });
  }
  $('home-tx-list').innerHTML = txHtml;
}

function drawChart(dataObj) {
  const ctx = $('expenseChart');
  const rawSorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]);
  const totalRaw = rawSorted.reduce((sum, [,value]) => sum + Number(value || 0), 0);
  let sorted = rawSorted.slice(0, 4);
  if (rawSorted.length > 4) {
    const rest = rawSorted.slice(4).reduce((sum, [,value]) => sum + Number(value || 0), 0);
    if (rest > 0) sorted.push([state.lang === 'en' ? 'Other' : 'Lainnya', rest]);
  }
  const labels = sorted.map(([label]) => label);
  const data = sorted.map(([,value]) => value);
  const total = totalRaw;

  if(data.length === 0) {
    ctx.style.display = 'none'; $('chart-empty').style.display = 'block'; $('chart-breakdown').innerHTML = '';
    if (myChart) { myChart.destroy(); myChart = null; }
    return;
  }
  ctx.style.display = 'block'; $('chart-empty').style.display = 'none';

  $('chart-breakdown').innerHTML = sorted.map(([label, value], index) => {
    const pct = total ? (value / total) * 100 : 0;
    const alertClass = index === 0 && pct >= 35 ? 'chart-row-alert' : '';
    const alertText = index === 0 && pct >= 35 ? ' • paling besar' : '';
    return `<div class="chart-row"><div class="chart-row-main"><div class="chart-row-name ${alertClass}">${escapeHtml(label)}</div><div class="chart-row-meta">${pct.toFixed(1)}% dari total${alertText}</div></div><div class="chart-row-amount">${toRp(value)}</div></div>`;
  }).join('');

  if (myChart) myChart.destroy();
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#0F172A';
  const valueLabelPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx: chartCtx } = chart;
      const meta = chart.getDatasetMeta(0);
      chartCtx.save();
      chartCtx.textAlign = 'center'; chartCtx.textBaseline = 'middle'; chartCtx.font = "700 11px 'Plus Jakarta Sans'";
      meta.data.forEach((arc, index) => {
        const props = arc.getProps(['x','y','startAngle','endAngle','innerRadius','outerRadius'], true);
        if ((props.endAngle - props.startAngle) < .34) return;
        const angle = (props.startAngle + props.endAngle) / 2;
        const radius = (props.innerRadius + props.outerRadius) / 2;
        chartCtx.fillStyle = '#FFFFFF';
        chartCtx.fillText(privacyModeEnabled ? 'Rp •••••' : formatCompactRp(data[index]), props.x + Math.cos(angle) * radius, props.y + Math.sin(angle) * radius);
      });
      chartCtx.restore();
    },
    beforeDraw(chart) {
      const { ctx: chartCtx, chartArea } = chart;
      if (!chartArea) return;
      const x = (chartArea.left + chartArea.right) / 2;
      const y = (chartArea.top + chartArea.bottom) / 2;
      chartCtx.save(); chartCtx.textAlign = 'center'; chartCtx.textBaseline = 'middle'; chartCtx.fillStyle = textColor;
      chartCtx.font = "700 11px 'Plus Jakarta Sans'"; chartCtx.fillText('Total keluar', x, y - 9);
      chartCtx.font = "800 13px 'Plus Jakarta Sans'"; chartCtx.fillText(privacyModeEnabled ? 'Rp •••••' : formatCompactRp(total), x, y + 11); chartCtx.restore();
    }
  };

  myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#4F46E5', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'], borderWidth: 2, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(), hoverOffset: 5 }]
    },
    plugins: [valueLabelPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '64%',
      layout: { padding: 12 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => `${context.label}: ${privacyModeEnabled ? 'Rp •••••••' : toRp(context.raw)} (${total ? ((context.raw/total)*100).toFixed(1) : 0}%)` } }
      }
    }
  });
}
function renderBudget() {
  let html = '';
  if(state.budgets.length === 0) {
    html = `<div class="empty-action-state"><strong>Belum ada budget</strong><p>Buat satu amplop untuk kategori yang paling perlu kamu kendalikan. Kamu bisa memilih apakah sisanya diakumulasi.</p><button type="button" onclick="openBudgetModal()">Buat Budget</button></div>`;
  } else {
    state.budgets.forEach(b => {
      const status = calculateBudgetStatus(b);
      const denominator = Math.max(0, status.available);
      const pct = denominator > 0 ? Math.min((status.spent / denominator) * 100, 100) : (status.spent > 0 ? 100 : 0);
      let color = 'var(--success)';
      if (pct > 75) color = 'var(--warning)';
      if (pct > 95 || status.remaining < 0) color = 'var(--danger)';
      const remainingColor = status.remaining < 0 ? 'var(--danger)' : 'var(--text-main)';
      const rolloverBadge = status.rollover
        ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:.66rem;font-weight:800;"><i class="fa-solid fa-rotate"></i> Akumulasi aktif</span>`
        : `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:var(--bg);color:var(--text-muted);font-size:.66rem;font-weight:800;border:1px solid var(--border-color);">Reset tiap periode</span>`;

      html += `<div class="budget-item" role="button" tabindex="0" onclick="openBudgetModal('${b.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openBudgetModal('${b.id}')}" aria-label="Edit budget ${escapeHtml(b.name)}" style="padding:15px;border:1px solid var(--border-color);border-radius:16px;background:color-mix(in srgb,var(--surface) 96%,transparent);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px;">
            <div style="min-width:0;">
              <div style="font-weight:800;color:var(--text-main);overflow-wrap:anywhere;">${escapeHtml(b.name)}</div>
              <div style="font-size:.68rem;color:var(--text-muted);margin-top:4px;">${budgetPeriodLabel(status.period)}</div>
            </div>
            ${rolloverBadge}
          </div>

          <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-end;margin-bottom:9px;">
            <div>
              <div style="font-size:.7rem;color:var(--text-muted);">Tersedia periode ini</div>
              <div style="font-size:1.08rem;font-weight:800;color:var(--text-main);margin-top:2px;">${toRp(status.available)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:.7rem;color:var(--text-muted);">Terpakai</div>
              <div style="font-size:.9rem;font-weight:800;color:${status.spent > status.available ? 'var(--danger)' : 'var(--text-main)'};">${toRp(status.spent)}</div>
            </div>
          </div>

          <div class="progress-bg"><div class="progress-bar" style="width:${pct}%;background:${color};"></div></div>

          <div style="display:grid;grid-template-columns:repeat(${status.rollover ? 3 : 2},minmax(0,1fr));gap:8px;margin-top:12px;">
            ${status.rollover ? `<div style="background:var(--bg);border-radius:11px;padding:9px;"><div style="font-size:.65rem;color:var(--text-muted);">Bawaan lalu</div><strong style="font-size:.76rem;display:block;margin-top:3px;">${toRp(status.carryIn)}</strong></div>` : ''}
            <div style="background:var(--bg);border-radius:11px;padding:9px;"><div style="font-size:.65rem;color:var(--text-muted);">Jatah baru</div><strong style="font-size:.76rem;display:block;margin-top:3px;">${toRp(status.quota)}</strong></div>
            <div style="background:var(--bg);border-radius:11px;padding:9px;"><div style="font-size:.65rem;color:var(--text-muted);">Sisa</div><strong style="font-size:.76rem;display:block;margin-top:3px;color:${remainingColor};">${toRp(status.remaining)}</strong></div>
          </div>
        </div>`;
    });
  }
  $('budget-list').innerHTML = html;
}

function renderWallet() {
  let html = '';
  if (!state.accounts.length) { $('wallet-list').innerHTML = `<div class="empty-action-state"><strong>Belum ada dompet</strong><p>Tambahkan tempat uang disimpan agar transaksi dapat mengubah saldo dengan benar.</p><button type="button" onclick="openWalletModal()">Tambah Dompet</button></div>`; return; }
  state.accounts.forEach(a => {
    html += `<div class="wallet-card"><button class="btn-edit-wallet" onclick="openWalletModal('${a.id}')" aria-label="Edit dompet ${escapeHtml(a.name)}"><i class="fa-solid fa-pen"></i></button>
        <div class="wallet-name"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(a.name)}</div>
        <div class="wallet-bal">${toRp(a.balance)}</div></div>`;
  });
  $('wallet-list').innerHTML = html;
}

function renderHistoryFilters() {
  const months = new Set(); state.transactions.forEach(t => months.add(getMonthKey(t.date))); months.add(getCurrentMonthKey());
  const sortedMonths = Array.from(months).sort().reverse();
  const sel = $('filter-month'); const currentVal = sel.value || getCurrentMonthKey();
  
  sel.innerHTML = sortedMonths.map(m => {
    return `<option value="${m}">${formatMonthLabel(m)}</option>`;
  }).join('');
  if(sortedMonths.includes(currentVal)) sel.value = currentVal;
  renderHistory();
}

function renderHistory() {
  const filter = $('filter-month').value;
  const txs = state.transactions.filter(t => getMonthKey(t.date) === filter).sort((a,b) => new Date(b.date) - new Date(a.date));
  let html = '';
  if(txs.length === 0) html = `<div class="empty-action-state"><strong>Belum ada transaksi</strong><p>Catat pemasukan atau pengeluaran pertama supaya riwayat dan ringkasan mulai terbentuk.</p><button type="button" onclick="openTxModal()">Catat Transaksi</button></div>`;
  else {
    txs.forEach(t => {
      const icn = getIconData(t.type); const acc = state.accounts.find(a => a.id === t.accountId);
      const receiptBadge = t.receiptMeta ? '<span class="receipt-source-badge"><i class="fa-solid fa-receipt"></i> Struk</span>' : '';
      html += `<div class="tx-item"><div class="tx-icon ${icn.cls}"><i class="fa-solid ${icn.icon}"></i></div>
          <div class="tx-details"><div class="tx-title">${escapeHtml(t.category)}</div><div class="tx-sub">${receiptBadge}${t.smartCategory ? `<span class=\"smart-category-badge\">${escapeHtml(t.smartCategory)}</span>` : ''}${t.date} • ${escapeHtml(acc ? acc.name : '?')}</div></div>
          <div style="text-align:right;"><div class="tx-amount" style="color: ${t.type === 'income' ? 'var(--success)' : 'var(--text-main)'}">${icn.sign}${toRp(t.amount)}</div>
            <div style="margin-top:5px;"><button onclick="openTxModal('${t.id}')" aria-label="Edit transaksi ${escapeHtml(t.category)}" style="background:none; border:none; color:var(--primary); cursor:pointer; margin-right:10px;"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deleteTx('${t.id}')" aria-label="Hapus transaksi ${escapeHtml(t.category)}" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
            </div></div></div>`;
    });
  }
  $('full-tx-list').innerHTML = html;
  requestAnimationFrame(applyPrivacyModeToDOM);
}

// ================= ONLINE AI FINANCE CHAT =================
let aiBusy = false;

function buildFinancialContext() {
  const currentMonth = getCurrentMonthKey();
  const recentTransactions = [...state.transactions]
    .filter(tx => getMonthKey(tx.date) >= monthOffsetKey(-5))
    .sort((a,b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 200)
    .map(tx => ({
      date: tx.date, type: tx.type, amount: Number(tx.amount || 0), category: safeText(tx.category, 100),
      account: state.accounts.find(a => a.id === tx.accountId)?.name || 'Tidak diketahui',
      budget: state.budgets.find(b => b.id === tx.budgetId)?.name || null
    }));
  return {
    generatedAt: new Date().toISOString(), currentMonth,
    profile: { name: state.user?.name || 'Pengguna' },
    accounts: state.accounts.map(a => ({ name: safeText(a.name, 60), balance: Number(a.balance || 0) })),
    budgets: state.budgets.map(b => {
      const status = calculateBudgetStatus(b);
      return {
        name: safeText(b.name, 80),
        limit: Number(b.limit || 0),
        rollover: b.rollover === true,
        carryIn: Number(status.carryIn || 0),
        available: Number(status.available || 0),
        spent: Number(status.spent || 0),
        remaining: Number(status.remaining || 0)
      };
    }),
    transactions: recentTransactions
  };
}

function monthOffsetKey(offset) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function appendAIMessage(role, text, persist = true) {
  const log = $('ai-chat-log');
  const row = document.createElement('div'); row.className = `ai-message ${role}`;
  const bubble = document.createElement('div'); bubble.className = 'ai-bubble'; bubble.textContent = text;
  row.appendChild(bubble); log.appendChild(row); log.scrollTop = log.scrollHeight;
  if (persist) {
    state.aiChat.push({ role, text: safeText(text, 5000), at: Date.now() });
    state.aiChat = state.aiChat.slice(-20); saveData();
  }
  requestAnimationFrame(applyPrivacyModeToDOM);
  return bubble;
}

function renderAIChatHistory() {
  if (!state.aiChat.length) return;
  $('ai-chat-log').innerHTML = '';
  state.aiChat.forEach(msg => appendAIMessage(msg.role === 'user' ? 'user' : 'assistant', msg.text, false));
}

function useQuickPrompt(text) {
  openAIWidget();
  $('ai-chat-input').value = text; $('ai-chat-input').focus();
}

function resetAIChat() {
  state.aiChat = []; saveData();
  $('ai-chat-log').innerHTML = '<div class="ai-message assistant"><div class="ai-bubble">Chat direset. Kirim pertanyaan baru dan saya akan membaca ringkasan keuangan terbaru.</div></div>';
}

let aiPinRequired = false;

async function checkAIConnection() {
  const label = $('ai-connection');
  if (!label) return;
  try {
    const response = await fetch('/api/chat', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('offline');
    const health = await response.json();
    aiPinRequired = Boolean(health.pinRequired);
    label.innerHTML = health.aiConfigured
      ? `<span class="ai-status-dot online"></span>${aiPinRequired ? 'Gemini siap • PIN diperlukan' : 'Gemini siap digunakan'}`
      : '<span class="ai-status-dot"></span>GEMINI_API_KEY belum diisi di Vercel';
  } catch {
    label.innerHTML = '<span class="ai-status-dot"></span>API Vercel belum aktif';
  }
}

function getAIAccessPin() {
  let pin = localStorage.getItem('KITA_TABUNG_AI_PIN') || '';
  if (aiPinRequired && !pin) {
    pin = safeText(prompt('Masukkan PIN AI yang kamu isi di Vercel:') || '', 80);
    if (pin) localStorage.setItem('KITA_TABUNG_AI_PIN', pin);
  }
  return pin;
}


function generateOfflineFinanceAdvice(reason = '') {
  const month = getCurrentMonthKey();
  const txs = state.transactions.filter(tx => getMonthKey(tx.date) === month);
  let income = 0, expense = 0, debt = 0;
  const categories = {};
  const budgetSpend = {};

  txs.forEach(tx => {
    const amount = Number(tx.amount || 0);
    if (tx.type === 'income') income += amount;
    if (tx.type === 'expense') {
      expense += amount;
      const category = safeText(tx.category, 80) || 'Lainnya';
      categories[category] = (categories[category] || 0) + amount;
      if (tx.budgetId) budgetSpend[tx.budgetId] = (budgetSpend[tx.budgetId] || 0) + amount;
    }
    if (tx.type === 'debt') debt += amount;
  });

  const totalBalance = state.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const top = sortedCategories[0] || null;
  const net = income - expense - debt;
  const savingsRate = income > 0 ? Math.round((Math.max(net, 0) / income) * 100) : 0;
  const expenseRate = income > 0 ? Math.round((expense / income) * 100) : null;
  const overBudgets = state.budgets.map(budget => ({
    name: budget.name,
    spent: budgetSpend[budget.id] || 0,
    limit: Number(budget.limit || 0)
  })).filter(item => item.limit > 0 && item.spent > item.limit);

  const findings = [];
  findings.push(`Saldo seluruh dompet: ${toRp(totalBalance)}.`);
  findings.push(`Pemasukan bulan ini ${toRp(income)}, pengeluaran ${toRp(expense)}, dan transaksi utang/piutang keluar ${toRp(debt)}.`);
  if (top) findings.push(`Kategori terbesar adalah ${top[0]} sebesar ${toRp(top[1])}${expense ? ` atau ${Math.round(top[1] / expense * 100)}% dari pengeluaran` : ''}.`);
  if (expenseRate !== null) findings.push(`Pengeluaran memakai sekitar ${expenseRate}% dari pemasukan bulan ini.`);
  else findings.push('Belum ada pemasukan bulan ini, jadi rasio pengeluaran belum dapat dinilai dengan benar.');

  const problems = [];
  if (income <= 0 && expense > 0) problems.push('Kamu mencatat pengeluaran tanpa pemasukan pada bulan yang sama. Arus kas tidak dapat bertahan seperti ini.');
  if (net < 0) problems.push(`Arus kas defisit ${toRp(Math.abs(net))}. Kamu membelanjakan lebih banyak daripada uang yang masuk.`);
  if (top && expense > 0 && top[1] / expense >= 0.35) problems.push(`${top[0]} menguasai minimal 35% pengeluaran. Ini titik kebocoran utama.`);
  if (overBudgets.length) problems.push(`Budget terlewati: ${overBudgets.map(item => `${item.name} lebih ${toRp(item.spent - item.limit)}`).join(', ')}.`);
  if (!problems.length) problems.push(`Arus kas masih terkendali. Rasio tabungan sementara sekitar ${savingsRate}%.`);

  const actions = [];
  if (net < 0) actions.push(`Bekukan pengeluaran nonwajib sampai defisit ${toRp(Math.abs(net))} tertutup.`);
  if (top) {
    const reduction = Math.max(Math.round(top[1] * 0.2), 10000);
    actions.push(`Turunkan ${top[0]} minimal ${toRp(reduction)} pada sisa bulan ini.`);
  }
  if (income > 0 && savingsRate < 10) actions.push(`Pindahkan minimal ${toRp(Math.round(income * 0.1))} ke tabungan segera setelah pemasukan berikutnya.`);
  if (overBudgets.length) actions.push('Jangan menaikkan limit budget untuk menutupi pemborosan. Hentikan transaksi pada kategori yang sudah melewati batas.');
  if (!actions.length) actions.push('Pertahankan batas pengeluaran sekarang dan alihkan kenaikan pemasukan berikutnya ke dana darurat.');

  return [
    'Mode analisis offline aktif. Gemini sedang tidak tersedia.',
    reason ? `Penyebab: ${safeText(reason, 220)}` : '',
    '',
    'TEMUAN',
    ...findings.map(item => `• ${item}`),
    '',
    'MASALAH UTAMA',
    ...problems.map(item => `• ${item}`),
    '',
    'TINDAKAN PRIORITAS',
    ...actions.slice(0, 3).map((item, index) => `${index + 1}. ${item}`)
  ].filter(Boolean).join('\n');
}

async function sendAIMessage(message) {
  if (aiBusy) return;
  aiBusy = true;
  $('ai-send-btn').disabled = true;
  appendAIMessage('user', message);
  const bubble = appendAIMessage('assistant', 'Menganalisis data keuangan...', false);
  let finalText = '';

  try {
    const history = state.aiChat.slice(0, -1).slice(-10).map(m => ({ role: m.role, content: m.text }));
    const pin = getAIAccessPin();
    if (aiPinRequired && !pin) throw new Error('PIN AI belum dimasukkan.');

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(await getPrivateApiAuthHeader()),
        ...(pin ? { 'X-AI-PIN': pin } : {})
      },
      body: JSON.stringify({ message, history, finance: buildFinancialContext() })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403) localStorage.removeItem('KITA_TABUNG_AI_PIN');
      throw new Error(result.error || `Server error ${response.status}`);
    }

    finalText = safeText(result.answer, 5000);
    if (!finalText) throw new Error('Gemini tidak mengirim jawaban.');
    bubble.textContent = finalText;
    state.aiChat.push({ role: 'assistant', text: finalText, at: Date.now() });
    state.aiChat = state.aiChat.slice(-20);
    saveData();
    $('ai-connection').innerHTML = '';
  } catch (error) {
    finalText = generateOfflineFinanceAdvice(error.message);
    bubble.textContent = finalText;
    state.aiChat.push({ role: 'assistant', text: safeText(finalText, 5000), at: Date.now() });
    state.aiChat = state.aiChat.slice(-20);
    saveData();
    $('ai-connection').innerHTML = '';
  } finally {
    $('ai-chat-log').scrollTop = $('ai-chat-log').scrollHeight;
    aiBusy = false;
    $('ai-send-btn').disabled = false;
  }
}

function openAIWidget() {
  const widget = $('ai-widget');
  if (!widget) return;
  widget.classList.add('open');
  widget.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ai-widget-open');
  const main = document.querySelector('.main-content');
  if (main) main.dataset.previousOverflow = main.style.overflowY || '';
  if (main && window.innerWidth <= 640) main.style.overflowY = 'hidden';
  requestAnimationFrame(() => {
    const log = $('ai-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  });
  setTimeout(() => { if ($('ai-chat-input')) $('ai-chat-input').focus({ preventScroll: true }); }, 260);
}

function closeAIWidget() {
  const widget = $('ai-widget');
  if (!widget) return;
  widget.classList.remove('open');
  widget.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ai-widget-open');
  const main = document.querySelector('.main-content');
  if (main) main.style.overflowY = main.dataset.previousOverflow || '';
}

function toggleAIWidget() {
  const widget = $('ai-widget');
  if (!widget) return;
  widget.classList.contains('open') ? closeAIWidget() : openAIWidget();
}

function preventPullToRefresh() {
  const scroller = document.querySelector('.main-content');
  if (!scroller) return;
  let startY = 0;
  scroller.addEventListener('touchstart', event => { startY = event.touches[0]?.clientY || 0; }, { passive: true });
  scroller.addEventListener('touchmove', event => {
    const y = event.touches[0]?.clientY || 0;
    if (scroller.scrollTop <= 0 && y > startY) event.preventDefault();
  }, { passive: false });
}


// ================= PWA & DEVICE NOTIFICATIONS =================
let deferredInstallPrompt = null;
let pwaServiceWorkerRegistration = null;

function isPWAStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updatePWASettingsUI() {
  const installBtn = $('pwa-install-btn');
  const installStatus = $('pwa-install-status');
  const notificationBtn = $('pwa-notification-btn');
  const notificationStatus = $('pwa-notification-status');
  const standalone = isPWAStandalone();

  if (installBtn && installStatus) {
    if (standalone) {
      installBtn.textContent = 'Terpasang';
      installBtn.disabled = true;
      installStatus.textContent = 'KITA TABUNG sudah berjalan sebagai aplikasi.';
    } else if (deferredInstallPrompt) {
      installBtn.textContent = 'Pasang';
      installBtn.disabled = false;
      installStatus.textContent = 'Pasang ke layar utama untuk akses lebih cepat.';
    } else {
      installBtn.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'Cara Pasang' : 'Pasang';
      installBtn.disabled = false;
      installStatus.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? 'Di Safari: Bagikan → Tambahkan ke Layar Utama.'
        : 'Tersedia setelah browser menyiapkan instalasi.';
    }
  }

  if (notificationBtn && notificationStatus) {
    if (!('Notification' in window)) {
      notificationBtn.textContent = 'Tidak tersedia';
      notificationBtn.disabled = true;
      notificationStatus.textContent = 'Browser ini belum mendukung notifikasi web.';
    } else if (Notification.permission === 'granted') {
      notificationBtn.textContent = 'Aktif';
      notificationBtn.disabled = true;
      notificationStatus.textContent = 'Pengingat tagihan aktif saat aplikasi dibuka.';
    } else if (Notification.permission === 'denied') {
      notificationBtn.textContent = 'Diblokir';
      notificationBtn.disabled = true;
      notificationStatus.textContent = 'Izinkan notifikasi melalui pengaturan browser.';
    } else {
      notificationBtn.textContent = 'Aktifkan';
      notificationBtn.disabled = false;
      notificationStatus.textContent = 'Pengingat lokal saat aplikasi dibuka.';
    }
  }
}

async function installPWA() {
  if (isPWAStandalone()) return showToast('KITA TABUNG sudah terpasang sebagai aplikasi.');
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') showToast('KITA TABUNG sedang dipasang ke perangkat.');
    deferredInstallPrompt = null;
    updatePWASettingsUI();
    return;
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    showToast('Safari: tekan Bagikan lalu pilih “Tambahkan ke Layar Utama”.');
  } else {
    showToast('Buka menu browser lalu pilih “Install app” / “Tambahkan ke layar utama”.');
  }
}

async function enableDeviceNotifications() {
  if (!('Notification' in window)) return showToast('Browser ini belum mendukung notifikasi.', true);
  try {
    const permission = await Notification.requestPermission();
    updatePWASettingsUI();
    if (permission === 'granted') {
      showToast('Notifikasi tagihan berhasil diaktifkan.');
      await maybeShowDueBillNotification(true);
    } else if (permission === 'denied') {
      showToast('Notifikasi diblokir oleh browser.', true);
    }
  } catch (error) {
    showToast(`Notifikasi gagal diaktifkan: ${error.message}`, true);
  }
}

async function maybeShowDueBillNotification(force = false) {
  if (!activeUserId || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = startOfLocalDay(new Date());
  const limit = addDaysLocal(today, 1);
  const due = state.recurringBills.filter(bill => {
    if (!bill.active) return false;
    const date = parseLocalDate(bill.nextDueDate);
    return date && date <= limit;
  }).sort((a,b) => String(a.nextDueDate).localeCompare(String(b.nextDueDate)));
  if (!due.length) return;
  const key = `KITA_TABUNG_NOTIFY_${activeUserId}_${toDateKey(today)}`;
  if (!force && localStorage.getItem(key) === '1') return;
  const overdue = due.filter(bill => parseLocalDate(bill.nextDueDate) < today).length;
  const title = overdue ? `${overdue} tagihan perlu perhatian` : 'Tagihan KITA TABUNG';
  const first = due[0];
  const body = due.length === 1
    ? `${first.name} · ${toRp(first.amount)} · ${formatDateShort(first.nextDueDate)}`
    : `${due.length} tagihan jatuh tempo hari ini/besok. Buka KITA TABUNG untuk melihat detail.`;
  try {
    const registration = pwaServiceWorkerRegistration || await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, { body, icon:'icons/icon-192.png', badge:'icons/icon-192.png', tag:'kitabung-bills', renotify:false, data:{ url:'./app.html' } });
    } else {
      new Notification(title, { body, icon:'icons/icon-192.png' });
    }
    localStorage.setItem(key, '1');
  } catch (error) {
    console.warn('Notifikasi perangkat gagal:', error);
  }
}

async function initPWA() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updatePWASettingsUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updatePWASettingsUI();
    showToast('KITA TABUNG berhasil dipasang.');
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try {
      pwaServiceWorkerRegistration = await navigator.serviceWorker.register('./sw.js', { scope:'./' });
    } catch (error) {
      console.warn('Service worker gagal didaftarkan:', error);
    }
  }
  updatePWASettingsUI();
}

// ================= EVENT BINDINGS =================
function bindTransactionTypeButtons() {
  const selector = document.getElementById('tx-type-selector');
  if (!selector) return;

  selector.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (!type) return;
      updateTxType(type);
    });
  });
}


function showAuthMessage(message, isError = false) {
  const element = $('auth-message');
  if (!element) return;
  element.textContent = message || '';
  element.style.color = isError ? '#FFD5DA' : '#FFFFFF';
  element.setAttribute('role', isError ? 'alert' : 'status');
  if (isError && message) requestAnimationFrame(() => element.focus?.({ preventScroll:true }));
}

function friendlyAuthError(error, context = 'auth') {
  const raw = String(error?.message || '').toLowerCase();
  if (/rate|too many|limit|429/.test(raw)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (context === 'login') return 'Email atau password belum cocok. Periksa kembali lalu coba lagi.';
  if (context === 'register') return 'Pendaftaran belum dapat diselesaikan. Periksa data lalu coba lagi atau gunakan halaman Masuk bila akun sudah pernah dibuat.';
  if (context === 'recovery') return 'Jika email tersebut terdaftar, kode reset akan dikirim. Periksa inbox dan folder spam.';
  return 'Permintaan belum dapat diproses. Coba lagi beberapa saat.';
}

function setAuthMode(mode, clearMessage = true) {
  const isRegister = mode === 'register';
  if ($('auth-mode')) $('auth-mode').value = isRegister ? 'register' : 'login';
  if ($('auth-tab-login')) $('auth-tab-login').classList.toggle('active', !isRegister);
  if ($('auth-tab-register')) $('auth-tab-register').classList.toggle('active', isRegister);
  if ($('auth-card-login')) $('auth-card-login').classList.toggle('active', !isRegister);
  if ($('auth-card-register')) $('auth-card-register').classList.toggle('active', isRegister);
  if ($('auth-password')) $('auth-password').autocomplete = 'current-password';
  if ($('register-password')) $('register-password').autocomplete = 'new-password';
  if ($('login-name')) $('login-name').required = true;
  if (clearMessage) showAuthMessage('');

  if (window.innerWidth <= 760) {
    requestAnimationFrame(() => {
      const target = isRegister ? $('login-name') : $('auth-email');
      if (target) target.focus({ preventScroll: true });
    });
  }
}

function setAuthBusy(busy) {
  ['auth-submit-btn', 'register-submit-btn', 'auth-forgot-btn'].forEach(id => {
    if ($(id)) $(id).disabled = busy;
  });
  ['auth-submit-btn', 'register-submit-btn'].forEach(id => {
    if ($(id)) $(id).style.opacity = busy ? '.65' : '1';
  });
}

function toggleAuthPassword(inputId, button) {
  const input = $(inputId);
  if (!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  button.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
}

async function handleAuthenticatedUser(user) {
  if (location.hash === '#login' || location.hash === '#register') history.replaceState(null, '', location.pathname);
  if (!user) return;
  clearPendingEmailOtp();
  showAuthMessage('Mengambil dan menyinkronkan data keuangan...');
  await hydrateUserFinanceData(user);
  closeModal('modal-login');
  applyTheme();
  applyLanguageText();
  syncThemeControls();
  updateGreeting();
  renderAIChatHistory();
  render();
  if ($('setting-account-email')) $('setting-account-email').textContent = activeUserEmail || '-';
  showToast('Akun dan data keuangan berhasil dimuat.');
}

async function registerUser(email, password) {
  const displayName = safeText($('login-name').value, 40);
  const emoji = safeText($('login-emoji').value, 8) || '💸';
  if (!displayName) throw new Error('Nama panggilan wajib diisi.');

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, emoji },
      emailRedirectTo: AUTH_REDIRECT_URL
    }
  });
  if (error) throw error;

  if (!data.session) {
    pendingEmailOtp = { flow: 'signup', email, displayName, emoji };
    savePendingEmailOtp();
    showAuthMessage('Kode verifikasi sudah dikirim ke email. Masukkan kode tersebut untuk mengaktifkan akun.');
    openAuthOtpModal('signup', email);
    return;
  }

  state.user = { name: displayName, emoji };
  await handleAuthenticatedUser(data.user);
}
async function loginUser(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await handleAuthenticatedUser(data.user);
}

async function sendPasswordReset() {
  if (!supabaseClient) return showAuthMessage('Konfigurasi Supabase belum diisi.', true);
  const email = safeText($('auth-email').value, 160).toLowerCase();
  if (!email) return showAuthMessage('Isi email terlebih dahulu.', true);
  setAuthBusy(true);
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT_URL
    });
    if (error) throw error;
    pendingEmailOtp = { flow: 'recovery', email, displayName: '', emoji: '' };
    savePendingEmailOtp();
    showAuthMessage('Jika email terdaftar, kode reset password akan dikirim. Periksa inbox atau spam.');
    openAuthOtpModal('recovery', email);
  } catch (error) {
    showAuthMessage(friendlyAuthError(error, 'recovery'), true);
  } finally {
    setAuthBusy(false);
  }
}

function setAuthOtpMessage(message = '', isError = false) {
  const el = $('auth-otp-message');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
}

function openAuthOtpModal(flow, email) {
  pendingEmailOtp.flow = flow;
  pendingEmailOtp.email = email || pendingEmailOtp.email || '';
  savePendingEmailOtp();
  const isRecovery = flow === 'recovery';
  if ($('auth-otp-title')) $('auth-otp-title').textContent = isRecovery ? 'Kode Reset Password' : 'Verifikasi Email';
  if ($('auth-otp-description')) $('auth-otp-description').textContent = isRecovery
    ? 'Kami mengirim kode reset ke email kamu. Salin kodenya di sini untuk membuat password baru.'
    : 'Kami mengirim kode verifikasi ke email kamu. Salin kodenya di sini untuk mengaktifkan akun.';
  if ($('auth-otp-email')) $('auth-otp-email').textContent = pendingEmailOtp.email || '-';
  if ($('auth-otp-code')) $('auth-otp-code').value = '';
  setAuthOtpMessage('');
  openModal('modal-auth-otp');
  setTimeout(() => $('auth-otp-code')?.focus(), 120);
}

function closeAuthOtpModal() {
  closeModal('modal-auth-otp');
  setAuthOtpMessage('');
}

async function verifyEmailOtp(event) {
  event?.preventDefault?.();
  if (!supabaseClient) return;
  const email = pendingEmailOtp.email;
  const flow = pendingEmailOtp.flow;
  const token = String($('auth-otp-code')?.value || '').replace(/\D/g, '').slice(0, 8);
  if (!email || !flow) return setAuthOtpMessage('Sesi verifikasi tidak ditemukan. Kirim kode baru.', true);
  if (token.length < 6) return setAuthOtpMessage('Masukkan kode verifikasi dari email.', true);

  const btn = $('auth-otp-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Memverifikasi...'; }
  setAuthOtpMessage('');
  try {
    const verifyType = flow === 'recovery' ? 'recovery' : 'email';
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email,
      token,
      type: verifyType
    });
    if (error) throw error;

    closeModal('modal-auth-otp');

    if (flow === 'recovery') {
      clearPendingEmailOtp();
      openPasswordRecoveryModal();
      return;
    }

    if (data?.user) {
      state.user = {
        name: pendingEmailOtp.displayName || data.user.user_metadata?.display_name || 'Pengguna',
        emoji: pendingEmailOtp.emoji || data.user.user_metadata?.emoji || '💸'
      };
      await handleAuthenticatedUser(data.user);
    }
    clearPendingEmailOtp();
    showToast('Email berhasil diverifikasi. Akun KITA TABUNG sudah aktif.');
  } catch (error) {
    setAuthOtpMessage(error?.message || 'Kode salah atau sudah kedaluwarsa. Kirim kode baru lalu coba lagi.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Verifikasi Kode'; }
  }
}

async function resendEmailOtp() {
  if (!supabaseClient || !pendingEmailOtp.email || !pendingEmailOtp.flow) {
    return setAuthOtpMessage('Sesi verifikasi tidak ditemukan.', true);
  }
  const btn = $('auth-otp-resend');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
  setAuthOtpMessage('');
  try {
    let error = null;
    if (pendingEmailOtp.flow === 'signup') {
      ({ error } = await supabaseClient.auth.resend({
        type: 'signup',
        email: pendingEmailOtp.email,
        options: { emailRedirectTo: AUTH_REDIRECT_URL }
      }));
    } else {
      ({ error } = await supabaseClient.auth.resetPasswordForEmail(pendingEmailOtp.email, {
        redirectTo: AUTH_REDIRECT_URL
      }));
    }
    if (error) throw error;
    setAuthOtpMessage('Kode baru sudah dikirim. Periksa inbox atau folder spam.');
  } catch (error) {
    setAuthOtpMessage(error?.message || 'Gagal mengirim ulang kode.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Kirim Ulang Kode'; }
  }
}
function cleanAuthTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    ['token_hash','type','auth_action'].forEach(key => url.searchParams.delete(key));
    const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
    window.history.replaceState({}, document.title, clean);
  } catch (_) {}
}

function setRecoveryPasswordMessage(message = '', isError = false) {
  const el = $('recovery-password-message');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
}

function openPasswordRecoveryModal() {
  if ($('modal-login')) $('modal-login').style.display = 'none';
  if ($('recovery-password')) $('recovery-password').value = '';
  if ($('recovery-password-confirm')) $('recovery-password-confirm').value = '';
  setRecoveryPasswordMessage('');
  openModal('modal-password-recovery');
  setTimeout(() => $('recovery-password')?.focus(), 120);
}

async function handleDirectAuthToken() {
  if (!supabaseClient) return { handled: false };
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const rawType = (params.get('type') || '').toLowerCase();
  if (!tokenHash || !rawType) return { handled: false };

  const verifyType = rawType === 'signup' ? 'email' : rawType;
  if (!['email', 'recovery', 'invite', 'email_change'].includes(verifyType)) {
    cleanAuthTokenFromUrl();
    return { handled: true, error: new Error('Tipe tautan autentikasi tidak dikenali.') };
  }

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: verifyType
    });
    if (error) throw error;
    cleanAuthTokenFromUrl();

    if (data?.user) {
      await hydrateUserFinanceData(data.user);
    }

    if (verifyType === 'recovery') {
      openPasswordRecoveryModal();
      return { handled: true, recovery: true, user: data?.user || null };
    }

    showToast('Email berhasil diverifikasi.');
    return { handled: true, verified: true, user: data?.user || null };
  } catch (error) {
    cleanAuthTokenFromUrl();
    console.error('Verifikasi link email gagal:', error);
    return { handled: true, error };
  }
}

async function saveRecoveredPassword(event) {
  event?.preventDefault?.();
  if (!supabaseClient) return;
  const password = $('recovery-password')?.value || '';
  const confirmPassword = $('recovery-password-confirm')?.value || '';
  if (password.length < 8) return setRecoveryPasswordMessage('Password minimal 8 karakter.', true);
  if (password !== confirmPassword) return setRecoveryPasswordMessage('Konfirmasi password tidak sama.', true);

  const btn = $('recovery-password-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  setRecoveryPasswordMessage('');
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    closeModal('modal-password-recovery');
    showToast('Password berhasil diperbarui. Silakan gunakan password baru.');
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user && !activeUserId) await hydrateUserFinanceData(user);
    render();
  } catch (error) {
    setRecoveryPasswordMessage(error.message || 'Password gagal diperbarui.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Password Baru'; }
  }
}

function positionProfileMenu() {
  const panel = $('profile-menu-panel');
  const trigger = $('profile-pic');
  const wrap = document.querySelector('.profile-menu-wrap');
  if (!panel || !trigger || !wrap) return;

  const isMobile = window.innerWidth <= 640;
  if (!isMobile) {
    if (panel.parentElement !== wrap) wrap.appendChild(panel);
    panel.classList.remove('profile-menu-mobile');
    panel.style.top = '';
    panel.style.right = '';
    panel.style.left = '';
    return;
  }

  // Move the dropdown outside the sticky/blurred header so mobile overflow
  // or backdrop-filter cannot clip the account menu.
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  panel.classList.add('profile-menu-mobile');
  panel.style.right = '12px';
  panel.style.left = 'auto';

  const triggerRect = trigger.getBoundingClientRect();
  const safeTop = Math.max(12, triggerRect.bottom + 10);
  panel.style.top = `${safeTop}px`;

  // If the menu would fall below the viewport, open it above the profile icon.
  requestAnimationFrame(() => {
    if (!panel.classList.contains('open')) return;
    const menuHeight = panel.offsetHeight || 0;
    const viewportBottom = window.innerHeight - 12;
    let top = safeTop;
    if (top + menuHeight > viewportBottom) {
      top = Math.max(12, triggerRect.top - menuHeight - 10);
    }
    panel.style.top = `${top}px`;
  });
}

function toggleProfileMenu(event) {
  if (event) event.stopPropagation();
  const panel = $('profile-menu-panel');
  const trigger = $('profile-pic');
  if (!panel || !trigger) return;

  const shouldOpen = !panel.classList.contains('open');
  if (shouldOpen) positionProfileMenu();
  panel.classList.toggle('open', shouldOpen);
  panel.setAttribute('aria-hidden', String(!shouldOpen));
  trigger.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) positionProfileMenu();
}

function closeProfileMenu() {
  const panel = $('profile-menu-panel');
  const trigger = $('profile-pic');
  const wrap = document.querySelector('.profile-menu-wrap');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (wrap && panel.parentElement !== wrap) wrap.appendChild(panel);
    panel.classList.remove('profile-menu-mobile');
    panel.style.top = '';
    panel.style.right = '';
    panel.style.left = '';
  }
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function logoutUser() {
  closeProfileMenu();

  if (!supabaseClient || !activeUserId) {
    updateCloudStatus('auth');
    setAuthMode(getRequestedAuthMode());
    openModal('modal-login');
    return;
  }

  openModal('modal-logout');
}

async function confirmLogout() {
  if (!supabaseClient || !activeUserId) {
    closeModal('modal-logout');
    openModal('modal-login');
    return;
  }

  const button = $('logout-confirm-btn');
  const originalHtml = button?.innerHTML || 'Ya, Logout';

  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-rotate sync-spin"></i> Menyimpan & Logout...';
  }

  try {
    clearTimeout(cloudSyncTimer);
    closeAIWidget();

    // Coba simpan perubahan terakhir. Logout tetap dilanjutkan bila jaringan sedang gagal,
    // karena cache akun lokal tidak dihapus.
    saveLocalCache();
    await saveCloudState({ force: true });

    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    localStorage.removeItem('KITA_TABUNG_AI_PIN');

    activeUserId = null;
    activeUserEmail = null;
    cloudReady = false;
    cloudLastSavedAt = null;

    state = normalizeFinanceState(null, getSavedThemeSnapshot());

    if ($('setting-account-email')) $('setting-account-email').textContent = 'Belum login';
    if ($('profile-menu-email')) $('profile-menu-email').textContent = 'Belum login';

    closeModal('modal-logout');
    updateCloudStatus('auth');
    setAuthMode('login');

    if ($('auth-password')) $('auth-password').value = '';
    showAuthMessage('Kamu berhasil logout. Silakan masuk kembali.');

    applyTheme();
    applyLanguageText();
    syncThemeControls();
    updateGreeting();
    render();

    openModal('modal-login');
  } catch (error) {
    console.error('Logout gagal:', error);
    showToast(`Logout gagal: ${error.message || 'Terjadi kesalahan.'}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
}

$('form-login').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient) return showAuthMessage('Konfigurasi Supabase belum diisi di file HTML.', true);

  const email = safeText($('auth-email').value, 160).toLowerCase();
  const password = $('auth-password').value;

  if (!email || !email.includes('@')) return showAuthMessage('Masukkan email yang valid.', true);
  if (password.length < 8) return showAuthMessage('Password minimal 8 karakter.', true);

  setAuthMode('login', false);
  setAuthBusy(true);
  showAuthMessage('Memeriksa akun...');
  try {
    await loginUser(email, password);
  } catch (error) {
    console.error('Autentikasi gagal:', error);
    showAuthMessage(friendlyAuthError(error, 'login'), true);
  } finally {
    setAuthBusy(false);
  }
});

$('form-register').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient) return showAuthMessage('Konfigurasi Supabase belum diisi di file HTML.', true);

  const email = safeText($('register-email').value, 160).toLowerCase();
  const password = $('register-password').value;
  const name = safeText($('login-name').value, 40);

  if (!name) return showAuthMessage('Nama wajib diisi.', true);
  if (!email || !email.includes('@')) return showAuthMessage('Masukkan email yang valid.', true);
  if (password.length < 8) return showAuthMessage('Password minimal 8 karakter.', true);

  setAuthMode('register', false);
  setAuthBusy(true);
  showAuthMessage('Membuat akun...');
  try {
    await registerUser(email, password);
  } catch (error) {
    console.error('Pendaftaran gagal:', error);
    showAuthMessage(friendlyAuthError(error, 'register'), true);
  } finally {
    setAuthBusy(false);
  }
});

$('form-profile-modal').addEventListener('submit', async event => {
  event.preventDefault();
  const name = safeText($('profile-name-modal').value, 40);
  const emoji = safeText($('profile-emoji-modal').value, 8) || '💸';
  if (!name) return;
  await persistProfile(name, emoji);
  closeModal('modal-profile');
  showToast('Profil tersimpan.');
});

$('ai-chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const message = safeText($('ai-chat-input').value, 1500);
  if (!message || aiBusy) return;
  $('ai-chat-input').value = '';
  sendAIMessage(message);
});

$('form-password-recovery')?.addEventListener('submit', saveRecoveredPassword);
$('form-auth-otp')?.addEventListener('submit', verifyEmailOtp);
$('auth-otp-code')?.addEventListener('input', event => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 8); });

function enhanceAccessibility() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
    const heading = modal.querySelector('h1,h2,h3'); if (heading) { if (!heading.id) heading.id = `${modal.id}-title`; modal.setAttribute('aria-labelledby', heading.id); }
  });
  document.querySelectorAll('.close-btn,.modal-close').forEach(btn => { if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label','Tutup dialog'); });
  document.querySelectorAll('.form-group,.auth-field,.settings-grid > div').forEach(group => {
    const label = group.querySelector('label:not([for])');
    const control = group.querySelector('input[id]:not([type=hidden]),select[id],textarea[id]');
    if (label && control) label.htmlFor = control.id;
  });
  const controlLabels = {
    'filter-month':'Pilih bulan riwayat','theme-toggle':'Aktifkan mode gelap','adaptive-theme-toggle':'Ikuti tema perangkat','lang-select':'Pilih bahasa',
    'setting-user-name':'Nama panggilan','setting-user-emoji':'Emoji profil','theme-emoji':'Emoji aplikasi','setting-privacy-toggle':'Aktifkan mode privasi',
    'privacy-reopen-mode':'Perilaku mode privasi saat aplikasi dibuka','ai-chat-input':'Pertanyaan untuk asisten keuangan'
  };
  Object.entries(controlLabels).forEach(([id,label]) => { const el=$(id); if (el && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) el.setAttribute('aria-label',label); });
  document.querySelectorAll('button[onclick*="openWalletModal"] i.fa-plus').forEach(icon => icon.closest('button')?.setAttribute('aria-label','Tambah dompet'));
  document.querySelectorAll('button').forEach(btn => {
    if (btn.getAttribute('aria-label') || btn.textContent.trim()) return;
    const action = btn.getAttribute('onclick') || '';
    if (/close|cancel/i.test(action)) btn.setAttribute('aria-label','Tutup dialog');
    else if (/open.*Modal/i.test(action)) btn.setAttribute('aria-label','Buka tindakan');
  });
  const chart = $('expenseChart'); if (chart) { chart.setAttribute('role','img'); chart.setAttribute('aria-label','Grafik pengeluaran bulan berjalan. Rincian kategori tersedia di daftar di samping grafik.'); }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const open = [...document.querySelectorAll('.modal-overlay')].reverse().find(m => getComputedStyle(m).display === 'flex');
    if (!open) return;
    const items = [...open.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
    if (!items.length) return; const first=items[0], last=items[items.length-1];
    if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
  });
}

function getRequestedAuthMode() { return location.hash === '#register' ? 'register' : 'login'; }

// ================= INIT =================
window.onload = async () => {
  enhanceAccessibility();
  bindTransactionTypeButtons();
  bindSmartCategory();
  bindReceiptScanner();
  initPWA();
  bindThemePreviewControls();
  bindInteractiveEffects();
  bindGlobalSearch();
  bindAdaptiveThemeListener();
  preventPullToRefresh();
  checkAIConnection();
  initializeSupabaseClient();
  restorePendingEmailOtp();

  let directAuthResult = { handled: false };
  if (supabaseClient) {
    directAuthResult = await handleDirectAuthToken();
  }

  if (!supabaseClient) {
    loadData();
    applyTheme();
    applyLanguageText();
    syncThemeControls();
    initThemeColorWheel();
    renderAIChatHistory();
    render();
    updateCloudStatus('unconfigured');
    $('auth-config-warning').style.display = 'block';
    setAuthMode(getRequestedAuthMode());
    openModal('modal-login');
  } else {
    $('auth-config-warning').style.display = 'none';
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) console.error('Session Supabase gagal:', error);

    if (session?.user) {
      clearPendingEmailOtp();
      if (!activeUserId) await hydrateUserFinanceData(session.user);
      if ($('setting-account-email')) $('setting-account-email').textContent = activeUserEmail || '-';
    } else {
      loadData();
      updateCloudStatus('auth');
      setAuthMode(getRequestedAuthMode());
      if (!directAuthResult.recovery) openModal('modal-login');
    }

    if (directAuthResult.error) {
      setAuthMode('login', false);
      openModal('modal-login');
      showAuthMessage('Link verifikasi/reset tidak valid atau sudah kedaluwarsa. Minta email baru lalu coba lagi.', true);
    }

    applyTheme();
    applyLanguageText();
    syncThemeControls();
    initThemeColorWheel();
    renderAIChatHistory();
    render();

    supabaseClient.auth.onAuthStateChange((event, sessionNow) => {
      if (event === 'SIGNED_OUT') {
        activeUserId = null;
        activeUserEmail = null;
        cloudReady = false;
        updateCloudStatus('auth');
      }
      if (event === 'TOKEN_REFRESHED' && sessionNow?.user) {
        activeUserId = sessionNow.user.id;
      }
      if (event === 'PASSWORD_RECOVERY') {
        openPasswordRecoveryModal();
      }
    });
  }

  const savedTab = localStorage.getItem('KITA_TABUNG_ACTIVE_TAB') || 'home';
  go(savedTab);
  setTimeout(() => { updatePWASettingsUI(); maybeShowDueBillNotification(); }, 900);

  document.addEventListener('click', event => {
    const profileWrap = event.target.closest('.profile-menu-wrap');
    if (!profileWrap) closeProfileMenu();

    const widget = $('ai-widget');
    const btn = $('ai-float-btn');
    if (!widget || !btn || !widget.classList.contains('open')) return;
    if (widget.contains(event.target) || btn.contains(event.target)) return;
    closeAIWidget();
  });

  document.addEventListener('keydown', event => {
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openGlobalSearch();
      return;
    }
    if (event.key === '/' && !typing && $('modal-login')?.style.display !== 'flex') {
      event.preventDefault();
      openGlobalSearch();
      return;
    }
    if (event.key === 'Escape') {
      closeAIWidget();
      closeProfileMenu();
      closeGlobalSearch();
      if ($('modal-logout')?.style.display === 'flex') closeModal('modal-logout');
    }
  });

  window.addEventListener('resize', () => {
    const panel = $('profile-menu-panel');
    if (panel?.classList.contains('open')) positionProfileMenu();
  }, { passive: true });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      const panel = $('profile-menu-panel');
      if (panel?.classList.contains('open')) positionProfileMenu();
    }, 120);
  });

  window.addEventListener('online', () => {
    if (activeUserId) queueCloudSync(150);
  });
  window.addEventListener('offline', () => updateCloudStatus('offline'));

  window.addEventListener('pagehide', () => {
    persistThemeState();
    saveLocalCache();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistThemeState();
      saveLocalCache();
      if (activeUserId && navigator.onLine) saveCloudState();
    }
  });
};
