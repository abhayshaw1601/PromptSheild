(function (root) {
  const PromptShield = root.PromptShield || (root.PromptShield = {});

  function showToast(message, type = 'success') {
    const existingToast = document.getElementById('promptshield-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'promptshield-toast';
    toast.textContent = message;

    const borderColor = type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      zIndex: '999999',
      background: '#0f172a',
      border: `1px solid ${borderColor}`,
      borderRadius: '10px',
      padding: '12px 18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontSize: '13px',
      boxShadow: '0 4px 20px rgba(59,130,246,0.3)'
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.isConnected) {
        toast.remove();
      }
    }, PromptShield.TOAST_DURATION_MS);
  }

  PromptShield.showToast = showToast;
})(globalThis);
