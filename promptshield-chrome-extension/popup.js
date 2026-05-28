'use strict';

// PHI types from regexPatterns.js
const PHI_TYPES = new Set(['MRN','NPI','INSURANCE_ID','ICD10','MEDICATION','LAB_VALUE','SSN','DOB']);
const FINANCIAL_TYPES = new Set(['CREDIT_CARD','BANK_ACCOUNT','ROUTING_NUMBER','IBAN','SWIFT','EIN']);
const API_TYPES = new Set(['API_KEY','CODE_SECRET','PASSWORD','DB_CONNECTION']);
const PII_TYPES = new Set(['EMAIL','PHONE','NAME','IP_ADDRESS','IPV6','PASSPORT','DRIVERS_LICENSE']);

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function friendlyType(t) {
  const map = {
    API_KEY:'API Key', CODE_SECRET:'Secret', PASSWORD:'Password',
    DB_CONNECTION:'DB Creds', EMAIL:'Email', PHONE:'Phone',
    NAME:'Name', IP_ADDRESS:'IP', IPV6:'IPv6',
    SSN:'SSN', DOB:'DOB', PASSPORT:'Passport', DRIVERS_LICENSE:'DL',
    CREDIT_CARD:'Credit Card', BANK_ACCOUNT:'Bank Acct',
    ROUTING_NUMBER:'Routing', IBAN:'IBAN', SWIFT:'SWIFT', EIN:'EIN',
    MRN:'MRN', NPI:'NPI', INSURANCE_ID:'Insurance',
    ICD10:'Diagnosis', MEDICATION:'Medication', LAB_VALUE:'Lab Value'
  };
  return map[t] || t;
}

document.addEventListener('DOMContentLoaded', () => {
  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const toggle     = document.getElementById('shield-toggle');
  const feedEl     = document.getElementById('feed');
  const footerNote = document.getElementById('footer-note');

  const els = {
    total:     document.getElementById('stat-total'),
    keys:      document.getElementById('stat-keys'),
    phi:       document.getElementById('stat-phi'),
    financial: document.getElementById('stat-financial'),
    pii:       document.getElementById('stat-pii'),
    creds:     document.getElementById('stat-creds'),
  };

  // ── Gateway health ──────────────────────────────────────────
  function checkHealth() {
    fetch('http://localhost:5000/health', { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? 'online' : 'offline')
      .catch(() => 'offline')
      .then(state => {
        const online = state === 'online';
        statusDot.className  = 'status-dot ' + (online ? 'online' : 'offline');
        statusText.textContent = online ? 'SHIELD SECURED' : 'GATEWAY OFFLINE';
        statusText.className = 'status-value ' + (online ? 'online' : '');
        footerNote.textContent = online
          ? 'Local firewall active on port 5000'
          : 'Backend offline — local masking active';
      });
  }

  // ── Load stats from audit log ───────────────────────────────
  function loadStats() {
    chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (logs) => {
      if (!Array.isArray(logs)) logs = [];

      let total = 0, keys = 0, phi = 0, financial = 0, pii = 0, creds = 0;

      logs.forEach(log => {
        if (!log.wasRedacted) return;
        total += log.fieldCount || 0;
        (log.detectedTypes || []).forEach(t => {
          if (API_TYPES.has(t))       keys++;
          else if (PHI_TYPES.has(t))  phi++;
          else if (FINANCIAL_TYPES.has(t)) financial++;
          else if (PII_TYPES.has(t))  pii++;
          if (t === 'PASSWORD' || t === 'DB_CONNECTION') creds++;
        });
      });

      els.total.textContent     = total;
      els.keys.textContent      = keys;
      els.phi.textContent       = phi;
      els.financial.textContent = financial;
      els.pii.textContent       = pii;
      els.creds.textContent     = creds;

      renderFeed(logs.slice(-8).reverse());
    });
  }

  // ── Render recent activity feed ─────────────────────────────
  function renderFeed(logs) {
    const active = logs.filter(l => l.wasRedacted);
    if (!active.length) {
      feedEl.innerHTML = '<div class="feed-empty">No activity yet</div>';
      return;
    }
    feedEl.innerHTML = active.map(log => {
      const tags = (log.detectedTypes || [])
        .slice(0, 4)
        .map(t => `<span class="feed-tag">${friendlyType(t)}</span>`)
        .join('');
      return `
        <div class="feed-item">
          <div class="feed-dot"></div>
          <div class="feed-body">
            <div class="feed-platform">${log.platform || 'unknown'}</div>
            <div class="feed-tags">${tags}</div>
          </div>
          <div class="feed-time">${timeAgo(log.timestamp)}</div>
        </div>`;
    }).join('');
  }

  // ── Toggle ──────────────────────────────────────────────────
  chrome.storage.local.get(['shieldActive'], r => {
    toggle.checked = r.shieldActive !== false;
  });
  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ shieldActive: toggle.checked });
  });

  // ── Reset ───────────────────────────────────────────────────
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Clear all shielding history?')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => loadStats());
  });

  // ── Init ────────────────────────────────────────────────────
  checkHealth();
  loadStats();
  const healthTimer = setInterval(checkHealth, 5000);
  window.addEventListener('unload', () => clearInterval(healthTimer));
});
