(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  function showToast(message, type = 'success') {
    const existing = document.getElementById('promptshield-toast');
    if (existing) existing.remove();

    // type 'success' = masked (green), 'warning' = amber, 'error' = red
    const isGreen  = type === 'success';
    const isAmber  = type === 'warning';
    const accent   = isGreen ? '#22c55e' : isAmber ? '#f59e0b' : '#ef4444';
    const bgColor  = isGreen ? 'rgba(20,83,45,0.97)' : 'rgba(15,23,42,0.97)';

    const toast = document.createElement('div');
    toast.id = 'promptshield-toast';

    // Shield icon inline
    const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="${accent}" style="flex-shrink:0;margin-top:1px">
      <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"/>
      <polyline points="9,12 11,14 15,10" stroke="rgba(0,0,0,0.5)" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;

    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px">
        ${iconSVG}
        <span style="line-height:1.4">${message}</span>
      </div>`;

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      background: bgColor,
      border: `1.5px solid ${accent}`,
      borderRadius: '12px',
      padding: '11px 16px',
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      fontWeight: '500',
      boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 12px ${accent}55`,
      maxWidth: '320px',
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease'
    });

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Flash badge green when masking
    if (isGreen && PromptShield.setBadgeMasked) {
      PromptShield.setBadgeMasked();
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => { if (toast.isConnected) toast.remove(); }, 220);
    }, PromptShield.TOAST_DURATION_MS || 3000);
  }

  PromptShield.showToast = showToast;
})(globalThis);
