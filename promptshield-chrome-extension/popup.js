'use strict';

// ── Type classification ──────────────────────────────────────
const PHI_TYPES  = new Set(['MRN','NPI','INSURANCE_ID','ICD10','MEDICATION','LAB_VALUE','SSN','DOB']);
const FIN_TYPES  = new Set(['CREDIT_CARD','BANK_ACCOUNT','ROUTING_NUMBER','IBAN','SWIFT','EIN']);
const API_TYPES  = new Set(['API_KEY','CODE_SECRET']);
const CRED_TYPES = new Set(['PASSWORD','DB_CONNECTION']);
const PII_TYPES  = new Set(['EMAIL','PHONE','NAME','IP_ADDRESS','IPV6','PASSPORT','DRIVERS_LICENSE']);

const TYPE_LABEL = {
  API_KEY:'API Key', CODE_SECRET:'Secret', PASSWORD:'Password', DB_CONNECTION:'DB Creds',
  EMAIL:'Email', PHONE:'Phone', NAME:'Name', IP_ADDRESS:'IP', IPV6:'IPv6',
  SSN:'SSN', DOB:'DOB', PASSPORT:'Passport', DRIVERS_LICENSE:'DL',
  CREDIT_CARD:'Credit Card', BANK_ACCOUNT:'Bank Acct', ROUTING_NUMBER:'Routing',
  IBAN:'IBAN', SWIFT:'SWIFT', EIN:'EIN', MRN:'MRN', NPI:'NPI',
  INSURANCE_ID:'Insurance', ICD10:'Diagnosis', MEDICATION:'Medication', LAB_VALUE:'Lab Value'
};

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)    return Math.floor(d/1000)+'s ago';
  if (d < 3600000)  return Math.floor(d/60000)+'m ago';
  if (d < 86400000) return Math.floor(d/3600000)+'h ago';
  return Math.floor(d/86400000)+'d ago';
}

function typeLabel(t) { return TYPE_LABEL[t] || t; }

function severity(types) {
  if (!types || !types.length) return 'low';
  if (types.some(t => PHI_TYPES.has(t) || API_TYPES.has(t) || t==='SSN')) return 'high';
  if (types.some(t => FIN_TYPES.has(t) || CRED_TYPES.has(t))) return 'medium';
  return 'low';
}

function bucket(t) {
  if (API_TYPES.has(t))  return 'api';
  if (PHI_TYPES.has(t))  return 'phi';
  if (FIN_TYPES.has(t))  return 'fin';
  if (CRED_TYPES.has(t)) return 'cred';
  if (PII_TYPES.has(t))  return 'pii';
  return 'default';
}

function tagClass(t) {
  const b = bucket(t);
  return { api:'tag-api', phi:'tag-phi', fin:'tag-fin', cred:'tag-cred', pii:'tag-pii' }[b] || 'tag-default';
}

function platformMeta(p) {
  const map = {
    gemini:  { label:'Gemini',  bg:'#1a1f35', color:'#60a5fa', emoji:'✦' },
    chatgpt: { label:'ChatGPT', bg:'#0d2818', color:'#22c55e', emoji:'⬡' },
    claude:  { label:'Claude',  bg:'#2a1a0d', color:'#f59e0b', emoji:'A' },
  };
  return map[p] || { label: p||'Unknown', bg:'#1a1a2e', color:'#6b7280', emoji:'?' };
}

function sendMsg(payload) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(payload, r => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(r);
      });
    } catch(e) { resolve(null); }
  });
}

function esc(s) { return String(s).replace(/[<>&"]/g,''); }

// ── Navigation ───────────────────────────────────────────────
let currentScreen = 'dashboard';
let allLogs = [];
let selectedLog = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) { el.classList.add('active'); currentScreen = id; }
}

// ── Platform icon HTML ───────────────────────────────────────
function platformIconHTML(platform, size = 36) {
  const m = platformMeta(platform);
  return `<div class="platform-icon" style="width:${size}px;height:${size}px;background:${m.bg};color:${m.color};font-size:${size*0.45}px">${m.emoji}</div>`;
}

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard(logs) {
  const redacted = logs.filter(l => l.wasRedacted);
  const total = redacted.reduce((s,l) => s + (l.fieldCount||0), 0);

  document.getElementById('total-count').textContent = total.toLocaleString();
  document.getElementById('last-checked').textContent = redacted.length
    ? timeAgo(redacted[redacted.length-1].timestamp) : 'Never';

  // Group by platform for recent activity
  const byPlatform = {};
  redacted.slice(-20).reverse().forEach(l => {
    const p = l.platform || 'unknown';
    if (!byPlatform[p]) byPlatform[p] = { count:0, types:new Set(), latest:l.timestamp };
    byPlatform[p].count += l.fieldCount||0;
    (l.detectedTypes||[]).forEach(t => byPlatform[p].types.add(t));
    if (l.timestamp > byPlatform[p].latest) byPlatform[p].latest = l.timestamp;
  });

  const feed = document.getElementById('dash-feed');
  const entries = Object.entries(byPlatform).slice(0,3);
  if (!entries.length) {
    feed.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:20px">No activity yet</div>';
    return;
  }
  feed.innerHTML = entries.map(([p, data]) => {
    const m = platformMeta(p);
    const sev = severity([...data.types]);
    const dotColor = sev==='high'?'red':sev==='medium'?'amber':'green';
    return `<div class="dash-item" data-nav="activity">
      ${platformIconHTML(p)}
      <div class="dash-item-body">
        <div class="dash-item-name">${esc(m.label)}</div>
        <div class="dash-item-sub"><span class="dot ${dotColor} small"></span>${data.count} item${data.count!==1?'s':''} redacted</div>
      </div>
      <div class="dash-item-time">${timeAgo(data.latest)}</div>
      <svg class="dash-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`;
  }).join('');
}

// ── ACTIVITY ─────────────────────────────────────────────────
let activityFilter = 'all';

function renderActivity(logs, filter) {
  const redacted = logs.filter(l => l.wasRedacted).reverse();
  const counts = { all:redacted.length, high:0, medium:0, low:0 };
  redacted.forEach(l => { counts[severity(l.detectedTypes||[])]++; });

  document.getElementById('tab-all').textContent    = counts.all;
  document.getElementById('tab-high').textContent   = counts.high;
  document.getElementById('tab-medium').textContent = counts.medium;
  document.getElementById('tab-low').textContent    = counts.low;

  const filtered = filter==='all' ? redacted : redacted.filter(l => severity(l.detectedTypes||[])===filter);
  const list = document.getElementById('activity-list');

  if (!filtered.length) {
    list.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:30px">No events</div>';
    return;
  }

  list.innerHTML = filtered.map((log, i) => {
    const sev = severity(log.detectedTypes||[]);
    const dotColor = sev==='high'?'red':sev==='medium'?'amber':'green';
    const tags = (log.detectedTypes||[]).slice(0,4).map(t =>
      `<span class="activity-tag ${tagClass(t)}">${esc(typeLabel(t))}</span>`).join('');
    const m = platformMeta(log.platform);
    return `<div class="activity-item" data-log-idx="${i}">
      <div class="side-dot" style="background:var(--${dotColor})"></div>
      <div class="activity-item-top">
        ${platformIconHTML(log.platform, 36)}
        <div class="activity-item-info">
          <div class="activity-item-name">${esc(m.label)} <span class="severity-badge sev-${sev}">${sev.charAt(0).toUpperCase()+sev.slice(1)}</span></div>
          <div class="activity-item-desc">Detected ${log.fieldCount||0} sensitive item${(log.fieldCount||0)!==1?'s':''}</div>
        </div>
        <div>
          <div class="activity-item-time"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg> ${timeAgo(log.timestamp)}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
      </div>
      <div class="activity-tags">${tags}</div>
    </div>`;
  }).join('');

  // Click to detail
  list.querySelectorAll('.activity-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      selectedLog = filtered[i];
      renderDetail(selectedLog);
      showScreen('detail');
    });
  });
}

// ── DETAIL ───────────────────────────────────────────────────
function typeRisk(t) {
  if (PHI_TYPES.has(t) || API_TYPES.has(t) || t==='SSN') return 'High Risk';
  if (FIN_TYPES.has(t) || CRED_TYPES.has(t)) return 'Medium Risk';
  return 'Low Risk';
}
function typeRiskClass(t) {
  const r = typeRisk(t);
  return r==='High Risk'?'risk-high':'risk-medium';
}
function typeIcon(t) {
  if (API_TYPES.has(t))  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  if (t==='EMAIL')       return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
  if (t==='SSN')         return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
  if (PHI_TYPES.has(t))  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  if (FIN_TYPES.has(t))  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
}

function renderDetail(log) {
  const m = platformMeta(log.platform);
  const sev = severity(log.detectedTypes||[]);
  const types = log.detectedTypes || [];
  const ts = new Date(log.timestamp);
  const reqId = 'req_' + log.id.toString(16).padStart(8,'0');

  const rows = types.map(t => `
    <div class="detected-row">
      <div class="detected-row-icon">${typeIcon(t)}</div>
      <div class="detected-row-name">${esc(typeLabel(t))}</div>
      <span class="detected-row-risk ${typeRiskClass(t)}">${typeRisk(t)}</span>
      <div class="detected-row-status"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Redacted</div>
    </div>`).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      <div class="detail-platform">
        ${platformIconHTML(log.platform, 44)}
        <div>
          <div style="font-size:15px;font-weight:700">${esc(m.label)}</div>
          <div class="detail-meta">${timeAgo(log.timestamp)} <span class="dot" style="width:3px;height:3px;background:#6b7280"></span> <span class="severity-badge sev-${sev}">${sev.charAt(0).toUpperCase()+sev.slice(1)}</span></div>
        </div>
      </div>
      <button class="link-btn" style="font-size:11px">View in activity <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg></button>
    </div>

    <div class="detected-card">
      <div class="detected-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Detected</div>
      <div class="detected-sub">${types.length} sensitive item${types.length!==1?'s':''} found in your prompt</div>
      ${rows}
      <div class="detected-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"/></svg> These items were masked to prevent data leakage.</div>
    </div>

    <div class="action-card">
      <div class="action-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg> Action Taken</div>
      <div class="action-sub">Successfully redacted</div>
      <div class="action-desc">Sensitive data was masked before the response was sent.</div>
    </div>

    <div class="details-card">
      <div class="details-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Details</div>
      <div class="details-row">
        <div class="details-row-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="details-row-label">Date &amp; Time</div>
        <div class="details-row-value plain">${ts.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} at ${ts.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="details-row">
        <div class="details-row-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
        <div class="details-row-label">Source</div>
        <div class="details-row-value">${esc(m.label.toLowerCase().replace(' ',''))}.com</div>
      </div>
      <div class="details-row">
        <div class="details-row-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg></div>
        <div class="details-row-label">Request ID</div>
        <div class="details-row-value plain" style="font-family:monospace;font-size:10px">${reqId}</div>
      </div>
      <div class="details-row">
        <div class="details-row-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <div class="details-row-label">Device</div>
        <div class="details-row-value plain">This Device (Local)</div>
      </div>
    </div>

    <div class="add-note-card">
      <div class="add-note-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
        <div><div class="add-note-title">Add Note</div><div class="add-note-sub">Add a note to remember more about this event.</div></div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
    </div>

    <div class="detail-actions">
      <button class="detail-action-btn danger" id="btn-clear-event"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/></svg> Clear this event</button>
      <button class="detail-action-btn plain" id="btn-copy-detail"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy details</button>
    </div>`;

  document.getElementById('btn-copy-detail').addEventListener('click', () => {
    const text = `Platform: ${m.label}\nTime: ${ts.toLocaleString()}\nItems: ${types.map(typeLabel).join(', ')}\nRequest: ${reqId}`;
    navigator.clipboard.writeText(text).catch(()=>{});
  });
}

// ── ANALYTICS ────────────────────────────────────────────────
function renderAnalytics(logs) {
  const redacted = logs.filter(l => l.wasRedacted);
  const total = redacted.reduce((s,l) => s+(l.fieldCount||0), 0);

  document.getElementById('a-total').textContent = total.toLocaleString();

  // Bar chart — last 7 days
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date().getDay(); // 0=Sun
  const dayMap = {};
  redacted.forEach(l => {
    const d = new Date(l.timestamp).getDay();
    dayMap[d] = (dayMap[d]||0) + (l.fieldCount||0);
  });
  const maxVal = Math.max(1, ...Object.values(dayMap));
  const chart = document.getElementById('bar-chart');
  chart.innerHTML = days.map((label, i) => {
    const dayIdx = (i+1) % 7; // Mon=1..Sun=0
    const val = dayMap[dayIdx] || 0;
    const h = Math.max(4, Math.round((val/maxVal)*48));
    const isToday = dayIdx === today;
    return `<div class="bar-wrap"><div class="bar${isToday?' today':''}" style="height:${h}px"></div><div class="bar-label">${label}</div></div>`;
  }).join('');

  // Category counts
  let pii=0, api=0, phi=0, fin=0, cred=0;
  redacted.forEach(l => {
    (l.detectedTypes||[]).forEach(t => {
      if (CRED_TYPES.has(t)) cred++;
      else if (API_TYPES.has(t)) api++;
      else if (PHI_TYPES.has(t)) phi++;
      else if (FIN_TYPES.has(t)) fin++;
      else if (PII_TYPES.has(t)) pii++;
    });
  });
  const catTotal = pii+api+phi+fin+cred || 1;
  const cats = [
    { name:'PII',         count:pii,  color:'#a78bfa', icon:'👤' },
    { name:'API Keys',    count:api,  color:'#60a5fa', icon:'🔑' },
    { name:'PHI / Health',count:phi,  color:'#ef4444', icon:'❤️' },
    { name:'Financial',   count:fin,  color:'#22c55e', icon:'💲' },
    { name:'Credentials', count:cred, color:'#f59e0b', icon:'🔒' },
  ];
  document.getElementById('category-rows').innerHTML = cats.map(c => {
    const pct = ((c.count/catTotal)*100).toFixed(1);
    const w   = Math.round((c.count/catTotal)*100);
    return `<div class="cat-row">
      <div class="cat-icon" style="background:${c.color}22;color:${c.color};font-size:14px">${c.icon}</div>
      <div class="cat-name">${c.name}</div>
      <div class="cat-count">${c.count}</div>
      <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${w}%;background:${c.color}"></div></div>
      <div class="cat-pct">${pct}%</div>
      <svg class="cat-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`;
  }).join('');

  // Trends
  const now = Date.now();
  const thisWeek = redacted.filter(l => now - new Date(l.timestamp) < 7*86400000).reduce((s,l)=>s+(l.fieldCount||0),0);
  const lastWeek = redacted.filter(l => { const a = now - new Date(l.timestamp); return a>=7*86400000 && a<14*86400000; }).reduce((s,l)=>s+(l.fieldCount||0),0);
  const change = lastWeek ? Math.round(((thisWeek-lastWeek)/lastWeek)*100) : 0;

  document.getElementById('trends-grid').innerHTML = `
    <div class="trend-card">
      <div class="trend-icon" style="background:rgba(34,197,94,0.1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"/></svg></div>
      <div class="trend-num">${lastWeek}</div>
      <div class="trend-label">Last Week</div>
    </div>
    <div class="trend-card active">
      <div class="trend-icon" style="background:rgba(96,165,250,0.1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"/></svg></div>
      <div class="trend-num">${thisWeek}</div>
      <div class="trend-label">This Week</div>
    </div>
    <div class="trend-card">
      <div class="trend-icon" style="background:rgba(167,139,250,0.1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
      <div class="trend-num" style="color:${change>=0?'#ef4444':'#22c55e'}">${change>=0?'+':''}${change}%</div>
      <div class="trend-label">Change</div>
    </div>`;
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  function loadAll() {
    sendMsg({ type: 'GET_LOGS' }).then(logs => {
      allLogs = Array.isArray(logs) ? logs : [];
      renderDashboard(allLogs);
      renderActivity(allLogs, activityFilter);
      renderAnalytics(allLogs);
    });
  }

  // Navigation — delegate all [data-nav] clicks
  document.addEventListener('click', e => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      const target = navEl.dataset.nav;
      showScreen(target);
      if (target === 'activity') renderActivity(allLogs, activityFilter);
      if (target === 'analytics') renderAnalytics(allLogs);
    }
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activityFilter = btn.dataset.filter;
      renderActivity(allLogs, activityFilter);
    });
  });

  // Period tabs (analytics)
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Clear analytics
  document.getElementById('btn-clear-analytics').addEventListener('click', () => {
    if (!confirm('Clear all statistics?')) return;
    sendMsg({ type: 'CLEAR_LOGS' }).then(() => loadAll());
  });

  loadAll();
});
