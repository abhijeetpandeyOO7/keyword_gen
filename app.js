/* Keyword Generator — app.js (QA-polished: clipboard fallback, safe rendering, robust storage) */
(() => {
  const PASS_HASH   = window.KG_PASS_HASH;
  const ADMIN_HASH  = window.KG_ADMIN_HASH;
  const STORAGE = { templates:'kg_templates_v3', logs:'kg_logs_v3', theme:'kg_theme' };
  const IDLE_LIMIT_MS = 30*60*1000;

  // Force re-login on every refresh
  try { sessionStorage.removeItem('kg_auth'); } catch {}

  // ===== Default Templates (Type 1 with keyword8) =====
  const DEFAULT_TEMPLATES = {
    types: {
      "Type 1": {
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

  // Safer storage helpers
  const lsGet = (k, fallback) => {
    try { const raw = localStorage.getItem(k); return raw==null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  };
  const lsSet = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { console.warn('localStorage write failed for', k); return false; }
  };

  const saveFile = (name, content, type='text/plain') => {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  };

  // Clipboard with fallback for file:// / older WebViews
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

  // ===== Tabs (Logs protected by admin pass) =====
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

  // ===== Idle/theme/gate =====
  const activity=()=>{state.lastActivity=Date.now();};
  ['mousemove','keydown','touchstart','click'].forEach(e=>window.addEventListener(e,activity,{capture:true}));
  setInterval(()=>{ if(state.authed && Date.now()-state.lastActivity>IDLE_LIMIT_MS){ location.reload(); } },10_000);
  const applyTheme = t => document.documentElement.classList.toggle('light', t==='light');
  applyTheme(localStorage.getItem(STORAGE.theme)||'dark');
  qs('#theme-toggle').addEventListener('click',()=>{const next=document.documentElement.classList.contains('light')?'dark':'light';localStorage.setItem(STORAGE.theme,next);applyTheme(next);});
  const gateEl=qs('#gate'), gatePass=qs('#gate-pass'), gateBtn=qs('#gate-enter'), gateErr=qs('#gate-error');
  const sha256Hex = async (text) => {
    const enc=new TextEncoder().encode(text);
    const buf=await crypto.subtle.digest('SHA-256',enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).toPadStart?.(2,'0') ?? b.toString(16).padStart(2,'0')).join('');
  };
  async function tryAuth(){ const hex=await sha256Hex(gatePass.value||''); if(hex===PASS_HASH){ state.authed=true; gateEl.classList.add('hidden'); init(); } else { gateErr.hidden=false; gatePass.select(); } }
  gateBtn.addEventListener('click',tryAuth);
  gatePass.addEventListener('keydown',e=>{if(e.key==='Enter') tryAuth();});
  qs('#lock').addEventListener('click',()=>{ location.reload(); });

  // Admin prompt helpers
  async function ensureAdmin() {
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

  // ===== Storage =====
  // (auto-merge shipped defaults with stored data)
  const loadTemplates=()=>{
    const shipped = (typeof window.KG_DEFAULT_TEMPLATES === 'object'
      && window.KG_DEFAULT_TEMPLATES && window.KG_DEFAULT_TEMPLATES.types)
      ? window.KG_DEFAULT_TEMPLATES
      : DEFAULT_TEMPLATES;

    const stored = lsGet(STORAGE.templates, null);
    let result = (stored && stored.types) ? stored : JSON.parse(JSON.stringify(shipped));

    if (shipped && shipped.types) {
      result.types = result.types || {};
      Object.keys(shipped.types).forEach(t => {
        if (!result.types[t]) {
          result.types[t] = shipped.types[t];
        } else {
          if (!Array.isArray(result.types[t].columns) && Array.isArray(shipped.types[t].columns)) {
            result.types[t].columns = shipped.types[t].columns;
          }
        }
      });
    }

    state.templates = result;
    lsSet(STORAGE.templates, result);
  };
  const persistTemplates=()=>lsSet(STORAGE.templates, state.templates);
  const getLogs = ()=>lsGet(STORAGE.logs, []);
  const setLogs = arr=>lsSet(STORAGE.logs, arr);

  // ===== Init =====
  function init(){
    loadTemplates();
    qs('#session-id').value = state.sessionId;
    populateTypeSelect();
    renderKeywordInputs();
    bindShortcuts();
  }

  // ===== Dynamic keywords =====
  function maxKeywordIndexInType(typeName){
    const type = state.templates.types[typeName];
    if(!type) return 3;
    const scan = JSON.stringify(type);
    const m = [...scan.matchAll(/{{\s*keyword(\d+)(?:\.[a-z]+)?\s*}}/gi)].map(x=>Number(x[1]));
    return m.length ? Math.max(...m) : 3;
  }
  function renderKeywordInputs(){
    const typeName = qs('#in-type').value;
    const maxN = maxKeywordIndexInType(typeName);
    const box = qs('#kw-box'); box.innerHTML = '';
    for(let i=1;i<=maxN;i++){
      const wrap = document.createElement('div');
      wrap.innerHTML = `<label>keyword${i} ${i===1?'(required)':''}</label><input type="text" id="in-keyword${i}" placeholder="">`;
      box.appendChild(wrap);
    }
    qsa('input[id^="in-keyword"]').forEach(inp=>{
      inp.addEventListener('input', ()=>{ renderPreview(); scheduleAutoLog(); });
      inp.addEventListener('change', ()=>{ renderPreview(); scheduleAutoLog(true); });
    });
  }
  function populateTypeSelect(){
    const sel=qs('#in-type');
    qsa('option', sel).forEach((o,i)=>{ if(i>0) o.remove(); }); // keep Type 1
    Object.keys(state.templates.types).forEach(t=>{
      if (t !== 'Type 1'){ const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); }
    });
    sel.addEventListener('change', ()=>{ renderKeywordInputs(); renderPreview(); autoLogEvent(); });
  }

  // ===== Template engine =====
  function evaluateTemplate(tpl, vars){
    if(!tpl) return '';
    return tpl.replace(/{{\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*}}/g, (_m, expr) => {
      const parts = expr.split('.'); const key = parts.shift();
      let val = ({...vars, today:todayYMD(), ts:timestamp()})[key];
      if(val==null) val='';
      parts.forEach(mod=>{
        if(mod==='lower') val=String(val).toLowerCase();
        else if(mod==='upper') val=String(val).toUpperCase();
        else if(mod==='cap')   val=titleCase(String(val));
        else if(mod==='slug')  val=slugify(String(val));
      });
      return String(val);
    });
  }
  function collectVars(){
    const v = {};
    qsa('input[id^="in-keyword"]').forEach(inp=>{
      const n = inp.id.match(/in-keyword(\d+)/)[1];
      v['keyword'+n] = inp.value.trim();
    });
    return v;
  }

  /* =========================
     STRICT row filtering logic
     ========================= */
  function extractKeywordIndexes(str=''){
    const set = new Set();
    const re = /{{\s*keyword(\d+)(?:\.[a-z]+)?\s*}}/gi;
    let m; while((m = re.exec(str))){ set.add(Number(m[1])); }
    return set;
  }
  function requiredKeywordsForRow(row){
    const s1 = extractKeywordIndexes(row.campaign || '');
    const s2 = extractKeywordIndexes(row.adset || '');
    const s3 = extractKeywordIndexes(row.keywords || '');
    return new Set([...s1, ...s2, ...s3]);
  }
  function rowHasAllKeywords(row, vars){
    const req = requiredKeywordsForRow(row);
    for (const idx of req){
      const v = vars['keyword'+idx];
      if (!v || !String(v).trim()) return false; // any missing -> remove row
    }
    return true;
  }
  function filterRowsByKeywords(rows, vars){
    return rows.filter(r => rowHasAllKeywords(r, vars));
  }

  // ===== Preview (safe DOM build + copy) =====
  function renderPreview(){
    const tbody = qs('#preview-table tbody'); if(!tbody) return;
    tbody.innerHTML='';
    const typeName = qs('#in-type').value;
    const def = state.templates.types[typeName];
    const rows = def.rows || [];
    const vars = collectVars();

    const visibleRows = filterRowsByKeywords(rows, vars);

    visibleRows.forEach(r=>{
      const tr = document.createElement('tr');

      const td1 = document.createElement('td');
      td1.className = 'copyable';
      const c = evaluateTemplate(r.campaign, vars);
      td1.dataset.copy = c;
      const code1 = document.createElement('code');
      code1.textContent = c;
      td1.appendChild(code1);

      const td2 = document.createElement('td');
      td2.className = 'copyable';
      const a = evaluateTemplate(r.adset, vars);
      td2.dataset.copy = a;
      const code2 = document.createElement('code');
      code2.textContent = a;
      td2.appendChild(code2);

      const td3 = document.createElement('td');
      td3.className = 'copyable';
      const k = evaluateTemplate(r.keywords, vars);
      td3.dataset.copy = k;
      td3.textContent = k;

      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }
  document.addEventListener('click', async (e)=>{
    const td = e.target.closest('td.copyable'); if(!td) return;
    const text = td.dataset.copy ?? td.textContent.trim();
    const ok = await copyText(text);
    td.classList.add('copied'); setTimeout(()=>td.classList.remove('copied'), 900);
    autoLogEvent();
    if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
  }, {capture:true});

  // ===== Buttons / export =====
  const fileName=(base,ext)=>`${base}_${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
  qs('#btn-copy-all').addEventListener('click',async ()=> {
    const typeName = qs('#in-type').value;
    const vars=collectVars();
    const rows = state.templates.types[typeName].rows || [];
    const visibleRows = filterRowsByKeywords(rows, vars);
    const lines = visibleRows.map(r => evaluateTemplate(r.keywords, vars));
    const ok = await copyText(lines.join('\n'));
    autoLogEvent();
    if(!ok) alert('Copied (fallback). If this fails, try HTTPS or a different browser.');
  });
  qs('#btn-export-json').addEventListener('click',()=>{
    const out = collectExportRows();
    saveFile(fileName('outputs','json'), JSON.stringify(out, null, 2), 'application/json');
    autoLogEvent();
  });
  qs('#btn-export-csv').addEventListener('click',()=>{
    const out = collectExportRows();
    const header = Object.keys(out[0]||{campaign:'',adset:'',keywords:''});
    const lines = [header.map(escapeCsv).join(',')];
    out.forEach(r=>lines.push(header.map(h=>escapeCsv(r[h])).join(',')));
    saveFile(fileName('outputs','csv'), lines.join('\n'), 'text/csv');
    autoLogEvent();
  });
  function collectExportRows(){
    const typeName = qs('#in-type').value;
    const vars=collectVars();
    const rows = state.templates.types[typeName].rows || [];
    const visibleRows = filterRowsByKeywords(rows, vars);
    return visibleRows.map(r=>({
      campaign: evaluateTemplate(r.campaign, vars),
      adset:    evaluateTemplate(r.adset, vars),
      keywords: evaluateTemplate(r.keywords, vars)
    }));
  }

  // ===== Logs (admin-guarded actions) =====
  qs('#btn-save-log').addEventListener('click',()=>{ saveLog('manual'); alert('Saved to logs.'); });
  qs('#toggle-autolog').addEventListener('change', e => state.autoLog = e.target.checked);
  qs('#log-search').addEventListener('input', renderLogs);
  qs('#log-type-filter').addEventListener('change', renderLogs);

  qs('#btn-export-logs-csv').addEventListener('click', () => {
    if(!state.adminAuthed){ alert('Admin auth required.'); return; }
    const logs = getLogs();
    const header = ['at','sessionId','type','nRows'];
    const lines = [header.join(',')];
    logs.forEach(e => lines.push([fmtDate(e.at), e.sessionId, e.type, e.outputs.length].map(escapeCsv).join(',')));
    saveFile(fileName('logs','csv'), lines.join('\n'), 'text/csv');
  });
  qs('#btn-export-logs-json').addEventListener('click', () => {
    if(!state.adminAuthed){ alert('Admin auth required.'); return; }
    saveFile(fileName('logs','json'), JSON.stringify(getLogs(), null, 2), 'application/json');
  });
  qs('#btn-delete-logs').addEventListener('click', async () => {
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
      inputs: collectVars(), outputs: collectExportRows(), reason
    };
    const logs=getLogs(); logs.unshift(entry); setLogs(logs); if (qs('#tab-logs').classList.contains('active')) renderLogs();
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
      if(e.ctrlKey && e.key.toLowerCase()==='s'){ e.preventDefault(); saveLog('manual'); }
      if(e.ctrlKey && e.key.toLowerCase()==='e'){ e.preventDefault(); qs('#btn-export-csv').click(); }
    });
  }

  /* =======================================================================
     ADD-ON: Templates support (external templates.js + Templates panel)
     ======================================================================= */

  const SHIPPED_DEFAULTS = (typeof window.KG_DEFAULT_TEMPLATES === 'object'
    && window.KG_DEFAULT_TEMPLATES && window.KG_DEFAULT_TEMPLATES.types)
    ? window.KG_DEFAULT_TEMPLATES
    : null;

  const __init_orig = init;
  init = function(){
    __init_orig();

    if (!localStorage.getItem(STORAGE.templates) && SHIPPED_DEFAULTS) {
      try {
        state.templates = JSON.parse(JSON.stringify(SHIPPED_DEFAULTS));
        localStorage.setItem(STORAGE.templates, JSON.stringify(state.templates));
        populateTypeSelect();
        renderKeywordInputs();
      } catch {}
    }

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
      const opt = document.createElement('option'); opt.value=t; opt.textContent=t; sel.appendChild(opt);
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
    renderKeywordInputs();
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
        if(!SHIPPED_DEFAULTS || !SHIPPED_DEFAULTS.types || !SHIPPED_DEFAULT_TEMPLATES.types['Type 2']){
          alert('Type 2 not found in shipped defaults.'); return;
        }
        const next = JSON.parse(JSON.stringify(state.templates || {types:{}}));
        next.types['Type 2'] = SHIPPED_DEFAULTS.types['Type 2'];
        setTemplates(next);
      });
      addT2Btn.__kg_bound = true;
    }
  }

})();
