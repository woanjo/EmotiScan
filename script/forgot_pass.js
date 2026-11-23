// forgot-password.js: connects your 3 forgot-password modals to the Flask API.
// Save as C:\EmotiScan\script\forgot-password.js
// (index.html loads it right after login.js; this file runs first and takes over
//  the Send Code / Resend / Verify / Reset buttons.)

(() => {
  const API = '/api';   // Flask serves the frontend, so this is the same origin
  const $ = (id) => document.getElementById(id);
  const notify = (msg) => alert(msg);   // swap for your own toast if you have one

  let email = '';
  let resetToken = '';
  let timerId = null;
  let resendLocked = false;

  // Run login.js's own modal switching through hidden helper buttons in index.html
  const goVerify = () => $('goVerify').click();
  const goNewPassword = () => $('goNewPassword').click();
  const closeAll = () => $('closeAllModals').click();

  // Click handler that replaces anything login.js attached to the same button
  function onClick(id, handler) {
    const el = $(id);
    if (!el) return console.warn('forgot-password.js: missing #' + id);
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (el.dataset.busy) return;
      el.dataset.busy = '1';
      el.style.opacity = '0.7';
      try { await handler(); }
      catch (err) { notify(err.message || 'Something went wrong.'); }
      finally { delete el.dataset.busy; el.style.opacity = ''; }
    });
  }

  async function post(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  // ---------- 60-second countdown for "Resend Code" ----------
  function startCountdown(seconds = 60) {
    const link = $('resendCode'), label = $('resendTimer');
    clearInterval(timerId);
    let left = seconds;
    resendLocked = true;
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.5';

    const tick = () => {
      label.textContent = `(${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})`;
      if (left <= 0) {
        clearInterval(timerId);
        label.textContent = '';
        resendLocked = false;
        link.style.pointerEvents = '';
        link.style.opacity = '';
        return;
      }
      left--;
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  // ---------- 6 code boxes ----------
  const boxes = () => [...document.querySelectorAll('.code-digit')];
  const getCode = () => boxes().map((b) => b.value).join('');
  const clearBoxes = () => boxes().forEach((b) => (b.value = ''));

  function setupCodeBoxes() {
    const list = boxes();
    list.forEach((box, i) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(0, 1);
        if (box.value && list[i + 1]) list[i + 1].focus();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && list[i - 1]) list[i - 1].focus();
      });
      box.addEventListener('paste', (e) => {
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, list.length);
        if (!digits) return;
        e.preventDefault();
        digits.split('').forEach((d, k) => { list[k].value = d; });
        (list[digits.length] || list[list.length - 1]).focus();
      });
    });
  }

  // ---------- Modal 1: Send Code ----------
  onClick('sendCodeButton', async () => {
    email = $('resetEmail').value.trim().toLowerCase();
    if (!email) throw new Error('Please enter your email address.');
    const data = await post('/forgot-password', { email });
    clearBoxes();
    goVerify();
    boxes()[0]?.focus();
    startCountdown(data.resendIn || 60);
  });

  // ---------- Modal 2: Resend Code ----------
  onClick('resendCode', async () => {
    if (resendLocked) return;
    const data = await post('/resend-code', { email });
    clearBoxes();
    startCountdown(data.resendIn || 60);
    notify('A new code has been sent to your email.');
  });

  // ---------- Modal 2: Verify Code ----------
  onClick('verifyCodeButton', async () => {
    const code = getCode();
    if (code.length !== 6) throw new Error('Please enter the 6-digit code.');
    const data = await post('/verify-code', { email, code });
    resetToken = data.resetToken;
    goNewPassword();
  });

  // ---------- Modal 3: Reset ----------
  onClick('resetPasswordButton', async () => {
    await post('/reset-password', {
      email,
      resetToken,
      newPassword: $('newPassword').value,
      confirmPassword: $('confirmPassword').value,
    });
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    resetToken = '';
    clearInterval(timerId);
    closeAll();
    notify('Password reset successful. You can log in now.');
  });

  setupCodeBoxes();
})();