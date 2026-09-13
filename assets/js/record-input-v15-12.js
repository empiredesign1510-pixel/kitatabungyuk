(() => {
  'use strict';

  let recordLaunchMode = 'manual';
  let assistantDrafts = [];
  let assistantBusy = false;
  let speechRecognition = null;
  let voiceListening = false;
  let voiceTranscript = '';
  let assistantSource = 'chat';

  const TYPE_LABELS = {
    expense: 'Pengeluaran',
    income: 'Pemasukan',
    transfer: 'Transfer',
    debt: 'Utang/Piutang'
  };

  const TYPE_ICONS = {
    expense: 'fa-arrow-up',
    income: 'fa-arrow-down',
    transfer: 'fa-right-left',
    debt: 'fa-hand-holding-dollar'
  };

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function findAccountByName(name) {
    const wanted = normalize(name);
    if (!wanted) return null;
    return state.accounts.find(a => normalize(a.name) === wanted) || state.accounts.find(a => {
      const n = normalize(a.name);
      return n.length >= 3 && (wanted.includes(n) || n.includes(wanted));
    }) || null;
  }

  function findBudgetByName(name) {
    const wanted = normalize(name);
    if (!wanted) return null;
    return state.budgets.find(b => normalize(b.name) === wanted) || state.budgets.find(b => {
      const n = normalize(b.name);
      return n.length >= 4 && (wanted.includes(n) || n.includes(wanted));
    }) || null;
  }

  function extractKnownAccount(text) {
    const n = normalize(text);
    return state.accounts.find(a => {
      const name = normalize(a.name);
      return name && n.includes(name);
    }) || null;
  }

  function parseAmount(text) {
    const source = String(text || '').toLowerCase();
    const matches = [...source.matchAll(/(\d[\d.,]*)\s*(juta|jt|ribu|rb|k)?\b/g)];
    for (const match of matches) {
      let raw = match[1];
      const unit = match[2] || '';
      let number;
      if (unit === 'juta' || unit === 'jt') {
        raw = raw.replace(/\./g, '').replace(',', '.');
        number = Number(raw) * 1_000_000;
      } else if (unit === 'ribu' || unit === 'rb' || unit === 'k') {
        raw = raw.replace(/[.,]/g, '');
        number = Number(raw) * 1_000;
      } else {
        raw = raw.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,/g, '');
        number = Number(raw);
      }
      if (Number.isFinite(number) && number > 0) return Math.round(number);
    }
    return 0;
  }

  function inferType(text) {
    const n = normalize(text);
    if (/\b(transfer|pindah|kirim)\b/.test(n) && /\b(ke|menuju)\b/.test(n)) return 'transfer';
    if (/\b(utang|hutang|piutang|pinjam|dipinjam)\b/.test(n)) return 'debt';
    if (/\b(gaji|gajian|pemasukan|pendapatan|bonus|terima|diterima|masuk|refund masuk)\b/.test(n)) return 'income';
    return 'expense';
  }

  function localDescription(text, type) {
    let out = String(text || '')
      .replace(/\b\d[\d.,]*\s*(?:juta|jt|ribu|rb|k)?\b/ig, ' ')
      .replace(/\b(?:pakai|pake|dari|ke|masuk|via|menggunakan)\b/ig, ' ');
    state.accounts.forEach(a => { if (a.name) out = out.replace(new RegExp(a.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'), ' '); });
    out = out.replace(/\s+/g,' ').replace(/^[,;\-\s]+|[,;\-\s]+$/g,'').trim();
    if (!out) return type === 'income' ? 'Pemasukan' : type === 'transfer' ? 'Transfer' : type === 'debt' ? 'Utang/Piutang' : 'Pengeluaran';
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  function localParse(message) {
    const fullAccount = extractKnownAccount(message);
    const transferLike = inferType(message) === 'transfer';
    const rawSegments = transferLike ? [message] : String(message).split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
    const segments = rawSegments.filter(seg => parseAmount(seg) > 0);
    const useful = segments.length ? segments : [message];
    return useful.slice(0,5).map(segment => {
      const type = inferType(segment === message ? segment : `${segment} ${fullAccount?.name || ''}`);
      const amount = parseAmount(segment);
      const account = extractKnownAccount(segment) || fullAccount || (state.accounts.length === 1 ? state.accounts[0] : null);
      let accountTo = null;
      if (type === 'transfer') {
        const n = normalize(message);
        const found = state.accounts.filter(a => n.includes(normalize(a.name)));
        if (found.length >= 2) accountTo = found[1];
      }
      const description = localDescription(segment, type);
      return normalizeDraft({
        type,
        amount,
        description,
        smartCategory: type === 'expense' ? inferSmartCategory(description) : '',
        accountFromName: account?.name || '',
        accountToName: accountTo?.name || '',
        budgetName: '',
        date: /\bkemarin\b/i.test(segment) ? (()=>{ const d=new Date(); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : todayKey(),
        confidence: 58,
        needsReview: ['Draft dibuat dengan parser lokal karena AI tidak tersedia. Periksa sebelum menyimpan.']
      });
    });
  }

  function normalizeDraft(raw) {
    const type = ['expense','income','transfer','debt'].includes(raw?.type) ? raw.type : 'expense';
    const amount = Math.max(0, Math.round(Number(raw?.amount || 0)));
    const description = safeText(raw?.description, 100) || TYPE_LABELS[type];
    const account = findAccountByName(raw?.accountFromName) || (state.accounts.length === 1 ? state.accounts[0] : null);
    const accountTo = findAccountByName(raw?.accountToName);
    const budget = findBudgetByName(raw?.budgetName);
    const smartCategory = type === 'expense'
      ? (safeText(raw?.smartCategory, 60) || inferSmartCategory(description) || 'Lainnya')
      : '';
    const warnings = Array.isArray(raw?.needsReview) ? raw.needsReview.map(x => safeText(x,140)).filter(Boolean).slice(0,4) : [];
    if (!amount && !warnings.some(x => /nominal/i.test(x))) warnings.push('Nominal belum terbaca.');
    if (!account && state.accounts.length > 1 && !warnings.some(x => /dompet|rekening|akun/i.test(x))) warnings.push('Pilih dompet/rekening.');
    if (type === 'transfer' && !accountTo && !warnings.some(x => /tujuan/i.test(x))) warnings.push('Pilih rekening tujuan.');
    return {
      type, amount, description, smartCategory,
      accountId: account?.id || '', accountName: account?.name || '',
      accountToId: accountTo?.id || '', accountToName: accountTo?.name || '',
      budgetId: budget?.id || '', budgetName: budget?.name || '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.date || '') ? raw.date : todayKey(),
      confidence: Math.max(0, Math.min(100, Math.round(Number(raw?.confidence || 0)))),
      needsReview: warnings
    };
  }

  function draftComplete(draft) {
    if (!draft || draft.amount <= 0 || !draft.description || !draft.accountId) return false;
    if (draft.type === 'transfer' && (!draft.accountToId || draft.accountToId === draft.accountId)) return false;
    return true;
  }

  async function parseTransactionMessage(message, source = 'chat') {
    const text = safeText(message, 700);
    if (!text) throw new Error('Tulis atau ucapkan transaksi terlebih dahulu.');
    try {
      const response = await fetch('/api/transaction-assistant', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json', ...(await getPrivateApiAuthHeader()) },
        body:JSON.stringify({
          message:text,
          today:todayKey(),
          accounts:state.accounts.map(a => a.name),
          budgets:state.budgets.map(b => b.name),
          source
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Asisten gagal (${response.status}).`);
      return (result.transactions || []).map(normalizeDraft).filter(Boolean);
    } catch (error) {
      const fallback = localParse(text);
      if (!fallback.length) throw error;
      showToast('AI sedang tidak tersedia. Draft dibuat dengan parser lokal dan perlu diperiksa.', true);
      return fallback;
    }
  }

  function assistantMessage(text, role = 'assistant') {
    const log = $('assistant-chat-log');
    if (!log) return;
    const el = document.createElement('div');
    el.className = `transaction-assistant-message ${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function renderAssistantDrafts(drafts) {
    assistantDrafts = drafts.map(normalizeDraft);
    const area = $('assistant-draft-area');
    const list = $('assistant-draft-list');
    if (!area || !list) return;
    area.hidden = false;
    const average = assistantDrafts.length ? Math.round(assistantDrafts.reduce((s,d)=>s+d.confidence,0)/assistantDrafts.length) : 0;
    $('assistant-draft-confidence').textContent = average ? `${average}% yakin` : 'Perlu review';
    $('assistant-draft-confidence').className = `assistant-confidence ${average >= 85 ? 'good' : average >= 65 ? 'warn' : 'low'}`;
    $('assistant-draft-summary').textContent = `${assistantDrafts.length} transaksi ditemukan. ${assistantDrafts.every(draftComplete) ? 'Siap dikonfirmasi.' : 'Ada data yang perlu dilengkapi.'}`;
    list.innerHTML = assistantDrafts.map((draft,index) => {
      const valueClass = draft.type === 'income' ? 'income' : draft.type === 'transfer' ? 'transfer' : 'expense';
      const accountText = draft.type === 'transfer'
        ? `${draft.accountName || 'Belum dipilih'} → ${draft.accountToName || 'Belum dipilih'}`
        : (draft.accountName || 'Dompet belum dipilih');
      const warnings = draft.needsReview.length ? `<div class="assistant-draft-warning"><i class="fa-solid fa-triangle-exclamation"></i>${draft.needsReview.map(escapeHtml).join(' • ')}</div>` : '';
      return `<article class="assistant-draft-card ${draftComplete(draft) ? '' : 'needs-review'}">
        <div class="assistant-draft-card-top">
          <span class="assistant-type-chip ${escapeHtml(draft.type)}"><i class="fa-solid ${TYPE_ICONS[draft.type]}"></i>${TYPE_LABELS[draft.type]}</span>
          <strong class="assistant-draft-amount ${valueClass}">${toRp(draft.amount)}</strong>
        </div>
        <h4>${escapeHtml(draft.description)}</h4>
        <div class="assistant-draft-meta">
          ${draft.type === 'expense' ? `<span><i class="fa-solid fa-tag"></i>${escapeHtml(draft.smartCategory || 'Lainnya')}</span>` : ''}
          <span><i class="fa-solid fa-wallet"></i>${escapeHtml(accountText)}</span>
          <span><i class="fa-regular fa-calendar"></i>${escapeHtml(draft.date)}</span>
        </div>
        ${warnings}
        <button type="button" class="assistant-edit-draft" onclick="editAssistantDraft(${index})"><i class="fa-solid fa-pen"></i> Review / Edit</button>
      </article>`;
    }).join('');
    const save = $('assistant-save-all');
    const canSave = assistantDrafts.length > 0 && assistantDrafts.every(draftComplete);
    save.disabled = !canSave;
    save.innerHTML = assistantDrafts.length > 1 ? `<i class="fa-solid fa-check-double"></i> Konfirmasi ${assistantDrafts.length} Transaksi` : `<i class="fa-solid fa-check"></i> Konfirmasi & Simpan`;
  }

  async function processAssistantText(message, source = 'chat') {
    if (assistantBusy) return;
    const cleanMessage = safeText(message,700);
    if (!cleanMessage) return showToast('Tulis atau ucapkan transaksi terlebih dahulu.', true);
    assistantBusy = true;
    assistantSource = source;
    $('transaction-assistant-send').disabled = true;
    $('voice-process-button').disabled = true;
    if (source === 'chat') assistantMessage(cleanMessage, 'user');
    assistantMessage('Membaca nominal, tipe, dompet, dan kategori…', 'assistant loading');
    try {
      const drafts = await parseTransactionMessage(cleanMessage, source);
      const log = $('assistant-chat-log');
      log?.querySelector('.transaction-assistant-message.loading:last-child')?.remove();
      if (!drafts.length) throw new Error('Belum ada transaksi yang dapat dibuat.');
      assistantMessage(`Ditemukan ${drafts.length} transaksi. Periksa draft sebelum disimpan.`, 'assistant');
      renderAssistantDrafts(drafts);
    } catch (error) {
      $('assistant-chat-log')?.querySelector('.transaction-assistant-message.loading:last-child')?.remove();
      assistantMessage(error.message || 'Transaksi belum dapat dipahami.', 'assistant error');
      showToast(error.message || 'Transaksi belum dapat dipahami.', true);
    } finally {
      assistantBusy = false;
      $('transaction-assistant-send').disabled = false;
      $('voice-process-button').disabled = !voiceTranscript.trim();
    }
  }

  function setRecordMode(mode) {
    recordLaunchMode = mode;
    const type = $('tx-type')?.value || 'expense';
    const receipt = $('receipt-scan-box');
    if (receipt) receipt.style.display = mode === 'receipt' && type === 'expense' ? 'block' : 'none';
  }

  window.openRecordMethodChooser = function() {
    closeProfileMenu?.();
    openModal('modal-record-method');
  };

  window.openManualRecordFlow = function() {
    closeModal('modal-record-method');
    setRecordMode('manual');
    openTxModal();
    setRecordMode('manual');
  };

  window.openReceiptRecordFlow = function() {
    closeModal('modal-record-method');
    setRecordMode('receipt');
    openTxModal();
    updateTxType('expense');
    setRecordMode('receipt');
    setTimeout(() => $('receipt-camera-btn')?.focus({preventScroll:true}), 60);
  };

  function resetAssistantUI() {
    assistantDrafts = [];
    $('assistant-draft-area').hidden = true;
    $('assistant-draft-list').innerHTML = '';
    $('transaction-assistant-input').value = '';
    voiceTranscript = '';
    if ($('voice-transcript')) $('voice-transcript').textContent = 'Belum ada suara yang ditangkap.';
    if ($('voice-process-button')) $('voice-process-button').disabled = true;
  }

  window.openTransactionAssistant = function(mode = 'chat') {
    closeModal('modal-record-method');
    resetAssistantUI();
    openModal('modal-transaction-assistant');
    if (mode === 'voice') switchAssistantToVoice(); else switchAssistantToChat();
  };

  window.closeTransactionAssistant = function() {
    stopVoiceCapture(true);
    closeModal('modal-transaction-assistant');
  };

  window.switchAssistantToChat = function() {
    stopVoiceCapture(true);
    $('assistant-chat-mode').hidden = false;
    $('assistant-voice-mode').hidden = true;
    $('transaction-assistant-title').textContent = 'Asisten Catat';
    setTimeout(() => $('transaction-assistant-input')?.focus({preventScroll:true}), 50);
  };

  window.switchAssistantToVoice = function() {
    $('assistant-chat-mode').hidden = true;
    $('assistant-voice-mode').hidden = false;
    $('transaction-assistant-title').textContent = 'Catat dengan Suara';
    $('voice-status-title').textContent = 'Ketuk mikrofon untuk mulai';
    $('voice-status-copy').textContent = 'Ucapkan transaksi dengan natural. Contoh: “gajian 5 juta masuk BCA”.';
  };

  window.useTransactionExample = function(text) {
    $('transaction-assistant-input').value = text;
    processAssistantText(text, 'chat');
  };

  window.clearAssistantDrafts = function() {
    assistantDrafts = [];
    $('assistant-draft-area').hidden = true;
    $('assistant-draft-list').innerHTML = '';
    if (!$('assistant-chat-mode').hidden) $('transaction-assistant-input').focus();
  };

  window.editAssistantDraft = function(index) {
    const draft = assistantDrafts[index];
    if (!draft) return;
    closeTransactionAssistant();
    setRecordMode('assistant');
    openTxModal();
    updateTxType(draft.type);
    setRecordMode('assistant');
    $('tx-amount').value = draft.amount || '';
    $('tx-cat').value = draft.description || '';
    if ($('tx-smart-category') && draft.type === 'expense') $('tx-smart-category').value = draft.smartCategory || '';
    if (draft.accountId) $('tx-acc').value = draft.accountId;
    if (draft.type === 'transfer' && draft.accountToId) $('tx-acc-to').value = draft.accountToId;
    if (draft.type === 'expense' && draft.budgetId) $('tx-budget').value = draft.budgetId;
    $('tx-date').value = draft.date || todayKey();
    updateSmartCategoryHint();
    showToast('Draft sudah dimasukkan ke form. Periksa lalu simpan.');
  };

  window.confirmAssistantDrafts = function() {
    if (!assistantDrafts.length) return;
    if (!assistantDrafts.every(draftComplete)) return showToast('Ada draft yang belum lengkap. Gunakan Review / Edit terlebih dahulu.', true);
    const before = cloneFinanceSnapshot();
    const created = [];
    for (const draft of assistantDrafts) {
      const tx = {
        id: generateId(),
        type: draft.type,
        amount: draft.amount,
        category: safeText(draft.description,100),
        smartCategory: draft.type === 'expense' ? (safeText(draft.smartCategory,60) || inferSmartCategory(draft.description)) : '',
        accountId: draft.accountId,
        date: draft.date || todayKey(),
        budgetId: draft.type === 'expense' ? (draft.budgetId || null) : null,
        accountToId: draft.type === 'transfer' ? draft.accountToId : null,
        inputMeta: {
          source: assistantSource === 'voice' ? 'voice' : 'assistant',
          confidence: draft.confidence,
          createdAt: Date.now()
        }
      };
      state.transactions.push(tx);
      applyBalance(tx);
      created.push(tx);
    }
    saveData();
    render();
    closeTransactionAssistant();
    const total = created.reduce((sum, tx) => sum + tx.amount, 0);
    const label = created.length > 1 ? `${created.length} transaksi` : TYPE_LABELS[created[0].type];
    showUndoToast(`${label} ${toRp(total)} berhasil dicatat.`, before);
  };

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      voiceListening = true;
      $('voice-record-button')?.classList.add('listening');
      $('voice-status-title').textContent = 'Sedang mendengarkan…';
      $('voice-status-copy').textContent = 'Bicara dengan jelas. Ketuk lagi untuk berhenti.';
    };
    recognition.onresult = event => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += text; else interim += text;
      }
      if (finalText.trim()) voiceTranscript = `${voiceTranscript} ${finalText}`.trim();
      const shown = `${voiceTranscript} ${interim}`.trim();
      $('voice-transcript').textContent = shown || 'Mendengarkan…';
      $('voice-process-button').disabled = !shown;
    };
    recognition.onerror = event => {
      voiceListening = false;
      $('voice-record-button')?.classList.remove('listening');
      const message = event.error === 'not-allowed' ? 'Izin mikrofon ditolak. Izinkan mikrofon atau gunakan Chat.' : `Voice gagal: ${event.error || 'tidak diketahui'}.`;
      $('voice-status-title').textContent = 'Voice belum tersedia';
      $('voice-status-copy').textContent = message;
      showToast(message, true);
    };
    recognition.onend = () => {
      voiceListening = false;
      $('voice-record-button')?.classList.remove('listening');
      if (voiceTranscript.trim()) {
        $('voice-status-title').textContent = 'Suara berhasil ditangkap';
        $('voice-status-copy').textContent = 'Periksa transkrip lalu tekan Proses.';
        $('voice-process-button').disabled = false;
      } else if ($('voice-status-title')?.textContent === 'Sedang mendengarkan…') {
        $('voice-status-title').textContent = 'Belum terdengar jelas';
        $('voice-status-copy').textContent = 'Ketuk mikrofon dan coba lagi.';
      }
    };
    return recognition;
  }

  function stopVoiceCapture(silent = false) {
    if (speechRecognition && voiceListening) {
      try { speechRecognition.stop(); } catch (_) {}
    }
    voiceListening = false;
    $('voice-record-button')?.classList.remove('listening');
    if (!silent && voiceTranscript.trim()) $('voice-process-button').disabled = false;
  }

  window.toggleVoiceCapture = function() {
    if (voiceListening) return stopVoiceCapture();
    if (!speechRecognition) speechRecognition = setupSpeechRecognition();
    if (!speechRecognition) {
      const message = 'Browser ini belum mendukung input suara langsung. Gunakan Chat atau form Manual.';
      $('voice-status-title').textContent = 'Voice tidak didukung';
      $('voice-status-copy').textContent = message;
      return showToast(message, true);
    }
    voiceTranscript = '';
    $('voice-transcript').textContent = 'Mendengarkan…';
    $('voice-process-button').disabled = true;
    try { speechRecognition.start(); }
    catch (_) { showToast('Mikrofon sedang digunakan. Coba lagi sesaat.', true); }
  };

  window.processVoiceTranscript = function() {
    const text = voiceTranscript.trim();
    if (!text) return showToast('Belum ada transkrip suara.', true);
    processAssistantText(text, 'voice');
  };

  const originalUpdateTxType = window.updateTxType;
  window.updateTxType = function(type) {
    const result = originalUpdateTxType(type);
    setRecordMode(recordLaunchMode);
    return result;
  };

  const originalOpenTxModal = window.openTxModal;
  window.openTxModal = function(id = null) {
    if (id) recordLaunchMode = 'manual';
    const result = originalOpenTxModal(id);
    setRecordMode(recordLaunchMode);
    return result;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('transaction-assistant-form');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', event => {
        event.preventDefault();
        const input = $('transaction-assistant-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        processAssistantText(text, 'chat');
      });
    }
  });
})();
