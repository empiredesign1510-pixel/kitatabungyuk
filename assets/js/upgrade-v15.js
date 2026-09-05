/* KITA TABUNG V15 - Reliability, Automation & Insight extension */
(() => {
  'use strict';

  const UPGRADE_VERSION = '15.0.0';
  const DIAG_KEY = 'KITA_TABUNG_DIAGNOSTICS_V2';
  const MAX_HISTORY_PERIODS = 24;
  const MAX_INBOX = 500;
  const MAX_ARCHIVE = 200;

  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const nowIso = () => new Date().toISOString();
  const money = value => Math.max(0, Math.round(Number(value || 0)));
  const normalizeWord = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const dateInside = (value, period) => {
    const date = parseLocalDate(value);
    return Boolean(date && date >= period.start && date <= period.end);
  };

  function normalizePeriodRecord(item) {
    if (!item || typeof item !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(item.periodStart || '')) return null;
    return {
      periodStart: item.periodStart,
      periodEnd: /^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd || '') ? item.periodEnd : item.periodStart,
      capturedAt: item.capturedAt || nowIso(),
      source: ['live','closed','reconstructed','migrated-ai'].includes(item.source) ? item.source : 'live',
      closed: item.closed === true,
      budgets: Array.isArray(item.budgets) ? item.budgets.map(b => ({
        id: safeText(b?.id, 40),
        name: safeText(b?.name, 80) || 'Budget',
        rollover: b?.rollover === true,
        carryIn: money(b?.carryIn),
        quota: money(b?.quota ?? b?.limit),
        available: money(b?.available ?? b?.limit),
        spent: money(b?.spent),
        remaining: Number.isFinite(Number(b?.remaining)) ? Math.round(Number(b.remaining)) : money(b?.available ?? b?.limit) - money(b?.spent)
      })) : []
    };
  }

  function normalizeSplit(item) {
    if (!item || typeof item !== 'object') return null;
    const amount = money(item.amount);
    if (amount <= 0) return null;
    return {
      amount,
      smartCategory: safeText(item.smartCategory, 60) || 'Lainnya',
      budgetId: safeText(item.budgetId, 60)
    };
  }

  function normalizeInboxDraft(item) {
    if (!item || typeof item !== 'object') return null;
    const type = ['expense','income','debt','transfer'].includes(item.type) ? item.type : 'expense';
    return {
      id: safeText(item.id, 50) || generateId(),
      source: ['import','recurring','receipt','manual'].includes(item.source) ? item.source : 'manual',
      sourceRef: safeText(item.sourceRef, 80),
      dueKey: safeText(item.dueKey, 20),
      type,
      amount: money(item.amount),
      description: safeText(item.description, 120) || 'Transaksi',
      smartCategory: safeText(item.smartCategory, 60),
      accountId: safeText(item.accountId, 60),
      budgetId: safeText(item.budgetId, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : toDateKey(new Date()),
      duplicateOf: safeText(item.duplicateOf, 50),
      duplicateReason: safeText(item.duplicateReason, 140),
      needsReview: item.needsReview === true,
      createdAt: item.createdAt || nowIso(),
      meta: item.meta && typeof item.meta === 'object' ? item.meta : {}
    };
  }

  function normalizeSmartRule(item) {
    if (!item || typeof item !== 'object') return null;
    const match = safeText(item.match, 100);
    if (!match) return null;
    return {
      id: safeText(item.id, 50) || generateId(),
      match,
      type: ['expense','income','any'].includes(item.type) ? item.type : 'any',
      category: safeText(item.category, 60),
      accountId: safeText(item.accountId, 60),
      budgetId: safeText(item.budgetId, 60),
      enabled: item.enabled !== false,
      createdAt: item.createdAt || nowIso()
    };
  }

  function normalizeRecurringTransaction(item) {
    if (!item || typeof item !== 'object') return null;
    return {
      id: safeText(item.id, 50) || generateId(),
      name: safeText(item.name, 100) || 'Transaksi rutin',
      type: ['expense','income'].includes(item.type) ? item.type : 'expense',
      amount: money(item.amount),
      accountId: safeText(item.accountId, 60),
      budgetId: safeText(item.budgetId, 60),
      smartCategory: safeText(item.smartCategory, 60),
      frequency: ['weekly','monthly','yearly'].includes(item.frequency) ? item.frequency : 'monthly',
      nextDueDate: /^\d{4}-\d{2}-\d{2}$/.test(item.nextDueDate || '') ? item.nextDueDate : toDateKey(new Date()),
      active: item.active !== false,
      createdAt: item.createdAt || nowIso()
    };
  }

  function normalizeClosing(item) {
    if (!item || typeof item !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(item.periodStart || '')) return null;
    return {
      id: safeText(item.id, 50) || generateId(),
      periodStart: item.periodStart,
      periodEnd: /^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd || '') ? item.periodEnd : item.periodStart,
      closedAt: item.closedAt || nowIso(),
      income: money(item.income),
      expense: money(item.expense),
      net: Math.round(Number(item.net || 0)),
      savingsRate: Number.isFinite(Number(item.savingsRate)) ? Number(item.savingsRate) : 0,
      goalDeposits: money(item.goalDeposits),
      budgetSnapshot: Array.isArray(item.budgetSnapshot) ? item.budgetSnapshot : []
    };
  }

  // Extend the persisted state without altering the existing database schema.
  const originalNormalizeFinanceState = normalizeFinanceState;
  normalizeFinanceState = function(raw, savedTheme = null) {
    const normalized = originalNormalizeFinanceState(raw, savedTheme);
    const source = raw && typeof raw === 'object' ? raw : {};
    normalized.transactions = normalized.transactions.map(tx => ({
      ...tx,
      splits: Array.isArray(tx?.splits) ? tx.splits.map(normalizeSplit).filter(Boolean).slice(0, 20) : []
    }));
    normalized.budgetHistory = (Array.isArray(source.budgetHistory) ? source.budgetHistory : []).map(normalizePeriodRecord).filter(Boolean).slice(-MAX_HISTORY_PERIODS);
    normalized.inboxDrafts = (Array.isArray(source.inboxDrafts) ? source.inboxDrafts : []).map(normalizeInboxDraft).filter(Boolean).slice(-MAX_INBOX);
    normalized.inboxArchive = (Array.isArray(source.inboxArchive) ? source.inboxArchive : []).slice(-MAX_ARCHIVE);
    normalized.smartRules = (Array.isArray(source.smartRules) ? source.smartRules : []).map(normalizeSmartRule).filter(Boolean).slice(0, 200);
    normalized.recurringTransactions = (Array.isArray(source.recurringTransactions) ? source.recurringTransactions : []).map(normalizeRecurringTransaction).filter(Boolean).slice(0, 200);
    normalized.periodClosings = (Array.isArray(source.periodClosings) ? source.periodClosings : []).map(normalizeClosing).filter(Boolean).slice(-MAX_HISTORY_PERIODS);
    normalized.bankImportSummary = source.bankImportSummary && typeof source.bankImportSummary === 'object' ? source.bankImportSummary : null;
    normalized.auditLog = (Array.isArray(source.auditLog) ? source.auditLog : []).slice(-120).map(item => ({
      id:safeText(item?.id,50)||generateId(), action:safeText(item?.action,80), detail:safeText(item?.detail,160), at:item?.at||nowIso()
    }));
    return normalized;
  };

  function ensureStateExtensions() {
    if (!Array.isArray(state.budgetHistory)) state.budgetHistory = [];
    if (!Array.isArray(state.inboxDrafts)) state.inboxDrafts = [];
    if (!Array.isArray(state.inboxArchive)) state.inboxArchive = [];
    if (!Array.isArray(state.smartRules)) state.smartRules = [];
    if (!Array.isArray(state.recurringTransactions)) state.recurringTransactions = [];
    if (!Array.isArray(state.periodClosings)) state.periodClosings = [];
    if (!('bankImportSummary' in state)) state.bankImportSummary = null;
    if (!Array.isArray(state.auditLog)) state.auditLog = [];
  }

  function periodFromStartKey(startKey) {
    const d = parseLocalDate(startKey);
    return d ? getBudgetPeriodBounds(d) : getBudgetPeriodBounds(new Date());
  }

  function budgetSnapshotForPeriod(period, { source = 'live', budgetSource = null } = {}) {
    const sourceBudgets = Array.isArray(budgetSource) ? budgetSource : state.budgets;
    return {
      periodStart: period.startKey,
      periodEnd: period.endKey,
      capturedAt: nowIso(),
      source,
      closed: source === 'closed',
      budgets: sourceBudgets.map(budget => {
        const status = calculateBudgetStatus(budget, period.start);
        return {
          id: safeText(budget.id, 40),
          name: safeText(budget.name, 80),
          rollover: budget.rollover === true,
          carryIn: money(status.carryIn),
          quota: money(status.quota),
          available: money(status.available),
          spent: money(status.spent),
          remaining: Math.round(Number(status.remaining || 0))
        };
      })
    };
  }

  function migratedAIRecord(record) {
    if (!record || !/^\d{4}-\d{2}$/.test(record.month || '') || !Array.isArray(record.data)) return null;
    const [year, month] = record.month.split('-').map(Number);
    const payday = Math.min(28, Math.max(1, Number(state.payday?.day || 25)));
    const period = getBudgetPeriodBounds(new Date(year, month - 1, payday));
    const budgets = record.data.map(item => ({
      id: safeText(item.id, 40) || generateId(),
      name: safeText(item.name, 80) || 'Budget',
      limit: money(item.limit),
      rollover: item.rollover === true,
      rolloverStart: item.rolloverStart || period.startKey,
      limitHistory: Array.isArray(item.limitHistory) ? item.limitHistory : [{ effectivePeriodStart: period.startKey, limit: money(item.limit) }]
    }));
    const snapshot = budgetSnapshotForPeriod(period, { source: 'migrated-ai', budgetSource: budgets });
    snapshot.capturedAt = nowIso();
    return snapshot;
  }

  function budgetsRelevantToPeriod(period) {
    const idsWithTransactions = new Set();
    state.transactions.filter(tx => tx.type === 'expense' && dateInside(tx.date, period)).forEach(tx => {
      if (tx.budgetId) idsWithTransactions.add(tx.budgetId);
      (Array.isArray(tx.splits) ? tx.splits : []).forEach(part => { if (part?.budgetId) idsWithTransactions.add(part.budgetId); });
    });
    return state.budgets.filter(budget => {
      if (idsWithTransactions.has(budget.id)) return true;
      const history = Array.isArray(budget.limitHistory) ? budget.limitHistory : [];
      if (history.some(item => item.effectivePeriodStart <= period.startKey)) return true;
      const activation = parseLocalDate(budget.rolloverStart || '');
      return Boolean(activation && activation <= period.end);
    });
  }

  function reconstructPeriod(period) {
    const relevant = budgetsRelevantToPeriod(period);
    if (!relevant.length) return null;
    return budgetSnapshotForPeriod(period, { source: 'reconstructed', budgetSource: relevant });
  }

  function upsertBudgetHistory(record, { preserveClosed = true } = {}) {
    if (!record) return;
    ensureStateExtensions();
    const idx = state.budgetHistory.findIndex(item => item.periodStart === record.periodStart);
    if (idx >= 0) {
      if (preserveClosed && state.budgetHistory[idx].closed) return;
      const currentSource = state.budgetHistory[idx].source;
      if (currentSource === 'migrated-ai' && record.source === 'reconstructed') return;
      state.budgetHistory[idx] = record;
    } else {
      state.budgetHistory.push(record);
    }
    state.budgetHistory.sort((a,b) => a.periodStart.localeCompare(b.periodStart));
    if (state.budgetHistory.length > MAX_HISTORY_PERIODS) state.budgetHistory = state.budgetHistory.slice(-MAX_HISTORY_PERIODS);
  }

  function ensureBudgetHistoryIntegrity() {
    ensureStateExtensions();
    const migrated = Array.isArray(state.aiHistory) ? state.aiHistory.map(migratedAIRecord).filter(Boolean) : [];
    migrated.forEach(record => { if (!state.budgetHistory.some(item => item.periodStart === record.periodStart)) upsertBudgetHistory(record); });

    const current = getBudgetPeriodBounds(new Date());
    const periodKeys = new Set();
    state.transactions.forEach(tx => {
      const d = parseLocalDate(tx.date);
      if (d) periodKeys.add(getBudgetPeriodBounds(d).startKey);
    });
    state.budgets.forEach(budget => (budget.limitHistory || []).forEach(item => periodKeys.add(item.effectivePeriodStart)));
    periodKeys.add(getBudgetPeriodBounds(addDaysLocal(current.start, -1)).startKey);

    [...periodKeys].sort().slice(-12).forEach(key => {
      if (state.budgetHistory.some(item => item.periodStart === key)) return;
      const reconstructed = reconstructPeriod(periodFromStartKey(key));
      if (reconstructed) upsertBudgetHistory(reconstructed);
    });

    if (state.budgets.length && !state.budgetHistory.some(item => item.periodStart === current.startKey)) upsertBudgetHistory(budgetSnapshotForPeriod(current, { source: 'live' }));
  }

  function syncCurrentBudgetHistorySnapshot() {
    ensureStateExtensions();
    if (!state.budgets.length) return;
    upsertBudgetHistory(budgetSnapshotForPeriod(getBudgetPeriodBounds(new Date()), { source: 'live' }));
  }

  const originalSaveData = saveData;

  function recordAudit(action, detail = '') {
    ensureStateExtensions();
    state.auditLog.push({ id:generateId(), action:safeText(action,80), detail:safeText(detail,160), at:nowIso() });
    state.auditLog = state.auditLog.slice(-120);
  }

  function validTransactionSplits(tx) {
    if (!tx || tx.type !== 'expense' || !Array.isArray(tx.splits) || tx.splits.length < 2) return [];
    const parts = tx.splits.map(normalizeSplit).filter(Boolean);
    const sum = parts.reduce((total,item) => total + money(item.amount), 0);
    return Math.abs(sum - money(tx.amount)) <= 1 ? parts : [];
  }

  const originalBudgetSpentBetween = getBudgetSpentBetween;
  getBudgetSpentBetween = function(budgetId, startDate, endDate) {
    const start = startOfLocalDay(startDate), end = startOfLocalDay(endDate);
    return state.transactions.reduce((sum, tx) => {
      if (tx.type !== 'expense') return sum;
      const date = parseLocalDate(tx.date); if (!date || date < start || date > end) return sum;
      const splits = validTransactionSplits(tx);
      if (splits.length) return sum + splits.filter(part => part.budgetId === budgetId).reduce((s,part) => s + money(part.amount), 0);
      return sum + (tx.budgetId === budgetId ? money(tx.amount) : 0);
    }, 0);
  };

  const originalSummarizeTransactions = summarizeTransactions;
  summarizeTransactions = function(startDate, endDate) {
    const start = startOfLocalDay(startDate), end = startOfLocalDay(endDate);
    const categorySpend = {}, dailySpend = {};
    let income=0, expense=0, debt=0, count=0;
    state.transactions.forEach(tx => {
      const date=parseLocalDate(tx.date); if(!date||date<start||date>end) return;
      const amount=money(tx.amount); count+=1;
      if(tx.type==='income') income+=amount;
      if(tx.type==='expense') {
        expense+=amount; dailySpend[tx.date]=(dailySpend[tx.date]||0)+amount;
        const splits=validTransactionSplits(tx);
        if(splits.length) splits.forEach(part=>{ const cat=part.smartCategory||'Lainnya'; categorySpend[cat]=(categorySpend[cat]||0)+money(part.amount); });
        else { const cat=getTransactionDisplayCategory(tx); categorySpend[cat]=(categorySpend[cat]||0)+amount; }
      }
      if(tx.type==='debt') debt+=amount;
    });
    const topCategory=Object.entries(categorySpend).sort((a,b)=>b[1]-a[1])[0]||null;
    const topDay=Object.entries(dailySpend).sort((a,b)=>b[1]-a[1])[0]||null;
    return {income,expense,debt,net:income-expense-debt,count,categorySpend,dailySpend,topCategory,topDay};
  };

  const originalGetTransactionDisplayCategory = getTransactionDisplayCategory;
  getTransactionDisplayCategory = function(tx) {
    const splits=validTransactionSplits(tx);
    return splits.length ? `Terbagi (${splits.length})` : originalGetTransactionDisplayCategory(tx);
  };

  const originalDrawChart = drawChart;
  drawChart = function() {
    const currentMonth=getCurrentMonthKey(); const data={};
    state.transactions.filter(tx=>tx.type==='expense'&&getMonthKey(tx.date)===currentMonth).forEach(tx=>{
      const splits=validTransactionSplits(tx);
      if(splits.length) splits.forEach(part=>{ const cat=part.smartCategory||'Lainnya'; data[cat]=(data[cat]||0)+money(part.amount); });
      else { const cat=originalGetTransactionDisplayCategory(tx); data[cat]=(data[cat]||0)+money(tx.amount); }
    });
    return originalDrawChart(data);
  };

  let pendingSplitSubmission = null;

  function splitCategoryOptions(selected='') {
    const categories = (typeof RECEIPT_CATEGORIES !== 'undefined' ? RECEIPT_CATEGORIES : ['Makanan & Minuman','Transportasi','Belanja','Tagihan & Subscription','Hiburan','Kesehatan','Pendidikan','Keluarga','Bisnis','Tabungan & Investasi','Lainnya']);
    return categories.map(cat=>`<option value="${escapeHtml(cat)}"${cat===selected?' selected':''}>${escapeHtml(cat)}</option>`).join('');
  }

  function splitBudgetOptions(selected='') {
    return `<option value="">Tanpa budget</option>` + state.budgets.map(b=>`<option value="${b.id}"${b.id===selected?' selected':''}>${escapeHtml(b.name)}</option>`).join('');
  }

  window.addTransactionSplitRow = function(data = {}) {
    const rows=$('tx-split-rows'); if(!rows) return;
    const row=document.createElement('div'); row.className='tx-split-row';
    row.innerHTML=`<input class="form-control tx-split-amount" type="number" min="1" step="1" placeholder="Nominal" value="${money(data.amount)||''}" aria-label="Nominal bagian"><select class="form-control tx-split-category" aria-label="Kategori bagian">${splitCategoryOptions(data.smartCategory||'Lainnya')}</select><select class="form-control tx-split-budget" aria-label="Budget bagian">${splitBudgetOptions(data.budgetId||'')}</select><button type="button" class="tx-split-remove" aria-label="Hapus bagian"><i class="fa-solid fa-xmark"></i></button>`;
    row.querySelector('.tx-split-remove').onclick=()=>{row.remove(); updateTransactionSplitSummary();};
    row.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',updateTransactionSplitSummary));
    rows.appendChild(row); updateTransactionSplitSummary();
  };

  window.toggleTransactionSplit = function(force) {
    const editor=$('tx-split-editor'); if(!editor) return;
    const enable = typeof force==='boolean' ? force : editor.hidden;
    editor.hidden=!enable;
    const btn=$('tx-split-toggle'); if(btn) btn.textContent=enable?'Nonaktifkan':'Aktifkan';
    if(enable && !$('tx-split-rows')?.children.length){ addTransactionSplitRow(); addTransactionSplitRow(); }
    if(!enable) $('tx-split-rows').innerHTML='';
    updateTransactionSplitSummary();
  };

  window.updateTransactionSplitSummary = function() {
    const summary=$('tx-split-summary'); if(!summary) return;
    const total=money($('tx-amount')?.value); const parts=[...document.querySelectorAll('.tx-split-amount')].reduce((sum,el)=>sum+money(el.value),0);
    summary.textContent=`Total split ${toRp(parts)} dari ${toRp(total)}`;
    summary.classList.toggle('ok', total>0 && parts===total); summary.classList.toggle('bad', parts>0 && parts!==total);
  };

  function collectTransactionSplits(total) {
    const editor=$('tx-split-editor'); if(!editor || editor.hidden) return [];
    const rows=[...document.querySelectorAll('.tx-split-row')];
    if(rows.length<2) throw new Error('Split transaksi membutuhkan minimal 2 bagian.');
    const parts=rows.map(row=>normalizeSplit({ amount:row.querySelector('.tx-split-amount')?.value, smartCategory:row.querySelector('.tx-split-category')?.value, budgetId:row.querySelector('.tx-split-budget')?.value })).filter(Boolean);
    if(parts.length!==rows.length) throw new Error('Lengkapi nominal setiap bagian split.');
    const sum=parts.reduce((s,p)=>s+p.amount,0); if(sum!==money(total)) throw new Error(`Total split ${toRp(sum)} harus sama dengan nominal transaksi ${toRp(total)}.`);
    return parts;
  }

  function attachPendingSplitsToTransaction(id = '') {
    if(!pendingSplitSubmission) return null;
    let tx=id ? state.transactions.find(item=>item.id===id) : null;
    if(!tx) {
      const p=pendingSplitSubmission;
      tx=[...state.transactions].reverse().find(item=>item.type==='expense'&&money(item.amount)===p.amount&&item.date===p.date&&item.accountId===p.accountId&&item.category===p.category);
    }
    if(!tx) return null;
    tx.splits=clone(pendingSplitSubmission.splits); tx.budgetId=null; tx.smartCategory=`Terbagi (${tx.splits.length})`;
    pendingSplitSubmission=null; syncCurrentBudgetHistorySnapshot(); originalSaveData(false); originalRender(); requestAnimationFrame(applyPrivacyModeToDOM);
    return tx;
  }

  const originalOpenTxModal = openTxModal;
  openTxModal = function(id=null) {
    originalOpenTxModal(id);
    const tx=id?state.transactions.find(item=>item.id===id):null;
    $('group-tx-split').style.display = ($('tx-type')?.value==='expense') ? 'block' : 'none';
    toggleTransactionSplit(false);
    const parts=validTransactionSplits(tx);
    if(parts.length){ toggleTransactionSplit(true); $('tx-split-rows').innerHTML=''; parts.forEach(addTransactionSplitRow); }
    updateTransactionSplitSummary();
  };

  const originalUpdateTxType = updateTxType;
  updateTxType = function(type) {
    originalUpdateTxType(type); const group=$('group-tx-split'); if(group) group.style.display=type==='expense'?'block':'none'; if(type!=='expense') toggleTransactionSplit(false);
  };

  const splitForm=$('form-tx');
  if(splitForm){
    splitForm.addEventListener('submit',event=>{
      if(($('tx-type')?.value||'')!=='expense'){ pendingSplitSubmission=null; return; }
      try{
        const splits=collectTransactionSplits($('tx-amount')?.value);
        pendingSplitSubmission=splits.length?{splits,id:$('tx-id')?.value||'',amount:money($('tx-amount')?.value),date:$('tx-date')?.value,accountId:$('tx-acc')?.value,category:safeText($('tx-cat')?.value,100)}:null;
      }catch(error){ event.preventDefault(); event.stopImmediatePropagation(); showToast(error.message,true); }
    },true);
    splitForm.addEventListener('submit',()=>{
      if(!pendingSplitSubmission?.id) return;
      setTimeout(()=>{
        // Attach split metadata only after the core transaction handler actually saved and closed the modal.
        // This prevents a failed validation from mutating the old transaction.
        if ($('modal-tx')?.style.display !== 'none') return;
        const tx=attachPendingSplitsToTransaction(pendingSplitSubmission?.id||'');
        if(tx){ recordAudit('Edit transaksi split',`${tx.category} · ${toRp(tx.amount)}`); originalSaveData(false); render(); }
      },0);
    });
    $('tx-amount')?.addEventListener('input',updateTransactionSplitSummary);
  }

  saveData = function(saveTheme = true) {
    try { syncCurrentBudgetHistorySnapshot(); } catch (error) { window.KTDiagnostics?.capture(error, 'budget-history-save'); }
    return originalSaveData(saveTheme);
  };

  const originalShowUndoToast = showUndoToast;
  showUndoToast = function(message, beforeSnapshot) {
    if (pendingSplitSubmission && !pendingSplitSubmission.id) {
      const tx=attachPendingSplitsToTransaction('');
      if(tx) recordAudit('Transaksi split',`${tx.category} · ${toRp(tx.amount)}`);
    }
    recordAudit('Perubahan', safeText(message,150));
    originalSaveData(false);
    return originalShowUndoToast(message,beforeSnapshot);
  };

  const originalUndoLastAction = undoLastAction;
  undoLastAction = function() {
    const hadPendingUndo = Boolean(pendingUndoAction);
    const result = originalUndoLastAction();
    if (hadPendingUndo) {
      recordAudit('Urungkan perubahan','Perubahan terakhir dibatalkan oleh pengguna.');
      originalSaveData(false);
      render();
    }
    return result;
  };

  // Replace the old AI-only history with complete budget-period history.
  openAIHistoryModal = function() {
    ensureBudgetHistoryIntegrity();
    const container = $('ai-history-list');
    const records = [...state.budgetHistory].sort((a,b) => b.periodStart.localeCompare(a.periodStart));
    if (!records.length) {
      container.innerHTML = '<div class="empty-action-state"><strong>Belum ada riwayat budget</strong><p>Riwayat akan tersimpan otomatis setiap periode. Data lama yang bisa dihitung ulang akan muncul sebagai rekonstruksi.</p></div>';
    } else {
      container.innerHTML = records.map(record => {
        const totalQuota = record.budgets.reduce((sum,b) => sum + money(b.quota), 0);
        const totalSpent = record.budgets.reduce((sum,b) => sum + money(b.spent), 0);
        const sourceLabel = record.closed ? 'Ditutup' : record.source === 'reconstructed' ? 'Rekonstruksi' : record.source === 'migrated-ai' ? 'Rencana lama' : 'Tersimpan';
        return `<button type="button" class="ai-history-card kt-history-card" onclick="showAIDetail('${escapeHtml(record.periodStart)}')">
          <div class="kt-history-card-top"><span><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(budgetPeriodLabel(periodFromStartKey(record.periodStart)))}</span><span class="kt-history-source ${record.source}">${sourceLabel}</span></div>
          <div class="kt-history-metrics"><span>Rencana <strong>${toRp(totalQuota)}</strong></span><span>Terpakai <strong>${toRp(totalSpent)}</strong></span></div>
        </button>`;
      }).join('');
    }
    const title = $('t_ai_history_title'); if (title) title.textContent = 'Riwayat Rencana Budget';
    openModal('modal-ai-history');
  };

  showAIDetail = function(periodStart) {
    ensureBudgetHistoryIntegrity();
    closeModal('modal-ai-history');
    const record = state.budgetHistory.find(item => item.periodStart === periodStart);
    if (!record) return;
    const period = periodFromStartKey(record.periodStart);
    $('ai-detail-title').innerText = `Budget ${budgetPeriodLabel(period)}`;
    const sourceNote = record.source === 'reconstructed' ? '<div class="kt-history-note"><i class="fa-solid fa-circle-info"></i> Data ini direkonstruksi dari transaksi dan konfigurasi yang masih tersedia. Nilai rencana lama bisa berbeda jika budget pernah diubah sebelum fitur riwayat otomatis aktif.</div>' : '';
    const rows = record.budgets.length ? record.budgets.map(b => `<div class="kt-history-detail-row"><div><strong>${escapeHtml(b.name)}</strong><span>${b.rollover ? `Bawaan ${toRp(b.carryIn)} · ` : ''}Jatah ${toRp(b.quota)}</span></div><div><strong>${toRp(b.spent)}</strong><span>Sisa ${toRp(b.remaining)}</span></div></div>`).join('') : '<div class="empty-action-state"><strong>Tidak ada budget</strong><p>Tidak ada amplop budget tercatat pada periode ini.</p></div>';
    $('ai-detail-content').innerHTML = `${sourceNote}${rows}`;
    openModal('modal-ai-detail');
  };

  function findSmartRule(description, type = 'expense') {
    ensureStateExtensions();
    const text = normalizeWord(description);
    if (!text) return null;
    return state.smartRules.find(rule => rule.enabled !== false && (rule.type === 'any' || rule.type === type) && text.includes(normalizeWord(rule.match))) || null;
  }

  const originalInferSmartCategory = inferSmartCategory;
  inferSmartCategory = function(description) {
    const rule = findSmartRule(description, $('tx-type')?.value || 'expense');
    return rule?.category || originalInferSmartCategory(description);
  };

  const originalUpdateSmartCategoryHint = updateSmartCategoryHint;
  updateSmartCategoryHint = function() {
    originalUpdateSmartCategoryHint();
    const desc = $('tx-cat')?.value || '';
    const type = $('tx-type')?.value || 'expense';
    const rule = findSmartRule(desc, type);
    if (!rule) return;
    if (rule.category && $('tx-smart-category')) $('tx-smart-category').value = rule.category;
    if (rule.accountId && $('tx-acc') && state.accounts.some(a => a.id === rule.accountId)) $('tx-acc').value = rule.accountId;
    if (type === 'expense' && rule.budgetId && $('tx-budget') && state.budgets.some(b => b.id === rule.budgetId)) $('tx-budget').value = rule.budgetId;
    const hint = $('smart-category-hint');
    if (hint) hint.textContent = `Aturan otomatis: ${rule.match}`;
  };

  function applyRuleToDraft(draft) {
    const rule = findSmartRule(draft.description, draft.type);
    if (!rule) return draft;
    if (rule.category) draft.smartCategory = rule.category;
    if (rule.accountId && state.accounts.some(a => a.id === rule.accountId)) draft.accountId = rule.accountId;
    if (draft.type === 'expense' && rule.budgetId && state.budgets.some(b => b.id === rule.budgetId)) draft.budgetId = rule.budgetId;
    draft.meta = { ...(draft.meta || {}), smartRuleId: rule.id };
    return draft;
  }

  function addInboxDraft(draft) {
    ensureStateExtensions();
    const normalized = normalizeInboxDraft(applyRuleToDraft({ ...draft, id: draft.id || generateId(), createdAt: draft.createdAt || nowIso() }));
    if (!normalized || normalized.amount <= 0) return null;
    const existing = state.inboxDrafts.find(item => item.source === normalized.source && item.sourceRef && item.sourceRef === normalized.sourceRef && item.dueKey === normalized.dueKey);
    if (existing) return existing;
    state.inboxDrafts.push(normalized);
    state.inboxDrafts = state.inboxDrafts.slice(-MAX_INBOX);
    return normalized;
  }

  function archiveInboxDraft(draft, status) {
    ensureStateExtensions();
    state.inboxArchive.push({ ...clone(draft), status, resolvedAt: nowIso() });
    state.inboxArchive = state.inboxArchive.slice(-MAX_ARCHIVE);
    state.inboxDrafts = state.inboxDrafts.filter(item => item.id !== draft.id);
  }

  function nextRecurringDate(recurring, fromKey) {
    const from = parseLocalDate(fromKey) || new Date();
    if (recurring.frequency === 'weekly') return toDateKey(addDaysLocal(from, 7));
    if (recurring.frequency === 'yearly') {
      return toDateKey(new Date(from.getFullYear() + 1, from.getMonth(), Math.min(from.getDate(), new Date(from.getFullYear()+1, from.getMonth()+1, 0).getDate())));
    }
    const nextMonth = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return toDateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(from.getDate(), new Date(nextMonth.getFullYear(), nextMonth.getMonth()+1, 0).getDate())));
  }

  function syncRecurringTransactionDrafts() {
    ensureStateExtensions();
    const todayKey = toDateKey(new Date());
    let added = 0;
    state.recurringTransactions.filter(item => item.active && item.amount > 0 && item.nextDueDate <= todayKey).forEach(recurring => {
      const sourceRef = recurring.id;
      const dueKey = recurring.nextDueDate;
      const alreadyRecorded = state.transactions.some(tx => tx.automationMeta?.recurringId === recurring.id && tx.automationMeta?.dueKey === dueKey);
      const alreadyPending = state.inboxDrafts.some(draft => draft.source === 'recurring' && draft.sourceRef === sourceRef && draft.dueKey === dueKey);
      if (alreadyRecorded || alreadyPending) return;
      const created = addInboxDraft({
        source: 'recurring', sourceRef, dueKey, type: recurring.type, amount: recurring.amount,
        description: recurring.name, smartCategory: recurring.smartCategory || inferSmartCategory(recurring.name),
        accountId: recurring.accountId, budgetId: recurring.budgetId, date: dueKey,
        meta: { recurringId: recurring.id }
      });
      if (created) added += 1;
    });
    return added;
  }

  function similarDescription(a, b) {
    const x = normalizeWord(a), y = normalizeWord(b);
    if (!x || !y) return false;
    return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
  }

  function findTransactionDuplicate(draft) {
    return state.transactions.find(tx => {
      if (tx.type !== draft.type || Math.round(Number(tx.amount || 0)) !== Math.round(Number(draft.amount || 0))) return false;
      if (tx.date !== draft.date) return false;
      return similarDescription(tx.category, draft.description) || normalizeWord(tx.smartCategory) === normalizeWord(draft.smartCategory);
    }) || null;
  }

  function transactionFromDraft(draft) {
    return {
      id: generateId(),
      type: draft.type,
      amount: money(draft.amount),
      category: safeText(draft.description, 100),
      smartCategory: safeText(draft.smartCategory, 60) || (draft.type === 'expense' ? inferSmartCategory(draft.description) : ''),
      accountId: draft.accountId,
      date: draft.date,
      budgetId: draft.type === 'expense' ? (draft.budgetId || null) : null,
      accountToId: null,
      automationMeta: {
        source: draft.source,
        sourceRef: draft.sourceRef || '',
        dueKey: draft.dueKey || '',
        recurringId: draft.meta?.recurringId || '',
        importedAt: draft.source === 'import' ? nowIso() : ''
      }
    };
  }

  window.confirmInboxDraft = function(id, force = false) {
    ensureStateExtensions();
    const draft = state.inboxDrafts.find(item => item.id === id);
    if (!draft) return showToast('Draft tidak ditemukan.', true);
    if (!draft.accountId || !state.accounts.some(a => a.id === draft.accountId)) return showToast('Pilih dompet untuk draft ini terlebih dahulu.', true);
    const duplicate = draft.duplicateOf ? state.transactions.find(tx => tx.id === draft.duplicateOf) : findTransactionDuplicate(draft);
    if (duplicate && !force) {
      draft.duplicateOf = duplicate.id;
      draft.duplicateReason = `${duplicate.date} · ${duplicate.category} · ${toRp(duplicate.amount)}`;
      renderAutomation();
      return showToast('Kemungkinan duplikat. Pilih “Tetap catat” jika memang transaksi berbeda.', true);
    }
    const before = cloneFinanceSnapshot();
    const tx = transactionFromDraft(draft);
    state.transactions.push(tx);
    applyBalance(tx);
    if (draft.source === 'recurring') {
      const recurring = state.recurringTransactions.find(item => item.id === draft.sourceRef);
      if (recurring) recurring.nextDueDate = nextRecurringDate(recurring, draft.dueKey || draft.date);
    }
    archiveInboxDraft(draft, 'confirmed');
    saveData(); render();
    showUndoToast(`${draft.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${toRp(draft.amount)} dikonfirmasi dari Inbox.`, before);
  };

  window.skipInboxDraft = function(id) {
    ensureStateExtensions();
    const draft = state.inboxDrafts.find(item => item.id === id);
    if (!draft) return;
    if (draft.source === 'recurring') {
      const recurring = state.recurringTransactions.find(item => item.id === draft.sourceRef);
      if (recurring) recurring.nextDueDate = nextRecurringDate(recurring, draft.dueKey || draft.date);
    }
    archiveInboxDraft(draft, 'skipped');
    saveData(); render(); showToast('Draft dilewati.');
  };

  window.openInboxDraftEditor = function(id) {
    ensureUpgradeModals();
    const draft = state.inboxDrafts.find(item => item.id === id);
    if (!draft) return;
    $('automation-draft-id').value = draft.id;
    $('automation-draft-description').value = draft.description;
    $('automation-draft-amount').value = draft.amount;
    $('automation-draft-date').value = draft.date;
    $('automation-draft-category').value = draft.smartCategory || '';
    populateAutomationSelectors();
    $('automation-draft-account').value = draft.accountId || '';
    $('automation-draft-budget').value = draft.budgetId || '';
    openModal('modal-automation-draft');
  };

  window.saveInboxDraftEdit = function(event) {
    event.preventDefault();
    const draft = state.inboxDrafts.find(item => item.id === $('automation-draft-id').value);
    if (!draft) return;
    const amount = money($('automation-draft-amount').value);
    if (!amount) return showToast('Nominal draft harus lebih dari Rp0.', true);
    draft.description = safeText($('automation-draft-description').value, 120) || draft.description;
    draft.amount = amount;
    draft.date = $('automation-draft-date').value;
    draft.smartCategory = safeText($('automation-draft-category').value, 60);
    draft.accountId = $('automation-draft-account').value;
    draft.budgetId = $('automation-draft-budget').value;
    draft.duplicateOf = '';
    draft.duplicateReason = '';
    const duplicate = findTransactionDuplicate(draft);
    if (duplicate) { draft.duplicateOf = duplicate.id; draft.duplicateReason = `${duplicate.date} · ${duplicate.category} · ${toRp(duplicate.amount)}`; }
    saveData(); closeModal('modal-automation-draft'); render(); showToast('Draft diperbarui.');
  };

  function parseCsvLine(line, delimiter) {
    const out = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i+1] === '"') { value += '"'; i += 1; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) { out.push(value.trim()); value = ''; }
      else value += ch;
    }
    out.push(value.trim()); return out;
  }

  function detectDelimiter(line) {
    const candidates = [',',';','\t'];
    return candidates.map(d => ({ d, n: parseCsvLine(line, d).length })).sort((a,b) => b.n-a.n)[0].d;
  }

  function parseMoneyText(value) {
    let text = String(value || '').trim();
    if (!text) return 0;
    const negative = /^-/.test(text) || /^\(.*\)$/.test(text);
    text = text.replace(/[^0-9,.-]/g, '');
    if (text.includes(',') && text.includes('.')) {
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.');
      else text = text.replace(/,/g, '');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
    else if (/^\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, '');
    else text = text.replace(',', '.');
    const n = Number(text.replace(/[()]/g, ''));
    return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : 0;
  }

  function parseBankDate(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
    let m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})/);
    if (m) return `20${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return '';
  }

  function canonicalHeader(value) { return normalizeWord(value).replace(/ /g, ''); }
  function pickHeader(headers, variants) { return headers.findIndex(h => variants.some(v => h.includes(v))); }

  function parseBankCsv(text, accountId) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV tidak memiliki baris data.');
    const delimiter = detectDelimiter(lines[0]);
    const rows = lines.map(line => parseCsvLine(line, delimiter));
    const headers = rows[0].map(canonicalHeader);
    const dateIdx = pickHeader(headers, ['tanggal','date','transactiondate','tgl']);
    const descIdx = pickHeader(headers, ['keterangan','description','deskripsi','uraian','merchant','remark','narrative']);
    const debitIdx = pickHeader(headers, ['debit','withdrawal','keluar']);
    const creditIdx = pickHeader(headers, ['credit','kredit','deposit','masuk']);
    const amountIdx = pickHeader(headers, ['amount','nominal','jumlah','nilai']);
    const typeIdx = pickHeader(headers, ['type','tipe','dc','debitcredit']);
    if (dateIdx < 0 || descIdx < 0 || (debitIdx < 0 && creditIdx < 0 && amountIdx < 0)) throw new Error('Kolom CSV belum dikenali. Minimal butuh tanggal, keterangan, dan debit/credit atau nominal.');

    const drafts = [];
    rows.slice(1, 1001).forEach((row, rowIndex) => {
      const date = parseBankDate(row[dateIdx]);
      const description = safeText(row[descIdx], 120);
      if (!date || !description) return;
      let type = 'expense', amount = 0, needsReview = false;
      const debit = debitIdx >= 0 ? Math.abs(parseMoneyText(row[debitIdx])) : 0;
      const credit = creditIdx >= 0 ? Math.abs(parseMoneyText(row[creditIdx])) : 0;
      if (debit > 0 || credit > 0) {
        if (credit > debit) { type = 'income'; amount = credit; }
        else { type = 'expense'; amount = debit; }
      } else if (amountIdx >= 0) {
        const signed = parseMoneyText(row[amountIdx]);
        if (!signed) return;
        const typeText = typeIdx >= 0 ? normalizeWord(row[typeIdx]) : '';
        if (/credit|kredit|masuk|cr\b/.test(typeText)) type = 'income';
        else if (/debit|keluar|db\b/.test(typeText)) type = 'expense';
        else if (signed < 0) type = 'expense';
        else { type = 'income'; needsReview = true; }
        amount = Math.abs(signed);
      }
      if (!amount) return;
      const draft = addInboxDraft({
        source:'import', sourceRef:`csv-${date}-${rowIndex}-${Math.round(amount)}`, dueKey:'', type, amount,
        description, smartCategory:type === 'expense' ? inferSmartCategory(description) : '', accountId, date,
        needsReview, meta:{ row: rowIndex + 2, fileImport:true }
      });
      if (!draft) return;
      const duplicate = findTransactionDuplicate(draft);
      if (duplicate) { draft.duplicateOf = duplicate.id; draft.duplicateReason = `${duplicate.date} · ${duplicate.category} · ${toRp(duplicate.amount)}`; }
      drafts.push(draft);
    });
    return drafts;
  }

  window.handleBankImport = async function(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('File mutasi terlalu besar. Maksimal 3 MB.');
      const accountId = $('bank-import-account')?.value || '';
      if (!accountId) throw new Error('Pilih dompet/rekening tujuan import terlebih dahulu.');
      const text = await file.text();
      const before = state.inboxDrafts.length;
      const imported = parseBankCsv(text, accountId);
      const duplicates = imported.filter(item => item.duplicateOf).length;
      const review = imported.filter(item => item.needsReview).length;
      const newDrafts = Math.max(0, state.inboxDrafts.length - before);
      state.bankImportSummary = { fileName:safeText(file.name,120), imported:newDrafts, possibleDuplicates:duplicates, needsReview:review, checkedAgainst:state.transactions.length, at:nowIso() };
      recordAudit('Import mutasi',`${file.name} · ${newDrafts} draft · ${duplicates} duplikat`);
      saveData(); render();
      showToast(`${newDrafts} transaksi masuk Inbox. ${duplicates} kemungkinan duplikat${review ? ` · ${review} perlu cek tipe` : ''}.`);
      go('automation');
    } catch (error) {
      showToast(error.message || 'Import gagal.', true);
    } finally { input.value = ''; }
  };

  window.openSmartRuleModal = function(id = '') {
    ensureUpgradeModals(); populateAutomationSelectors();
    const rule = state.smartRules.find(item => item.id === id);
    $('smart-rule-id').value = rule?.id || '';
    $('smart-rule-match').value = rule?.match || '';
    $('smart-rule-type').value = rule?.type || 'any';
    $('smart-rule-category').value = rule?.category || '';
    $('smart-rule-account').value = rule?.accountId || '';
    $('smart-rule-budget').value = rule?.budgetId || '';
    openModal('modal-smart-rule');
  };

  window.saveSmartRule = function(event) {
    event.preventDefault(); ensureStateExtensions();
    const id = $('smart-rule-id').value;
    const match = safeText($('smart-rule-match').value, 100);
    if (!match) return showToast('Kata pencocokan wajib diisi.', true);
    const record = normalizeSmartRule({ id:id || generateId(), match, type:$('smart-rule-type').value, category:$('smart-rule-category').value, accountId:$('smart-rule-account').value, budgetId:$('smart-rule-budget').value, enabled:true, createdAt:nowIso() });
    const idx = state.smartRules.findIndex(item => item.id === id);
    if (idx >= 0) state.smartRules[idx] = record; else state.smartRules.unshift(record);
    recordAudit('Aturan otomatis',`Simpan aturan: ${match}`); saveData(); closeModal('modal-smart-rule'); render(); showToast('Aturan otomatis tersimpan.');
  };

  window.deleteSmartRule = function(id) {
    state.smartRules = state.smartRules.filter(item => item.id !== id); saveData(); render(); showToast('Aturan dihapus.');
  };

  window.openRecurringTransactionModal = function(id = '') {
    ensureUpgradeModals(); populateAutomationSelectors();
    const rec = state.recurringTransactions.find(item => item.id === id);
    $('recurring-tx-id').value = rec?.id || '';
    $('recurring-tx-name').value = rec?.name || '';
    $('recurring-tx-type').value = rec?.type || 'expense';
    $('recurring-tx-amount').value = rec?.amount || '';
    $('recurring-tx-account').value = rec?.accountId || '';
    $('recurring-tx-budget').value = rec?.budgetId || '';
    $('recurring-tx-category').value = rec?.smartCategory || '';
    $('recurring-tx-frequency').value = rec?.frequency || 'monthly';
    $('recurring-tx-date').value = rec?.nextDueDate || toDateKey(new Date());
    openModal('modal-recurring-transaction');
  };

  window.saveRecurringTransaction = function(event) {
    event.preventDefault(); ensureStateExtensions();
    const id = $('recurring-tx-id').value;
    const record = normalizeRecurringTransaction({
      id:id || generateId(), name:$('recurring-tx-name').value, type:$('recurring-tx-type').value,
      amount:$('recurring-tx-amount').value, accountId:$('recurring-tx-account').value, budgetId:$('recurring-tx-budget').value,
      smartCategory:$('recurring-tx-category').value, frequency:$('recurring-tx-frequency').value, nextDueDate:$('recurring-tx-date').value, active:true, createdAt:nowIso()
    });
    if (!record.name || !record.amount || !record.accountId) return showToast('Nama, nominal, dan dompet wajib diisi.', true);
    const idx = state.recurringTransactions.findIndex(item => item.id === id);
    if (idx >= 0) state.recurringTransactions[idx] = record; else state.recurringTransactions.push(record);
    recordAudit('Transaksi rutin',`Simpan: ${record.name}`); syncRecurringTransactionDrafts(); saveData(); closeModal('modal-recurring-transaction'); render(); showToast('Transaksi rutin tersimpan sebagai draft saat jatuh tempo.');
  };

  window.deleteRecurringTransaction = function(id) {
    state.recurringTransactions = state.recurringTransactions.filter(item => item.id !== id);
    state.inboxDrafts = state.inboxDrafts.filter(item => !(item.source === 'recurring' && item.sourceRef === id));
    saveData(); render(); showToast('Transaksi rutin dihapus.');
  };

  function previousBudgetPeriod() {
    const current = getBudgetPeriodBounds(new Date());
    return getBudgetPeriodBounds(addDaysLocal(current.start, -1));
  }

  function closingSummary(period) {
    const tx = state.transactions.filter(item => dateInside(item.date, period));
    const income = tx.filter(item => item.type === 'income').reduce((sum,item) => sum + money(item.amount), 0);
    const expense = tx.filter(item => item.type === 'expense' || item.type === 'debt').reduce((sum,item) => sum + money(item.amount), 0);
    const net = income - expense;
    const goalDeposits = state.goals.reduce((sum,goal) => sum + (goal.contributions || []).filter(item => item.type !== 'withdraw' && dateInside(item.date, period)).reduce((s,item) => s + money(item.amount), 0), 0);
    const history = state.budgetHistory.find(item => item.periodStart === period.startKey) || reconstructPeriod(period) || budgetSnapshotForPeriod(period, { source:'reconstructed', budgetSource:budgetsRelevantToPeriod(period) });
    return { income, expense, net, savingsRate:income > 0 ? (net / income) * 100 : 0, goalDeposits, budgetSnapshot:history?.budgets || [] };
  }

  window.closePreviousFinancialPeriod = function() {
    ensureStateExtensions(); ensureBudgetHistoryIntegrity();
    const period = previousBudgetPeriod();
    if (state.periodClosings.some(item => item.periodStart === period.startKey)) return showToast('Periode ini sudah ditutup.');
    const summary = closingSummary(period);
    const record = normalizeClosing({ id:generateId(), periodStart:period.startKey, periodEnd:period.endKey, closedAt:nowIso(), ...summary });
    state.periodClosings.push(record);
    const history = state.budgetHistory.find(item => item.periodStart === period.startKey) || { periodStart:period.startKey, periodEnd:period.endKey, capturedAt:nowIso(), budgets:summary.budgetSnapshot };
    upsertBudgetHistory({ ...history, source:'closed', closed:true, capturedAt:nowIso() }, { preserveClosed:false });
    recordAudit('Tutup periode',budgetPeriodLabel(period)); saveData(); render(); showToast(`Periode ${budgetPeriodLabel(period)} ditutup dan disimpan.`);
  };

  function expenseByCategory(period) {
    const map = {};
    state.transactions.filter(tx => tx.type === 'expense' && dateInside(tx.date, period)).forEach(tx => {
      const splits=validTransactionSplits(tx);
      if(splits.length) splits.forEach(part=>{ const cat=part.smartCategory||'Lainnya'; map[cat]=(map[cat]||0)+money(part.amount); });
      else { const cat = tx.smartCategory || inferSmartCategory(tx.category) || 'Lainnya'; map[cat] = (map[cat] || 0) + money(tx.amount); }
    });
    return map;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length/2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
  }

  function deterministicInsights() {
    const current = getBudgetPeriodBounds(new Date());
    const previous = getBudgetPeriodBounds(addDaysLocal(current.start, -1));
    const currentMap = expenseByCategory(current), previousMap = expenseByCategory(previous);
    const insights = [];
    Object.entries(currentMap).forEach(([category, amount]) => {
      const prev = previousMap[category] || 0;
      if (prev >= 50000 && amount - prev >= 50000 && amount >= prev * 1.3) insights.push({ tone:'warning', title:`${category} naik ${Math.round(((amount-prev)/prev)*100)}%`, detail:`${toRp(amount)} pada periode berjalan vs ${toRp(prev)} periode sebelumnya.`, rule:'Perubahan ≥30% dan selisih ≥Rp50.000.' });
    });
    const expenses = state.transactions.filter(tx => tx.type === 'expense' && dateInside(tx.date, current));
    const small = expenses.filter(tx => money(tx.amount) < 30000);
    const smallTotal = small.reduce((sum,tx) => sum + money(tx.amount), 0);
    if (small.length >= 5 && smallTotal >= 100000) insights.push({ tone:'neutral', title:`${small.length} transaksi kecil menghabiskan ${toRp(smallTotal)}`, detail:'Transaksi di bawah Rp30.000 sering terasa kecil tetapi akumulasinya bisa besar.', rule:'Menjumlahkan transaksi < Rp30.000 pada periode berjalan.' });
    const amounts = expenses.map(tx => money(tx.amount));
    const med = median(amounts);
    const biggest = [...expenses].sort((a,b) => money(b.amount)-money(a.amount))[0];
    if (biggest && money(biggest.amount) >= Math.max(300000, med * 2.5)) insights.push({ tone:'warning', title:`Transaksi besar: ${escapeHtml(biggest.category)}`, detail:`${toRp(biggest.amount)} pada ${formatDateShort(biggest.date)} lebih dari 2,5× median transaksi periode ini.`, rule:'Transaksi ≥ Rp300.000 dan ≥2,5× median.' });
    const today = startOfLocalDay(new Date());
    const elapsed = Math.max(1, Math.floor((today-current.start)/86400000)+1);
    const totalDays = Math.max(1, Math.floor((current.end-current.start)/86400000)+1);
    state.budgets.forEach(budget => {
      const status = calculateBudgetStatus(budget);
      if (status.available <= 0 || status.spent <= 0) return;
      const predicted = Math.round((status.spent / elapsed) * totalDays);
      if (predicted > status.available * 1.08) insights.push({ tone:'danger', title:`Budget ${escapeHtml(budget.name)} berisiko lewat`, detail:`Dengan ritme sekarang, proyeksi ${toRp(predicted)} vs tersedia ${toRp(status.available)}.`, rule:'Proyeksi linear berdasarkan rata-rata harian periode berjalan.' });
    });
    const summary = closingSummary(current);
    if (summary.income > 0 && summary.net >= 0) insights.push({ tone:'success', title:'Cashflow periode berjalan positif', detail:`Pemasukan ${toRp(summary.income)} dan pengeluaran ${toRp(summary.expense)} menghasilkan surplus ${toRp(summary.net)}.`, rule:'Pemasukan dikurangi pengeluaran/debt; transfer tidak dihitung.' });
    return insights.slice(0, 6);
  }

  function sourceLabel(source) {
    return source === 'recurring' ? 'Transaksi rutin' : source === 'import' ? 'Import bank' : source === 'receipt' ? 'Scan struk' : 'Draft';
  }

  function renderInbox() {
    const list = $('automation-inbox-list');
    const badge = $('automation-inbox-badge');
    if (!list) return;
    ensureStateExtensions();
    if (badge) badge.textContent = String(state.inboxDrafts.length);
    const cardBadge = $('automation-inbox-badge-card'); if (cardBadge) cardBadge.textContent = `${state.inboxDrafts.length} draft`; 
    if (!state.inboxDrafts.length) {
      list.innerHTML = '<div class="empty-action-state"><strong>Inbox bersih</strong><p>Draft dari transaksi rutin dan import mutasi akan muncul di sini. Tidak ada saldo yang berubah sebelum kamu konfirmasi.</p></div>';
      return;
    }
    list.innerHTML = [...state.inboxDrafts].sort((a,b) => String(a.date).localeCompare(String(b.date))).map(draft => {
      const duplicate = draft.duplicateOf ? `<div class="automation-warning"><i class="fa-solid fa-copy"></i> Kemungkinan duplikat: ${escapeHtml(draft.duplicateReason || 'transaksi serupa sudah ada')}</div>` : '';
      const review = draft.needsReview ? '<span class="automation-tag warn">Perlu cek</span>' : '';
      return `<article class="automation-draft-card">
        <div class="automation-draft-head"><div><span class="automation-source">${sourceLabel(draft.source)}</span><strong>${escapeHtml(draft.description)}</strong></div><strong class="${draft.type === 'income' ? 'automation-income' : 'automation-expense'}">${draft.type === 'income' ? '+' : '-'}${toRp(draft.amount)}</strong></div>
        <div class="automation-meta"><span>${formatDateShort(draft.date)}</span><span>${escapeHtml(draft.smartCategory || (draft.type === 'income' ? 'Pemasukan' : 'Belum dikategorikan'))}</span>${review}</div>
        ${duplicate}
        <div class="automation-actions"><button type="button" class="btn-secondary" onclick="openInboxDraftEditor('${draft.id}')">Edit</button><button type="button" class="btn-secondary" onclick="skipInboxDraft('${draft.id}')">Lewati</button>${draft.duplicateOf ? `<button type="button" class="btn-secondary danger-text" onclick="confirmInboxDraft('${draft.id}', true)">Tetap catat</button>` : `<button type="button" class="planner-primary-btn" onclick="confirmInboxDraft('${draft.id}')">Konfirmasi</button>`}</div>
      </article>`;
    }).join('');
  }

  function renderSmartRules() {
    const list = $('automation-rules-list'); if (!list) return;
    if (!state.smartRules.length) { list.innerHTML = '<div class="empty-action-state compact"><strong>Belum ada aturan</strong><p>Contoh: jika keterangan mengandung “PERTAMINA”, isi kategori Transportasi dan dompet BCA.</p><button type="button" onclick="openSmartRuleModal()">Buat Aturan</button></div>'; return; }
    list.innerHTML = state.smartRules.map(rule => `<div class="automation-list-row"><div><strong>${escapeHtml(rule.match)}</strong><span>${rule.type === 'any' ? 'Semua tipe' : rule.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}${rule.category ? ` · ${escapeHtml(rule.category)}` : ''}${rule.accountId ? ` · ${escapeHtml(state.accounts.find(a=>a.id===rule.accountId)?.name || 'Dompet')}` : ''}</span></div><div><button type="button" class="mini-action" onclick="openSmartRuleModal('${rule.id}')"><i class="fa-solid fa-pen"></i></button><button type="button" class="mini-action danger" onclick="deleteSmartRule('${rule.id}')"><i class="fa-solid fa-trash"></i></button></div></div>`).join('');
  }

  function renderRecurringTransactions() {
    const list = $('automation-recurring-list'); if (!list) return;
    if (!state.recurringTransactions.length) { list.innerHTML = '<div class="empty-action-state compact"><strong>Belum ada transaksi rutin</strong><p>Buat gaji, investasi rutin, biaya keluarga, atau transaksi bulanan sebagai draft yang perlu dikonfirmasi.</p><button type="button" onclick="openRecurringTransactionModal()">Tambah Transaksi Rutin</button></div>'; return; }
    list.innerHTML = state.recurringTransactions.map(rec => `<div class="automation-list-row"><div><strong>${escapeHtml(rec.name)}</strong><span>${rec.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} · ${toRp(rec.amount)} · ${escapeHtml(rec.frequency)} · berikutnya ${formatDateShort(rec.nextDueDate)}</span></div><div><button type="button" class="mini-action" onclick="openRecurringTransactionModal('${rec.id}')"><i class="fa-solid fa-pen"></i></button><button type="button" class="mini-action danger" onclick="deleteRecurringTransaction('${rec.id}')"><i class="fa-solid fa-trash"></i></button></div></div>`).join('');
  }

  function renderClosingsAndInsights() {
    const closing = $('automation-closing-content');
    const insights = $('automation-insights-list');
    if (closing) {
      const period = previousBudgetPeriod();
      const summary = closingSummary(period);
      const saved = state.periodClosings.find(item => item.periodStart === period.startKey);
      closing.innerHTML = `<div class="closing-hero"><div><span>Periode sebelumnya</span><strong>${budgetPeriodLabel(period)}</strong></div><span class="status-pill ${saved ? 'success' : 'neutral'}">${saved ? 'Sudah ditutup' : 'Belum ditutup'}</span></div><div class="closing-grid"><div><span>Pemasukan</span><strong>${toRp(summary.income)}</strong></div><div><span>Pengeluaran</span><strong>${toRp(summary.expense)}</strong></div><div><span>Net</span><strong class="${summary.net >= 0 ? 'automation-income':'automation-expense'}">${toRp(summary.net)}</strong></div><div><span>Setor target</span><strong>${toRp(summary.goalDeposits)}</strong></div></div>${saved ? `<div class="automation-small-note">Ditutup ${new Date(saved.closedAt).toLocaleString('id-ID')}</div>` : '<button type="button" class="planner-primary-btn closing-button" onclick="closePreviousFinancialPeriod()"><i class="fa-solid fa-box-archive"></i> Tutup Periode Sebelumnya</button>'}`;
    }
    if (insights) {
      const list = deterministicInsights();
      insights.innerHTML = list.length ? list.map(item => `<div class="insight-card ${item.tone}"><div class="insight-icon"><i class="fa-solid ${item.tone === 'success' ? 'fa-circle-check' : item.tone === 'danger' ? 'fa-triangle-exclamation' : item.tone === 'warning' ? 'fa-arrow-trend-up' : 'fa-circle-info'}"></i></div><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><span>${escapeHtml(item.rule)}</span></div></div>`).join('') : '<div class="empty-action-state compact"><strong>Insight belum cukup</strong><p>Tambahkan beberapa transaksi agar perbandingan antarperiode mulai bermakna.</p></div>';
    }
  }

  function renderAuditLog() {
    const container=$('automation-audit-list'); if(!container) return; ensureStateExtensions();
    const rows=[...state.auditLog].reverse().slice(0,12);
    container.innerHTML=rows.length?rows.map(item=>`<div class="audit-row"><div><strong>${escapeHtml(item.action||'Aktivitas')}</strong><span>${escapeHtml(item.detail||'')}</span></div><time>${new Date(item.at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):'<div class="empty-action-state compact"><strong>Belum ada aktivitas</strong><p>Tindakan penting berikutnya akan dicatat di akun ini.</p></div>';
  }

  function renderDiagnostics() {
    const container = $('automation-diagnostics'); if (!container) return;
    const entries = window.KTDiagnostics?.list?.() || [];
    container.innerHTML = entries.length ? `<div class="automation-diagnostic-summary"><strong>${entries.length} catatan diagnostik lokal</strong><span>Terakhir: ${escapeHtml(entries[0]?.code || '-')}</span></div><div class="automation-actions"><button type="button" class="btn-secondary" onclick="copyKTDiagnostics()"><i class="fa-solid fa-copy"></i> Salin Diagnostik</button><button type="button" class="btn-secondary" onclick="clearKTDiagnostics()">Bersihkan</button></div>` : '<div class="automation-small-note">Belum ada error aplikasi yang tercatat di perangkat ini.</div>';
  }

  function renderAutomation() {
    if (!$('view-automation')) return;
    ensureStateExtensions(); ensureBudgetHistoryIntegrity(); syncRecurringTransactionDrafts(); populateAutomationSelectors();
    renderInbox(); renderSmartRules(); renderRecurringTransactions(); renderClosingsAndInsights(); renderAuditLog(); renderDiagnostics();
    const importAccount = $('bank-import-account');
    if (importAccount && !importAccount.value && state.accounts[0]) importAccount.value = state.accounts[0].id;
    const importStatus = $('automation-import-status');
    if (importStatus) {
      const sum = state.bankImportSummary;
      importStatus.innerHTML = sum ? `<strong>Rekonsiliasi terakhir:</strong> ${escapeHtml(sum.fileName || 'CSV')} · ${Number(sum.imported||0)} draft baru · ${Number(sum.possibleDuplicates||0)} kemungkinan duplikat · ${Number(sum.needsReview||0)} perlu review. Dicocokkan dengan ${Number(sum.checkedAgainst||0)} transaksi tersimpan.` : 'Belum ada import. Sistem akan membandingkan tanggal, nominal, dan keterangan dengan transaksi yang sudah tersimpan.';
    }
    const historyCount = $('automation-budget-history-count'); if (historyCount) historyCount.textContent = `${state.budgetHistory.length} periode tersimpan`;
  }

  function populateAutomationSelectors() {
    const accountOptions = `<option value="">Pilih dompet</option>` + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    const budgetOptions = `<option value="">Tanpa budget</option>` + state.budgets.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    ['bank-import-account','automation-draft-account','smart-rule-account','recurring-tx-account'].forEach(id => { const el=$(id); if(el){ const v=el.value; el.innerHTML=accountOptions; if([...el.options].some(o=>o.value===v)) el.value=v; } });
    ['automation-draft-budget','smart-rule-budget','recurring-tx-budget'].forEach(id => { const el=$(id); if(el){ const v=el.value; el.innerHTML=budgetOptions; if([...el.options].some(o=>o.value===v)) el.value=v; } });
  }

  window.copyKTDiagnostics = async function() {
    const text = window.KTDiagnostics?.exportText?.() || 'Tidak ada diagnostik.';
    try { await navigator.clipboard.writeText(text); showToast('Diagnostik disalin.'); }
    catch { showToast('Clipboard tidak tersedia. Gunakan browser desktop atau HTTPS.', true); }
  };
  window.clearKTDiagnostics = function() { window.KTDiagnostics?.clear?.(); renderDiagnostics(); showToast('Diagnostik lokal dibersihkan.'); };

  function ensureUpgradeModals() {
    if ($('modal-smart-rule')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modal-automation-draft"><div class="modal-content"><div class="modal-header"><h2>Edit Draft Inbox</h2><button class="close-btn" type="button" onclick="closeModal('modal-automation-draft')" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><form onsubmit="saveInboxDraftEdit(event)"><input type="hidden" id="automation-draft-id"><div class="form-group"><label class="form-label" for="automation-draft-description">Keterangan</label><input class="form-control" id="automation-draft-description" required></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="automation-draft-amount">Nominal</label><input class="form-control" id="automation-draft-amount" type="number" min="1" step="1" required></div><div class="form-group"><label class="form-label" for="automation-draft-date">Tanggal</label><input class="form-control" id="automation-draft-date" type="date" required></div></div><div class="form-group"><label class="form-label" for="automation-draft-category">Kategori pintar</label><input class="form-control" id="automation-draft-category"></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="automation-draft-account">Dompet</label><select class="form-control" id="automation-draft-account" required></select></div><div class="form-group"><label class="form-label" for="automation-draft-budget">Budget</label><select class="form-control" id="automation-draft-budget"></select></div></div><button class="btn-submit" type="submit">Simpan Draft</button></form></div></div>
      <div class="modal-overlay" id="modal-smart-rule"><div class="modal-content"><div class="modal-header"><h2>Aturan Otomatis</h2><button class="close-btn" type="button" onclick="closeModal('modal-smart-rule')" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><form onsubmit="saveSmartRule(event)"><input type="hidden" id="smart-rule-id"><div class="form-group"><label class="form-label" for="smart-rule-match">Jika keterangan mengandung</label><input class="form-control" id="smart-rule-match" placeholder="PERTAMINA" required></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="smart-rule-type">Tipe</label><select class="form-control" id="smart-rule-type"><option value="any">Semua</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></div><div class="form-group"><label class="form-label" for="smart-rule-category">Kategori</label><input class="form-control" id="smart-rule-category" placeholder="Transportasi"></div></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="smart-rule-account">Dompet</label><select class="form-control" id="smart-rule-account"></select></div><div class="form-group"><label class="form-label" for="smart-rule-budget">Budget</label><select class="form-control" id="smart-rule-budget"></select></div></div><button class="btn-submit" type="submit">Simpan Aturan</button></form></div></div>
      <div class="modal-overlay" id="modal-recurring-transaction"><div class="modal-content"><div class="modal-header"><h2>Transaksi Rutin</h2><button class="close-btn" type="button" onclick="closeModal('modal-recurring-transaction')" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><form onsubmit="saveRecurringTransaction(event)"><input type="hidden" id="recurring-tx-id"><div class="form-group"><label class="form-label" for="recurring-tx-name">Nama transaksi</label><input class="form-control" id="recurring-tx-name" required></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="recurring-tx-type">Tipe</label><select class="form-control" id="recurring-tx-type"><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></div><div class="form-group"><label class="form-label" for="recurring-tx-amount">Nominal</label><input class="form-control" id="recurring-tx-amount" type="number" min="1" step="1" required></div></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="recurring-tx-account">Dompet</label><select class="form-control" id="recurring-tx-account" required></select></div><div class="form-group"><label class="form-label" for="recurring-tx-budget">Budget</label><select class="form-control" id="recurring-tx-budget"></select></div></div><div class="form-group"><label class="form-label" for="recurring-tx-category">Kategori pintar</label><input class="form-control" id="recurring-tx-category"></div><div class="planner-form-grid"><div class="form-group"><label class="form-label" for="recurring-tx-frequency">Frekuensi</label><select class="form-control" id="recurring-tx-frequency"><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select></div><div class="form-group"><label class="form-label" for="recurring-tx-date">Tanggal berikutnya</label><input class="form-control" id="recurring-tx-date" type="date" required></div></div><p class="automation-small-note">Saat jatuh tempo, transaksi masuk ke Financial Inbox sebagai draft. Saldo tidak berubah sampai kamu konfirmasi.</p><button class="btn-submit" type="submit">Simpan Transaksi Rutin</button></form></div></div>
      <div class="modal-overlay" id="modal-delete-account"><div class="modal-content"><div class="modal-header"><h2>Hapus Akun Permanen</h2><button class="close-btn" type="button" onclick="closeModal('modal-delete-account')" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><div class="automation-danger-box"><strong>Tindakan ini tidak dapat dibatalkan.</strong><p>Data cloud KITA TABUNG dan akun login akan dihapus. Download backup terlebih dahulu jika masih membutuhkan salinan.</p></div><div class="form-group"><label class="form-label" for="delete-account-phrase">Ketik HAPUS AKUN</label><input class="form-control" id="delete-account-phrase" autocomplete="off"></div><button type="button" class="btn-submit" style="background:var(--danger)" onclick="deleteAccountPermanently()">Hapus Akun Permanen</button></div></div>
    `);
  }

  window.openDeleteAccountModal = function() { ensureUpgradeModals(); $('delete-account-phrase').value=''; openModal('modal-delete-account'); };
  window.deleteAccountPermanently = async function() {
    if ($('delete-account-phrase').value.trim().toUpperCase() !== 'HAPUS AKUN') return showToast('Ketik HAPUS AKUN untuk melanjutkan.', true);
    try {
      const headers = await getPrivateApiAuthHeader();
      const response = await fetch('/api/delete-account', { method:'DELETE', headers:{ ...headers, Accept:'application/json' } });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error || `Gagal menghapus akun (${response.status}).`);
      try { await supabaseClient?.auth?.signOut(); } catch (_) {}
      Object.keys(localStorage).filter(key => key.startsWith('KITA_TABUNG_')).forEach(key => localStorage.removeItem(key));
      location.href = '/?account=deleted';
    } catch (error) { showToast(error.message || 'Akun gagal dihapus.', true); }
  };

  // Existing receipt scanner can optionally send a scan result to Financial Inbox.
  window.sendCurrentReceiptToInbox = function() {
    if (!receiptDraft) return showToast('Belum ada hasil scan struk.', true);
    const duplicate = findReceiptDuplicate(receiptDraft);
    const draft = addInboxDraft({ source:'receipt', sourceRef:receiptDraft.imageHash || receiptDraft.fingerprint || generateId(), type:'expense', amount:receiptDraft.total, description:receiptDraft.merchant, smartCategory:receiptDraft.suggestedCategory, accountId:suggestReceiptAccount(receiptDraft.paymentMethod) || $('tx-acc')?.value || '', date:receiptDraft.date, duplicateOf:duplicate?.id || '', duplicateReason:duplicate ? `${duplicate.date} · ${duplicate.category} · ${toRp(duplicate.amount)}` : '', meta:{ confidence:receiptDraft.confidence, paymentMethod:receiptDraft.paymentMethod } });
    if (!draft) return showToast('Draft struk tidak dapat dibuat.', true);
    saveData(); render(); showToast('Hasil scan ditambahkan ke Financial Inbox.');
  };

  function injectReceiptInboxButton() {
    const result = $('receipt-scan-result'); if (!result || $('receipt-inbox-btn')) return;
    const button = document.createElement('button');
    button.type='button'; button.id='receipt-inbox-btn'; button.className='btn-secondary receipt-inbox-btn';
    button.innerHTML='<i class="fa-solid fa-inbox"></i> Kirim ke Financial Inbox';
    button.onclick=sendCurrentReceiptToInbox;
    result.appendChild(button);
  }

  function injectDeleteAccountButton() {
    const danger = $('t_reset_btn')?.closest('.bento-card'); if (!danger || $('delete-account-btn')) return;
    const btn=document.createElement('button'); btn.type='button'; btn.id='delete-account-btn'; btn.className='btn-secondary'; btn.style.cssText='width:100%;margin-top:10px;color:var(--danger);border-color:color-mix(in srgb,var(--danger) 45%,var(--border-color));'; btn.innerHTML='<i class="fa-solid fa-user-slash"></i> Hapus Akun Permanen'; btn.onclick=openDeleteAccountModal; danger.appendChild(btn);
  }

  function injectDiagnosticsCard() {
    const trustCard = document.querySelector('.legal-links-card')?.closest('.bento-card');
    if (!trustCard || $('diagnostic-settings-card')) return;
    const wrapper=document.createElement('div'); wrapper.className='bento-card'; wrapper.id='diagnostic-settings-card'; wrapper.innerHTML='<h4 style="margin-bottom:6px;">Diagnostik Aplikasi</h4><p class="privacy-note" style="margin:0 0 12px;">Error teknis disimpan lokal tanpa saldo, password, token, atau isi transaksi. Salin kode diagnostik saat melaporkan bug.</p><div id="automation-diagnostics"></div>'; trustCard.after(wrapper);
  }

  const originalRender = render;
  render = function() {
    try {
      ensureStateExtensions();
      const historyBefore = JSON.stringify(state.budgetHistory || []);
      ensureBudgetHistoryIntegrity();
      const addedRecurringDrafts = syncRecurringTransactionDrafts();
      const historyChanged = historyBefore !== JSON.stringify(state.budgetHistory || []);
      if (addedRecurringDrafts > 0 || historyChanged) originalSaveData(false);
    } catch (error) { window.KTDiagnostics?.capture(error, 'render-prep'); }
    originalRender();
    try { ensureUpgradeModals(); injectReceiptInboxButton(); injectDeleteAccountButton(); injectDiagnosticsCard(); renderAutomation(); } catch (error) { window.KTDiagnostics?.capture(error, 'render-upgrade'); }
  };

  // Extend go() so the automation view refreshes immediately.
  const originalGo = go;
  go = function(viewId) { const result = originalGo(viewId); if (viewId === 'automation') requestAnimationFrame(renderAutomation); return result; };

  // Add version to diagnostics and expose a tiny health surface for support.
  window.KITA_TABUNG_VERSION = UPGRADE_VERSION;
  window.KTAutomation = { render: renderAutomation, ensureBudgetHistoryIntegrity, deterministicInsights };

  // Initialization happens before the existing window.onload fires.
  ensureStateExtensions();
  ensureUpgradeModals();
})();
