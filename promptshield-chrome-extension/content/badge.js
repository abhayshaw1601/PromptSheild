(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});
  const BADGE_ID = 'promptshield-page-badge';

  // SVG shield with checkmark — matches the image
  function shieldSVG(color) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}">
        <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"/>
        <polyline points="9,12 11,14 15,10" stroke="#0f172a" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
  }

  function showPageBadge() {
    if (document.getElementById(BADGE_ID) || !document.body) return;

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.title = 'PromptShield active';
    badge.setAttribute('aria-label', 'PromptShield active');

    // Outer ring + inner circle — matches the photo
    Object.assign(badge.style, {
      position: 'fixed',
      left: '18px',
      bottom: '68px',
      zIndex: '999998',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      background: 'rgba(15,23,42,0.92)',
      border: '2px solid #f59e0b',          // gold ring
      boxShadow: '0 0 18px rgba(245,158,11,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'default',
      userSelect: 'none',
      backdropFilter: 'blur(6px)',
      transition: 'border-color 0.4s ease, box-shadow 0.4s ease'
    });

    const iconWrap = document.createElement('div');
    iconWrap.id = 'promptshield-badge-icon';
    iconWrap.innerHTML = shieldSVG('#f59e0b');  // gold by default
    Object.assign(iconWrap.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.3s ease'
    });

    badge.appendChild(iconWrap);
    document.body.appendChild(badge);
  }

  // Call this after masking to flash the badge green
  function setBadgeMasked() {
    const badge = document.getElementById(BADGE_ID);
    const iconWrap = document.getElementById('promptshield-badge-icon');
    if (!badge || !iconWrap) return;

    badge.style.borderColor = '#22c55e';
    badge.style.boxShadow = '0 0 22px rgba(34,197,94,0.6)';
    iconWrap.innerHTML = shieldSVG('#22c55e');
    iconWrap.style.transform = 'scale(1.15)';

    // Reset back to gold after 2.5s
    setTimeout(() => {
      badge.style.borderColor = '#f59e0b';
      badge.style.boxShadow = '0 0 18px rgba(245,158,11,0.45)';
      iconWrap.innerHTML = shieldSVG('#f59e0b');
      iconWrap.style.transform = 'scale(1)';
    }, 2500);
  }

  PromptShield.showPageBadge = showPageBadge;
  PromptShield.setBadgeMasked = setBadgeMasked;
})(globalThis);
