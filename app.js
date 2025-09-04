/* Keyword Generator — app.js (role-aware auth, variable-only transforms, ads filters) */
(() => {
  // ===== Hashes provided by index.html (two only) =====
  const PUBLIC_HASH = window.KG_PUBLIC_HASH;
  const ADMIN_HASH  = window.KG_ADMIN_HASH;

  const STORAGE = { templates:'kg_templates_v3', logs:'kg_logs_v3', theme:'kg_theme' };
  const IDLE_LIMIT_MS = 30*60*1000;

  // Force re-login on every refresh (as before)
  try { sessionStorage.removeItem('kg_auth'); } catch {}

  // ===== Default Templates (legacy Type 1 with keyword8) =====
  const DEFAULT_TEMPLATES = {
    types: {
      "Type 1 (legacy)": {
        columns: ["Campaign Name", "Adset Name", "Keywords"],
        rows: [
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1",                 keywords:"{{keyword1}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword2",        keywords:"{{keyword1}} {{keyword2}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword3",        keywords:"{{keyword1}} {{keyword3}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword4",        keywords:"{{keyword1}} {{keyword4}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword5",        keywords:"{{keyword1}} {{keyword5}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword6",        keywords:"{{keyword1}} {{keyword6}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword7",        keywords:"{{keyword1}} {{keyword7}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_keyword8",        keywords:"{{keyword1}} {{keyword8}}"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_amenities",       keywords:"{{keyword1}} amenities"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_best_offers",     keywords:"{{keyword1}} best offers"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_booking",         keywords:"{{keyword1}} booking"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_construction_status", keywords:"{{keyword1}} construction status"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_floor_plan",      keywords:"{{keyword1}} floor plan"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_launch_price",    keywords:"{{keyword1}} launch price"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_launch_date",     keywords:"{{keyword1}} launch date"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_location",        keywords:"{{keyword1}} location"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_master_plan",     keywords:"{{keyword1}} master plan"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_payment_plan",    keywords:"{{keyword1}} payment plan"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_possession_date", keywords:"{{keyword1}} possession date"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_price",           keywords:"{{keyword1}} price"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_rera_number",     keywords:"{{keyword1}} rera number"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_reviews",         keywords:"{{keyword1}} reviews"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_site_visit",      keywords:"{{keyword1}} site visit"},
          {campaign:"BRAND_{{keyword1.slug}}_search", adset:"keyword1_specifications",  keywords:"{{keyword1}} specifications"}
        ]
      }
    }
  };
  
  /* Always require login on each load (and after BFCache restores) */
  try { sessionStorage.clear(); } catch {}

  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('gate');
    if (gate) {
      gate.classList.remove('hidden');            // show the gate
      const pass = document.getElementById('gate-pass');
      if (pass) pass.value = '';                  // clear any prefilled value
      // default role to Public
      const publicOpt = document.querySelector('input[name="gate-role"][value="public"]');
      if (publicOpt) publicOpt.checked = true;
    }
  });

  // If the page is restored from the browser’s back-forward cache, force a hard reload
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  // ===== State & utils =====
  let state = {
    sessionId: (crypto.randomUUID && crypto.randomUUID()) || (Date.now()+Math.random()).toString(36),
    authed:false, adminAuthed:false,
    lastActivity:Date.now(), templates:null,
    autoLog:true, lastAutoLogAt:0, lastSnapshot:""
  };

  const qs  = (s,r=document)=>r.querySelector(s);
  const qsa = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const todayYMD = () => new Date().toISOString().slice(0,10);
  const timestamp = () => String(Date.now());
  const titleCase = (s='') => s.replace(/\w\S*/g, t=>t[0]?.toUpperCase()+t.slice(1).toLowerCase());
  const slugify = (s='') => (s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/--+/g,'-');
  const escapeHtml = (s='') => String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escapeCsv = v => /[",\n]/.test(String(v??'')) ? `"${String(v).replace(/"/g,'""')}"` : String(v??'');
  const fmtDate = ts => new Date(ts).toLocaleString();
  const escapeTsv = v => String(v??'').replace(/\t/g,' ').replace(/\r?\n/g,' ');

  // File helpers are used by Ads handlers; define them early
  const fileName = (base,ext)=>`${base}_${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
  const saveFile = (name, content, type='text/plain') => {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  };
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text); return true;
      }
    } catch {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok=false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }

  // ===== NEW: Role gating (hide tabs for Public) =====
  function applyRoleView(role){
    // show all by default
    qsa('.tabs .tab').forEach(b=>{ b.hidden=false; b.style.display=''; b.setAttribute('aria-hidden','false'); });
    qsa('main .panel').forEach(p=>{ p.hidden=false; p.style.display=''; p.setAttribute('aria-hidden','false'); });

    if(role==='public'){
      qsa('.tabs .tab').forEach(b=>{
        const key=b.getAttribute('data-tab');
        if(key!=='generate'){ b.hidden=true; b.style.display='none'; b.setAttribute('aria-hidden','true'); }
      });
      qsa('main .panel').forEach(p=>{
        if(p.id!=='tab-generate'){ p.hidden=true; p.style.display='none'; p.setAttribute('aria-hidden','true'); }
      });
      // select Generate tab
      const genBtn = qs('.tabs .tab[data-tab="generate"]');
      if(genBtn){
        qsa('.tabs .tab').forEach(b=>b.setAttribute('aria-selected','false'));
        genBtn.setAttribute('aria-selected','true');
        genBtn.click?.();
      }
    } else {
      // ensure something visible is selected
      const selected = qs('.tabs .tab[aria-selected="true"]') || qsa('.tabs .tab').find(b=>!b.hidden);
      selected?.click?.();
    }
  }

  // ===== NEW: Auth with public/admin radio =====
  const gateEl=qs('#gate'), gatePass=qs('#gate-pass'), gateBtn=qs('#gate-enter'), gateErr=qs('#gate-error');
  const sha256Hex = async (text) => {
    const enc=new TextEncoder().encode(text);
    const buf=await crypto.subtle.digest('SHA-256',enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  };
  async function tryAuth(){
    gateErr.hidden = true;
    const roleRadio = qs('input[name="gate-role"]:checked');
    const role = (roleRadio?.value === 'admin') ? 'admin' : 'public';
    const pwd = (gatePass.value||'').trim();
    if(!pwd){ gateErr.textContent='Please enter password.'; gateErr.hidden=false; return; }
    const hex=await sha256Hex(pwd);
    const target = (role==='admin') ? ADMIN_HASH : PUBLIC_HASH;
    if(hex===target){
      state.authed = true;
      state.adminAuthed = (role==='admin');
      gateEl.classList.add('hidden');
      applyRoleView(role);
      init();
    } else {
      gateErr.textContent='Incorrect password. Try again.';
      gateErr.hidden=false;
      gatePass.select();
    }
  }
  gateBtn?.addEventListener('click', tryAuth);
  gatePass?.addEventListener('keydown',e=>{if(e.key==='Enter') tryAuth();});
  qs('#lock')?.addEventListener('click',()=>{ location.reload(); });

  // ===== Admin prompt helpers (for guarded tabs/actions) =====
  async function ensureAdmin() {
    if (state.adminAuthed) return true;
    const input = prompt('Admin password required:');
    if(input===null) return false;
    try{ const hex = await sha256Hex(input); if(hex===ADMIN_HASH){ state.adminAuthed=true; return true; } }catch{}
    alert('Incorrect admin password.'); return false;
  }
  async function confirmAdminDelete() {
    const input = prompt('Confirm delete ALL logs.\nEnter ADMIN password to proceed:');
    if(input===null) return false;
    try{ const hex = await sha256Hex(input); return hex===ADMIN_HASH; }catch{ return false; }
  }

  // ===== Tabs (Logs/Templates protected for Public) =====
  function setupTabs(){
    const nav = qs('#tabs');
    nav.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.tab'); if(!btn) return;
      const target = btn.dataset.tab;
      if((target === 'logs' || target === 'templates') && !state.adminAuthed){
        const ok = await ensureAdmin(); if(!ok) return;
      }
      qsa('.tab', nav).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      qsa('.panel').forEach(p=>p.classList.remove('active'));
      qs('#empty-state')?.classList.add('hidden');
      qs('#tab-'+target).classList.add('active');
      if (target==='logs') renderLogs();
      if (target==='templates') refreshTemplatesPreview?.();
    });
  }
  setupTabs();

  // ===== Idle/theme =====
  const activity=()=>{state.lastActivity=Date.now();};
  ['mousemove','keydown','touchstart','click'].forEach(e=>window.addEventListener(e,activity,{capture:true}));
  setInterval(()=>{ if(state.authed && Date.now()-state.lastActivity>IDLE_LIMIT_MS){ location.reload(); } },10_000);
  const applyTheme = t => document.documentElement.classList.toggle('light', t==='light');
  applyTheme(localStorage.getItem(STORAGE.theme)||'light');
  qs('#theme-toggle')?.addEventListener('click',()=>{
    const next=document.documentElement.classList.contains('light')?'dark':'light';
    localStorage.setItem(STORAGE.theme,next);applyTheme(next);
  });

  /* =========================
     Template loading (ALWAYS RESET TO SHIPPED DEFAULTS ON REFRESH)
     ========================= */
  const lsGet = (k, fallback) => { try { const raw = localStorage.getItem(k); return raw==null ? fallback : JSON.parse(raw); } catch { return fallback; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { console.warn('localStorage write failed for', k); return false; } };

  const loadTemplates=()=>{
    const shipped = (typeof window.KG_DEFAULT_TEMPLATES === 'object'
      && window.KG_DEFAULT_TEMPLATES && window.KG_DEFAULT_TEMPLATES.types)
      ? window.KG_DEFAULT_TEMPLATES
      : DEFAULT_TEMPLATES;
    // Always reset to shipped defaults on each refresh
    const result = JSON.parse(JSON.stringify(shipped));
    state.templates = result;
    lsSet(STORAGE.templates, result);
  };
  const persistTemplates=()=>lsSet(STORAGE.templates, state.templates);
  const getLogs = ()=>lsGet(STORAGE.logs, []);
  const setLogs = arr=>lsSet(STORAGE.logs, arr);

  // ===== Init =====
  function init(){
    loadTemplates();
    const sess = qs('#session-id'); if (sess) sess.value = state.sessionId;
    populateTypeSelect();
    renderInputsForType();
    bindShortcuts();
    renderPreview();
    renderAdsCopyPreview();
  }

  // ===== NEW: Dynamic placeholder helpers (samples) =====
  function getTypeSamples(typeName){
    const shippedType = window.KG_DEFAULT_TEMPLATES?.types?.[typeName] || null;
    const storedType  = state.templates?.types?.[typeName] || null;
    return (shippedType?.samples || shippedType?.sampleValues ||
            storedType?.samples  || storedType?.sampleValues  || {});
  }
  function pickSampleValue(val, indexHint){
    if (val == null) return '';
    if (Array.isArray(val)) {
      if (typeof indexHint === 'number' && val[indexHint] != null) return String(val[indexHint]);
      return String(val[0] ?? '');
    }
    if (typeof val === 'object') {
      return String(val.sample ?? val.example ?? '');
    }
    return String(val);
  }
  function sampleForLabel(typeName, rawLabel, indexHint){
    const samples = getTypeSamples(typeName) || {};
    const clean = String(rawLabel);
    const withBraces = `{${clean}}`;
    const tryPick = (k) => (k in samples) ? pickSampleValue(samples[k], indexHint) : '';
    let v = tryPick(clean); if (v) return v;
    v = tryPick(withBraces); if (v) return v;
    const lower = clean.toLowerCase();
    for (const k of Object.keys(samples)){
      const norm = k.replace(/^\{|\}$/g,'').toLowerCase();
      if (norm === lower) return pickSampleValue(samples[k], indexHint);
    }
    const kwMatch = clean.match(/^keyword(\d+)$/i);
    if (kwMatch) {
      const n = Number(kwMatch[1]);
      if (Array.isArray(samples.keywords) && samples.keywords[n-1] != null) {
        return String(samples.keywords[n-1]);
      }
      if (samples.keyword != null) return pickSampleValue(samples.keyword, n-1);
    }
    return '';
  }

  // ===== Inputs =====
  function typeHasVariables(typeName){
    return !!(state.templates.types[typeName] && Array.isArray(state.templates.types[typeName].variables));
  }
  function renderInputsForType(){
    const typeName = qs('#in-type').value;
    const box = qs('#kw-box'); if (!box) return;
    box.innerHTML = '';

    if (typeHasVariables(typeName)) {
      const vars = state.templates.types[typeName].variables;
      vars.forEach(label => {
        const clean = label.replace(/^\{|\}$/g,'');
        const id = 'in-var-' + slugify(clean).replace(/[^a-z0-9-]/g,'-');
        const sample = sampleForLabel(typeName, clean);
        const wrap = document.createElement('div');
        wrap.innerHTML = `<label>${escapeHtml(clean)}</label><input type="text" id="${id}" placeholder="${escapeHtml(sample)}">`;
        box.appendChild(wrap);
      });
    } else {
      const maxN = maxKeywordIndexInType(typeName);
      for(let i=1;i<=maxN;i++){
        const wrap = document.createElement('div');
        const key = `keyword${i}`;
        const sample = sampleForLabel(typeName, key, i-1);
        wrap.innerHTML = `<label>${key} ${i===1?'(required)':''}</label><input type="text" id="in-${key}" placeholder="${escapeHtml(sample)}">`;
        box.appendChild(wrap);
      }
    }

    qsa('#kw-box input').forEach(inp=>{
      inp.addEventListener('input', ()=>{ renderPreview(); renderAdsCopyPreview(); scheduleAutoLog(); });
      inp.addEventListener('change', ()=>{ renderPreview(); renderAdsCopyPreview(); scheduleAutoLog(true); });
    });
  }

  // ===== NEW: display helper for "Type ID (Nickname)" =====
  function getTypeDisplayName(typeId){
    const def = state.templates?.types?.[typeId];
    const nick = def && def.nickname ? ` (${def.nickname})` : '';
    return `${typeId}${nick}`;
  }
  function populateTypeSelect(){
    const sel=qs('#in-type'); if(!sel) return;
    qsa('option', sel).forEach((o,i)=>{ if(i>0) o.remove(); });
    Object.keys(state.templates.types).forEach(t=>{
      if (t !== sel.options[0].value){
        const o=document.createElement('option');
        o.value=t;
        o.textContent=getTypeDisplayName(t);
        sel.appendChild(o);
      }
    });
    if (sel.options.length > 0) {
      const firstVal = sel.options[0].value;
      if (state.templates.types[firstVal]?.nickname) {
        sel.options[0].textContent = getTypeDisplayName(firstVal);
      }
    }
    sel.addEventListener('change', ()=>{ renderInputsForType(); renderPreview(); renderAdsCopyPreview(); autoLogEvent(); });
  }

  // ===== Helpers for legacy keywords =====
  function maxKeywordIndexInType(typeName){
    const type = state.templates.types[typeName];
    if(!type) return 3;
    const scan = JSON.stringify(type);
    const m = [...scan.matchAll(/{{\s*keyword(\d+)(?:\.[a-z]+)?\s*}}/gi)].map(x=>Number(x[1]));
    return m.length ? Math.max(...m) : 3;
  }

  /* =========================
     Template engine with VARIABLE-ONLY transforms
     ========================= */
  const varLowerUnderscore = (s='') =>
    String(s).trim().toLowerCase().replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
  const varLowerSpaces = (s='') =>
    String(s).trim().toLowerCase(); // preserve spaces as typed
  const varTitleCase = (s='') => titleCase(String(s).trim());
  const normalizeSlashTight = (s='') => String(s).replace(/\s*\/\s*/g,'/');

  function evaluateWithTransforms(tpl, vars, {namedTransform, legacyTransform} = {}){
    if(!tpl) return '';

    // legacy {{keywordN[.modifier]}}
    tpl = tpl.replace(/{{\s*([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\s*}}/g, (_m, key, mod) => {
      let val = ({...vars, today:todayYMD(), ts:timestamp()})[key];
      if(val==null) val='';
      if (mod) {
        if(mod==='lower') return String(val).toLowerCase();
        if(mod==='upper') return String(val).toUpperCase();
        if(mod==='cap')   return titleCase(String(val));
        if(mod==='slug')  return slugify(String(val));
        return String(val);
      }
      return legacyTransform ? legacyTransform(val) : String(val);
    });

    // single-brace {VAR}
    tpl = tpl.replace(/{\s*([^{}]+?)\s*}/g, (_m, labelRaw) => {
      const label = labelRaw.replace(/^\{|\}$/g,'');
      const v = vars[label];
      if (v==null) return '';
      return namedTransform ? namedTransform(v) : String(v);
    });

    return tpl;
  }

  /* =========================
     Inline JOIN helpers
     ========================= */
  function parseJoinLabels(str=''){
    const labels = [];
    const re = /{\s*JOIN:([^{}]+)\s*}/gi;
    let m; 
    while ((m = re.exec(str))) {
      const csv = m[1];
      csv.split(',').map(s=>s.trim()).filter(Boolean).forEach(l=>labels.push(l));
    }
    return labels;
  }
  function hasAnyJoinValue(str='', vars={}){
    const labels = parseJoinLabels(str);
    if (labels.length === 0) return true;
    return labels.some(l => vars[l] != null && String(vars[l]).trim() !== '');
  }
  function expandInlineJoins(str='', vars={}, itemTransform){
    return String(str).replace(/{\s*JOIN:([^{}]+)\s*}/g, (_m, csv) => {
      const labels = csv.split(',').map(s => s.trim()).filter(Boolean);
      const parts = [];
      labels.forEach(label => {
        const v = vars[label];
        if (v != null && String(v).trim() !== '') {
          parts.push(itemTransform ? itemTransform(v) : String(v));
        }
      });
      return parts.join('/');
    });
  }

  /* =========================
     Row filtering logic
     ========================= */
  function extractKeywordIndexesFromPlaceholders(str=''){
    const set = new Set();
    const re = /{{\s*keyword(\d+)(?:\.[a-z]+)?\s*}}/gi;
    let m; while((m = re.exec(str))){ set.add(Number(m[1])); }
    return set;
  }
  function extractKeywordIndexesFromLiterals(str=''){
    const set = new Set();
    const re = /(^|[^a-z0-9])keyword(\d+)(?=$|[^a-z0-9])/gi;
    let m; while((m = re.exec(str))){ set.add(Number(m[2])); }
    return set;
  }
  function extractNamedLabels(str=''){
    const set = new Set();
    const re = /{\s*([^{}]+?)\s*}/g;
    let m; 
    while((m = re.exec(str))){
      const label = m[1].replace(/^\{|\}$/g,'').trim();
      if (/^JOIN:/i.test(label)) continue; // skip inline JOIN
      set.add(label);
    }
    return set;
  }
  function requiredRefsForSearchRow(row){
    const s1p = extractKeywordIndexesFromPlaceholders(row.campaign || '');
    const s2p = extractKeywordIndexesFromPlaceholders(row.adset || '');
    const s3p = extractKeywordIndexesFromPlaceholders(row.keywords || '');
    const s1l = extractKeywordIndexesFromLiterals(row.campaign || '');
    const s2l = extractKeywordIndexesFromLiterals(row.adset || '');
    const s3l = extractKeywordIndexesFromLiterals(row.keywords || '');
    const s1n = extractNamedLabels(row.campaign || '');
    const s2n = extractNamedLabels(row.adset || '');
    const s3n = extractNamedLabels(row.keywords || '');
    return {
      keywordIdx: new Set([...s1p, ...s2p, ...s3p, ...s1l, ...s2l, ...s3l]),
      named:      new Set([...s1n, ...s2n, ...s3n])
    };
  }
  function requiredRefsForAdsRow(row){
    const n = extractNamedLabels(row.copy || '');
    const kp = extractKeywordIndexesFromPlaceholders(row.copy || '');
    const kl = extractKeywordIndexesFromLiterals(row.copy || '');
    return { keywordIdx: new Set([...kp, ...kl]), named: n };
  }
  function rowHasAllVars(refs, vars){
    for (const idx of refs.keywordIdx){
      const v = vars['keyword'+idx];
      if (!v || !String(v).trim()) return false;
    }
    for (const label of refs.named){
      const v = vars[label];
      if (v == null || !String(v).trim()) return false;
    }
    return true;
  }
  function filterSearchRowsByVars(rows, vars){
    return rows.filter(r => rowHasAllVars(requiredRefsForSearchRow(r), vars));
  }
  function filterAdsRowsByVars(rows, vars){
    return rows.filter(r => {
      if (r?.X === true) return true;
      const refsOk = rowHasAllVars(requiredRefsForAdsRow(r), vars);
      if (!refsOk) return false;
      if (!hasAnyJoinValue(r.copy || '', vars)) return false;
      return true;
    });
  }

  // ===== Ensure Ads table (and toolbar) exist in DOM =====
  function ensureAdsTable(){
    const previewCard = qs('#preview-table')?.closest('.card');
    if(!previewCard) return;

    if (!qs('#ads-copy-block')) {
      const wrap = document.createElement('div');
      wrap.id = 'ads-copy-block';
      wrap.innerHTML = `
        <h3 style="margin-top:1rem">Ads Copy</h3>
        <div class="row gap stack-on-small" id="ads-toolbar" style="margin: .25rem 0 .5rem 0;">
          <div class="row gap wrap" aria-label="Ads actions">
            <button type="button" class="btn" id="btn-ads-copy-all" title="Copy all Ads rows (TSV)">Copy All</button>
            <button type="button" class="btn" id="btn-ads-export-csv" title="Export Ads CSV">Export CSV</button>
            <button type="button" class="btn" id="btn-ads-export-json" title="Export Ads JSON" hidden>Export JSON</button>
          </div>
        </div>
        <div class="table-wrap" id="adscopy-wrap">
          <table id="ads-table" class="table">
            <thead><tr><th>Particulars</th><th>Ads Copy</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <p class="muted small">
          Tip: tap/click any cell to copy it. Shortcut (Ads Copy): <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> → Export CSV
        </p>
      `;
      previewCard.appendChild(wrap);

      // Wire Ads toolbar once
      qs('#btn-ads-copy-all').addEventListener('click', async ()=>{
        const rows = collectAdsExportRows();
        const header = ['Particulars','Ads Copy'];
        const lines = [header.map(escapeTsv).join('\t')];
        rows.forEach(r=>lines.push([escapeTsv(r['Particulars']), escapeTsv(r['Ads Copy'])].join('\t')));
        const ok = await copyText(lines.join('\n'));
        autoLogEvent?.();
        if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
      });

      qs('#btn-ads-export-csv').addEventListener('click', ()=>{
        const rows = collectAdsExportRows();
        const header = ['Particulars','Ads Copy'];
        const lines = [header.map(escapeCsv).join(',')];
        rows.forEach(r=>lines.push(header.map(h=>escapeCsv(r[h])).join(',')));
        saveFile(fileName('ads_copy','csv'), lines.join('\n'), 'text/csv');
        autoLogEvent?.();
      });

      qs('#btn-ads-export-json').addEventListener('click', ()=>{
        const rows = collectAdsExportRows();
        saveFile(fileName('ads_copy','json'), JSON.stringify(rows, null, 2), 'application/json');
        autoLogEvent?.();
      });

      // Bind Ads-specific shortcut once (Export only)
      bindAdsShortcutOnce();
    }
  }

  // ---- One-time Ads shortcut (Ctrl+Shift+E only) ----
  function bindAdsShortcutOnce(){
    if (window.__adsShortcutBound) return;
    window.__adsShortcutBound = true;

    document.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
      if (isEditable) return;

      if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
        const btn = qs('#btn-ads-export-csv');
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }, { passive: true });
  }

  // ===== Accessors for rows =====
  function getSearchRows(def){
    if (Array.isArray(def?.searchRows)) return def.searchRows;
    if (Array.isArray(def?.rows)) return def.rows;
    return [];
  }
  function getAdsRows(def){
    if (Array.isArray(def?.adsRows)) return def.adsRows;
    if (def?.adsCopy && Array.isArray(def.adsCopy.rows)) {
      return def.adsCopy.rows.map(x => ({
        particular: x.particulars ?? x.particular ?? '',
        copy: x.copy ?? '',
        X: x.X === true
      }));
    }
    return [];
  }

  /* =========================
     PREVIEW RENDER (variable-only transforms)
     ========================= */
  function renderPreview(){
    const tbody = qs('#preview-table tbody'); if(!tbody) return;
    tbody.innerHTML='';
    const typeName = qs('#in-type').value;
    const def = state.templates.types[typeName];
    if(!def) return;

    const rows = getSearchRows(def);
    const vars = collectVars();
    const visibleRows = filterSearchRowsByVars(rows, vars);

    visibleRows.forEach(r=>{
      const tr = document.createElement('tr');

      const td1 = document.createElement('td');
      td1.className = 'copyable';
      const c = evaluateWithTransforms(r.campaign, vars, {
        namedTransform:  varLowerUnderscore,
        legacyTransform: varLowerUnderscore
      });
      td1.dataset.copy = c;
      td1.appendChild(Object.assign(document.createElement('code'),{textContent:c}));

      const td2 = document.createElement('td');
      td2.className = 'copyable';
      const a = evaluateWithTransforms(r.adset, vars, {
        namedTransform:  varLowerUnderscore,
        legacyTransform: varLowerUnderscore
      });
      td2.dataset.copy = a;
      td2.appendChild(Object.assign(document.createElement('code'),{textContent:a}));

      const td3 = document.createElement('td');
      td3.className = 'copyable';
      const k = evaluateWithTransforms(r.keywords, vars, {
        namedTransform:  varLowerSpaces,
        legacyTransform: varLowerSpaces
      });
      td3.dataset.copy = k;
      td3.textContent = k;

      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }

  /* =========================
     ADS COPY RENDER (TitleCase vars + JOIN + filters)
     ========================= */
  function renderAdsCopyPreview(){
    ensureAdsTable();
    const tbody = qs('#ads-table tbody'); if(!tbody) return;
    tbody.innerHTML='';
    const typeName = qs('#in-type').value;
    const def = state.templates.types[typeName]; if(!def) return;

    const allRows = getAdsRows(def);
    const vars = collectVars();
    const rows = filterAdsRowsByVars(allRows, vars);

    rows.forEach(r=>{
      const tr = document.createElement('tr');

      const td1 = document.createElement('td');
      td1.textContent = r.particular ?? r.particulars ?? '';

      const td2 = document.createElement('td');
      let expanded = expandInlineJoins(r.copy || '', vars, varTitleCase);
      let out = evaluateWithTransforms(expanded, vars, {
        namedTransform:  varTitleCase,
        legacyTransform: varTitleCase
      });
      out = normalizeSlashTight(out).trim();

      td2.className = 'copyable';
      td2.dataset.copy = out;
      td2.textContent = out;

      tr.appendChild(td1); tr.appendChild(td2);
      tbody.appendChild(tr);
    });
  }

  // cell click-to-copy (both tables)
  document.addEventListener('click', async (e)=>{
    const td = e.target.closest('td.copyable'); if(!td) return;
    const text = td.dataset.copy ?? td.textContent.trim();
    const ok = await copyText(text);
    td.classList.add('copied'); setTimeout(()=>td.classList.remove('copied'), 900);
    autoLogEvent();
    if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
  }, {capture:true});

  // ===== Buttons / export (SEARCH table only) =====
  qs('#btn-copy-all')?.addEventListener('click',async ()=> {
    const out = collectExportRows();
    const header = Object.keys(out[0]||{campaign:'',adset:'',keywords:''});
    const tsvLines = [header.map(escapeTsv).join('\t')];
    out.forEach(r=>tsvLines.push(header.map(h=>escapeTsv(r[h])).join('\t')));
    const ok = await copyText(tsvLines.join('\n'));
    autoLogEvent();
    if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
  });
  qs('#btn-export-json')?.addEventListener('click',()=>{
    const out = collectExportRows();
    saveFile(fileName('outputs_search','json'), JSON.stringify(out, null, 2), 'application/json');
    autoLogEvent();
  });
  qs('#btn-export-csv')?.addEventListener('click',()=>{
    const out = collectExportRows();
    const header = Object.keys(out[0]||{campaign:'',adset:'',keywords:''});
    const lines = [header.map(escapeCsv).join(',')];
    out.forEach(r=>lines.push(header.map(h=>escapeCsv(r[h])).join(',')));
    saveFile(fileName('outputs_search','csv'), lines.join('\n'), 'text/csv');
    autoLogEvent();
  });

  function collectExportRows(){
    const typeName = qs('#in-type').value;
    const vars=collectVars();
    const rows = getSearchRows(state.templates.types[typeName]);
    const visible = filterSearchRowsByVars(rows, vars);
    return visible.map(r=>{
      const campaign = evaluateWithTransforms(r.campaign, vars, {
        namedTransform:  varLowerUnderscore,
        legacyTransform: varLowerUnderscore
      });
      const adset = evaluateWithTransforms(r.adset, vars, {
        namedTransform:  varLowerUnderscore,
        legacyTransform: varLowerUnderscore
      });
      const keywords = evaluateWithTransforms(r.keywords, vars, {
        namedTransform:  varLowerSpaces,
        legacyTransform: varLowerSpaces
      });
      return { campaign, adset, keywords };
    });
  }

  // Ads Copy export rows
  function collectAdsExportRows(){
    const typeName = qs('#in-type').value;
    const def = state.templates.types[typeName];
    const allRows = getAdsRows(def);
    const vars = collectVars();
    const rows = filterAdsRowsByVars(allRows, vars);
    return rows.map(r=>{
      const particulars = r.particular ?? r.particulars ?? '';
      let expanded = expandInlineJoins(r.copy || '', vars, varTitleCase);
      let copy = evaluateWithTransforms(expanded, vars, {
        namedTransform:  varTitleCase,
        legacyTransform: varTitleCase
      });
      copy = normalizeSlashTight(copy).trim();
      return { "Particulars": particulars, "Ads Copy": copy };
    });
  }

  // ===== Logs (admin-guarded) =====
  qs('#btn-save-log')?.addEventListener('click',()=>{ saveLog('manual'); alert('Saved to logs.'); });
  const toggleAuto = qs('#toggle-autolog');
  if (toggleAuto) toggleAuto.addEventListener('change', e => state.autoLog = e.target.checked);
  qs('#log-search')?.addEventListener('input', renderLogs);
  qs('#log-type-filter')?.addEventListener('change', renderLogs);

  qs('#btn-export-logs-csv')?.addEventListener('click', () => {
    if(!state.adminAuthed){ alert('Admin auth required.'); return; }
    const logs = getLogs();
    const header = ['at','sessionId','type','nRows'];
    const lines = [header.join(',')];
    logs.forEach(e => lines.push([fmtDate(e.at), e.sessionId, e.type, e.outputs.length].map(escapeCsv).join(',')));
    saveFile(fileName('logs','csv'), lines.join('\n'), 'text/csv');
  });
  qs('#btn-export-logs-json')?.addEventListener('click', () => {
    if(!state.adminAuthed){ alert('Admin auth required.'); return; }
    saveFile(fileName('logs','json'), JSON.stringify(getLogs(), null, 2), 'application/json');
  });
  qs('#btn-delete-logs')?.addEventListener('click', async () => {
    if(!state.adminAuthed){ const ok = await ensureAdmin(); if(!ok) return; }
    const okAdmin = await confirmAdminDelete();
    if(!okAdmin){ alert('Admin verification failed.'); return; }
    setLogs([]); renderLogs(); alert('All logs deleted.');
  });

  function renderLogs(){
    if(!state.adminAuthed) return;
    const tbody=qs('#logs-table tbody'); if(!tbody) return;
    tbody.innerHTML='';
    const q = (qs('#log-search').value || '').toLowerCase();
    const typeFilter = qs('#log-type-filter').value;
    getLogs().forEach(e=>{
      const match = !q || JSON.stringify(e).toLowerCase().includes(q);
      const byType = !typeFilter || e.type === typeFilter;
      if (!(match && byType)) return;
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${fmtDate(e.at)}</td>
        <td><code class="small">${escapeHtml(e.sessionId)}</code></td>
        <td>${escapeHtml(e.type)}</td>
        <td>${e.outputs.length}</td>
        <td class="small">${escapeHtml(Object.keys(e.inputs).map(k=>k+':'+e.inputs[k]).join(' | '))}</td>
        <td><button class="btn view">View</button></td>`;
      tr.querySelector('.view').addEventListener('click',()=>{
        alert(e.outputs.map(o=>`• ${o.campaign} | ${o.adset} | ${o.keywords}`).join('\n'));
      });
      tbody.appendChild(tr);
    });
  }

  // ===== Auto-log engine & shortcuts =====
  function saveLog(reason='auto'){
    const typeName=qs('#in-type').value;
    const entry = {
      id:(crypto.randomUUID&&crypto.randomUUID())||(Date.now()+Math.random()).toString(36),
      at:Date.now(), sessionId:state.sessionId, type:typeName,
      inputs: collectVars(),
      outputs: collectExportRows(),
      reason
    };
    const logs=getLogs(); logs.unshift(entry); setLogs(logs); if (qs('#tab-logs')?.classList.contains('active')) renderLogs();
  }
  function currentSnapshotKey(){ return JSON.stringify({t:qs('#in-type').value, v:collectVars()}); }
  function scheduleAutoLog(force=false){
    if(!state.autoLog) return;
    const key = currentSnapshotKey(); const now = Date.now();
    const changed = key !== state.lastSnapshot;
    if(force || (changed && now - state.lastAutoLogAt > 10_000)){
      state.lastSnapshot = key; state.lastAutoLogAt = now; saveLog('auto');
    }
  }
  function autoLogEvent(){ if(!state.autoLog) return; saveLog('action'); }
  function bindShortcuts(){
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target?.tagName||'').toLowerCase();
      if(tag==='input'||tag==='textarea'||e.target?.isContentEditable) return;
      if(e.ctrlKey && e.key.toLowerCase()==='s'){ e.preventDefault(); saveLog('manual'); }
      if(e.ctrlKey && !e.shiftKey && e.code==='KeyE'){ e.preventDefault(); qs('#btn-export-csv')?.click(); }
    });
  }

  /* =======================================================================
     Templates panel helpers
     ======================================================================= */
  const SHIPPED_DEFAULTS = (typeof window.KG_DEFAULT_TEMPLATES === 'object'
    && window.KG_DEFAULT_TEMPLATES && window.KG_DEFAULT_TEMPLATES.types)
    ? window.KG_DEFAULT_TEMPLATES
    : null;

  const __init_orig = init;
  init = function(){
    __init_orig();

    buildLogTypeFilter();
    setupTemplatesPanel();
    refreshTemplatesPreview();

    const tabs = qs('#tabs');
    if (tabs && !tabs.__kg_templates_listener) {
      tabs.addEventListener('click', (e)=>{
        const btn = e.target.closest('.tab'); if(!btn) return;
        if (btn.dataset.tab === 'templates') refreshTemplatesPreview();
      });
      tabs.__kg_templates_listener = true;
    }
  };

  function buildLogTypeFilter(){
    const sel = qs('#log-type-filter'); if(!sel || !state.templates) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Any</option>';
    Object.keys(state.templates.types||{}).forEach(t=>{
      const opt = document.createElement('option');
      opt.value=t;
      opt.textContent=getTypeDisplayName(t);
      sel.appendChild(opt);
    });
    sel.value = current || '';
  }

  function refreshTemplatesPreview(){
    const area = qs('#tpl-preview'); if(!area || !state.templates) return;
    try { area.value = JSON.stringify(state.templates, null, 2); } catch { area.value='(error showing templates)'; }
  }

  function setTemplates(obj){
    if(!obj || !obj.types){ alert('Invalid templates JSON. Must include {"types":{...}}'); return; }
    state.templates = obj;
    persistTemplates();
    populateTypeSelect();
    renderInputsForType();
    renderPreview();
    renderAdsCopyPreview();
    buildLogTypeFilter();
    refreshTemplatesPreview();
    alert('Templates loaded.');
  }

  function setupTemplatesPanel(){
    const fileInput = qs('#tpl-file');
    if (fileInput && !fileInput.__kg_bound) {
      fileInput.addEventListener('change', async (e)=>{
        if(!state.adminAuthed){ const ok = await ensureAdmin(); if(!ok){ e.target.value=''; return; } }
        const f = e.target.files?.[0]; if(!f) return;
        const text = await f.text();
        try { const obj = JSON.parse(text); setTemplates(obj); }
        catch { alert('Bad JSON'); }
        e.target.value = '';
      });
      fileInput.__kg_bound = true;
    }

    const exportBtn = qs('#tpl-export-json');
    if (exportBtn && !exportBtn.__kg_bound) {
      exportBtn.addEventListener('click', async ()=>{
        if(!state.adminAuthed){ const ok = await ensureAdmin(); if(!ok) return; }
        saveFile(`templates_${new Date().toISOString().replace(/[:.]/g,'-')}.json`,
          JSON.stringify(state.templates, null, 2), 'application/json');
      });
      exportBtn.__kg_bound = true;
    }

    const resetBtn = qs('#tpl-reset');
    if (resetBtn && !resetBtn.__kg_bound) {
      resetBtn.addEventListener('click', async ()=>{
        if(!state.adminAuthed){ const ok = await ensureAdmin(); if(!ok) return; }
        if(!SHIPPED_DEFAULTS){ alert('No shipped defaults found.'); return; }
        if(!confirm('Reset templates to shipped defaults?')) return;
        setTemplates(JSON.parse(JSON.stringify(SHIPPED_DEFAULTS)));
      });
      resetBtn.__kg_bound = true;
    }

    const addT2Btn = qs('#tpl-add-type2');
    if (addT2Btn && !addT2Btn.__kg_bound) {
      addT2Btn.addEventListener('click', async ()=>{
        if(!state.adminAuthed){ const ok = await ensureAdmin(); if(!ok) return; }
        if(!SHIPPED_DEFAULTS || !SHIPPED_DEFAULTS.types || !SHIPPED_DEFAULTS.types['Type 2']){
          alert('Type 2 not found in shipped defaults.'); return;
        }
        const next = JSON.parse(JSON.stringify(state.templates || {types:{}}));
        next.types['Type 2'] = SHIPPED_DEFAULTS.types['Type 2'];
        setTemplates(next);
      });
      addT2Btn.__kg_bound = true;
    }
  }

  // ===== Collect variables from inputs =====
  function collectVars(){
    const v = {};
    qsa('input[id^="in-keyword"]').forEach(inp=>{
      const n = inp.id.match(/in-keyword(\d+)/)[1];
      v['keyword'+n] = inp.value.trim();
    });
    const typeName = qs('#in-type').value;
    if (typeHasVariables(typeName)) {
      const vars = state.templates.types[typeName].variables;
      vars.forEach(label => {
        const clean = label.replace(/^\{|\}$/g,'');
        const id = '#in-var-' + slugify(clean).replace(/[^a-z0-9-]/g,'-');
        const el = qs(id);
        v[clean] = (el?.value ?? '').trim();
      });
    }
    return v;
  }

})();
