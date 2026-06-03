import { supabase } from './supabase.js';

let _onAuthSuccess = null;

export function initAuth(onSuccess) {
  _onAuthSuccess = onSuccess;
  renderModal();
  attachListeners();
}

export function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'flex';
}

export function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
}

function renderModal() {
  const el = document.createElement('div');
  el.id = 'authModal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Sign in or create account');
  el.innerHTML = `
    <div class="auth-backdrop"></div>
    <div class="auth-card">
      <div class="auth-logo">
        <span class="auth-logo__maks">MAKS</span><span class="auth-logo__bg">BG</span>
      </div>
      <h2 class="auth-title" id="authTitle">Welcome back</h2>
      <p class="auth-sub" id="authSub">Sign in to track your background removals</p>

      <form id="authForm" novalidate autocomplete="on">
        <div class="auth-field" id="nameField" style="display:none">
          <label for="authName">Full name</label>
          <input id="authName" type="text" placeholder="Your name" autocomplete="name">
        </div>
        <div class="auth-field">
          <label for="authEmail">Email address</label>
          <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email" required>
        </div>
        <div class="auth-field">
          <label for="authPassword">Password</label>
          <input id="authPassword" type="password" placeholder="••••••••" autocomplete="current-password" required minlength="6">
        </div>
        <div class="auth-msg hidden" id="authError" role="alert"></div>
        <button type="submit" class="auth-submit" id="authSubmit">Sign In</button>
      </form>

      <div class="auth-divider"><span>or</span></div>
      <p class="auth-toggle-text" id="authToggleText">
        Don't have an account?
        <button type="button" class="auth-toggle" id="authToggle">Create one</button>
      </p>
    </div>
  `;
  document.body.appendChild(el);
}

function attachListeners() {
  let mode = 'signin';

  const form       = document.getElementById('authForm');
  const nameField  = document.getElementById('nameField');
  const authTitle  = document.getElementById('authTitle');
  const authSub    = document.getElementById('authSub');
  const authSubmit = document.getElementById('authSubmit');
  const authToggle = document.getElementById('authToggle');
  const toggleText = document.getElementById('authToggleText');
  const msgBox     = document.getElementById('authError');
  const pwInput    = document.getElementById('authPassword');
  const backdrop   = document.querySelector('.auth-backdrop');

  function setMode(newMode) {
    mode = newMode;
    clearMsg();

    if (mode === 'signup') {
      authTitle.textContent = 'Create account';
      authSub.textContent   = 'Start removing backgrounds for free';
      authSubmit.textContent = 'Create Account';
      authToggle.textContent = 'Sign in instead';
      toggleText.firstChild.textContent = 'Already have an account? ';
      nameField.style.display = '';
      pwInput.setAttribute('autocomplete', 'new-password');
      pwInput.setAttribute('minlength', '6');
    } else {
      authTitle.textContent = 'Welcome back';
      authSub.textContent   = 'Sign in to track your background removals';
      authSubmit.textContent = 'Sign In';
      authToggle.textContent = 'Create one';
      toggleText.firstChild.textContent = "Don't have an account? ";
      nameField.style.display = 'none';
      pwInput.setAttribute('autocomplete', 'current-password');
    }
  }

  function showMsg(text, isError = true) {
    msgBox.textContent = text;
    msgBox.style.cssText = isError
      ? 'background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.35);color:#fca5a5'
      : 'background:rgba(52,211,153,0.12);border-color:rgba(52,211,153,0.4);color:#6ee7b7';
    msgBox.classList.remove('hidden');
  }

  function clearMsg() {
    msgBox.classList.add('hidden');
    msgBox.textContent = '';
    msgBox.style.cssText = '';
  }

  authToggle.addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg();
    authSubmit.disabled = true;
    authSubmit.textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';

    const email    = document.getElementById('authEmail').value.trim();
    const password = pwInput.value;
    const name     = document.getElementById('authName').value.trim();

    if (!email || !password) {
      showMsg('Please enter your email and password.');
      authSubmit.disabled = false;
      authSubmit.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
      return;
    }

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        });

        if (error) throw error;

        if (!data.session) {
          // Email confirmation required (mailer_autoconfirm is off in this project)
          showMsg('✅ Account created! Check your email for a confirmation link, then sign in.', false);
          setMode('signin');
        } else {
          hideAuthModal();
          _onAuthSuccess?.(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          // Surface the real Supabase error clearly
          if (error.message.toLowerCase().includes('invalid login') ||
              error.message.toLowerCase().includes('invalid credentials')) {
            throw new Error('Incorrect email or password. Please try again.');
          }
          if (error.message.toLowerCase().includes('email not confirmed')) {
            throw new Error('Please confirm your email address first — check your inbox.');
          }
          throw error;
        }

        hideAuthModal();
        _onAuthSuccess?.(data.user);
      }
    } catch (err) {
      showMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
    }
  });

  // Only close backdrop if already signed in
  backdrop?.addEventListener('click', async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) hideAuthModal();
  });
}
