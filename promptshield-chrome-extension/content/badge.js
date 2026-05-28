(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  const BADGE_ID = 'promptshield-page-badge';

  function createStatusDot() {
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      borderRadius: '999px',
      background: '#22c55e',
      boxShadow: '0 0 10px rgba(34,197,94,0.85)',
      flex: '0 0 auto'
    });
    return dot;
  }

  function showPageBadge() {
    if (document.getElementById(BADGE_ID) || !document.body) return;

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.title = 'PromptShield is protecting this page';
    badge.setAttribute('aria-label', 'PromptShield is protecting this page');

    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icons/icon48.png');
    icon.alt = '';
    Object.assign(icon.style, {
      width: '24px',
      height: '24px',
      display: 'block'
    });

    const label = document.createElement('span');
    label.textContent = 'PromptShield';
    Object.assign(label.style, {
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '13px',
      fontWeight: '700',
      lineHeight: '1',
      whiteSpace: 'nowrap'
    });

    Object.assign(badge.style, {
      position: 'fixed',
      left: '14px',
      bottom: '72px',
      zIndex: '999998',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      borderRadius: '999px',
      background: 'rgba(15,23,42,0.94)',
      border: '1px solid rgba(59,130,246,0.85)',
      boxShadow: '0 8px 24px rgba(15,23,42,0.35), 0 0 18px rgba(59,130,246,0.25)',
      backdropFilter: 'blur(8px)',
      pointerEvents: 'none',
      userSelect: 'none'
    });

    badge.appendChild(icon);
    badge.appendChild(label);
    badge.appendChild(createStatusDot());
    document.body.appendChild(badge);
  }

  PromptShield.showPageBadge = showPageBadge;
})(globalThis);
