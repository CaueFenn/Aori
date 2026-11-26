// The server cookie identifies the customer. No credential or favorite list is stored here.
let user = null;
let favorites = new Set();
let generation = 0;
let revision = 0;
let loadError = null;
let refreshRequest;
let refreshAgain = false;
let favoriteQueue = Promise.resolve();
const listeners = new Set();
const pending = new Map();
const signalKey = 'aori:account:changed';
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('aori-account') : null;
const notify = () => listeners.forEach(listener => listener());

async function request(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error('Não foi possível acessar sua conta. Confira a conexão e tente novamente.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Não foi possível acessar sua conta. Tente novamente.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Não foi possível concluir. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function apply(data) {
  const next = data.user || null;
  if (next?.id !== user?.id) generation += 1;
  user = next;
  favorites = new Set(user && Array.isArray(data.favorites) ? data.favorites : []);
  revision += 1;
  loadError = null;
  notify();
}

function broadcast() {
  channel?.postMessage('refresh');
  try { localStorage.setItem(signalKey, `${Date.now()}-${Math.random()}`); } catch { /* Focus refresh remains available. */ }
}

async function refresh() {
  if (refreshRequest) { refreshAgain = true; return refreshRequest; }
  const version = generation;
  const snapshot = revision;
  refreshRequest = request('/api/me').then(data => {
    if (version === generation && snapshot === revision) apply(data);
  }).catch(error => {
    if (version === generation && snapshot === revision) { loadError = error; notify(); }
  }).finally(() => {
    refreshRequest = null;
    if (refreshAgain) { refreshAgain = false; void refresh(); }
  });
  return refreshRequest;
}

const ready = refresh();
let authDialog;
let resolveAuth;
let authPromise;
let mode = 'login';
let submitting = false;
let dialogAuthenticated = false;
let authMessage;
let form;
let submitButton;
let switchButton;
let title;
let explanation;

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function setMessage(text, error = false) {
  authMessage.textContent = text;
  authMessage.classList.toggle('is-error', error);
  if (error) authMessage.focus();
}

function renderMode() {
  const signup = mode === 'register';
  title.textContent = signup ? 'Crie sua conta Aori.' : 'Entre e guarde seus lugares.';
  form.querySelectorAll('[data-register-field]').forEach(wrapper => {
    wrapper.hidden = !signup;
    wrapper.querySelector('input').required = signup;
    wrapper.querySelector('input').disabled = !signup;
  });
  const password = form.elements.namedItem('senha');
  password.autocomplete = signup ? 'new-password' : 'current-password';
  password.minLength = signup ? 10 : 1;
  password.value = '';
  submitButton.textContent = signup ? 'Criar conta' : 'Entrar';
  switchButton.textContent = signup ? 'Já tenho uma conta. Entrar' : 'Ainda não tenho conta. Criar agora';
  setMessage('');
}

function buildDialog() {
  authDialog = node('dialog', 'account-dialog');
  authDialog.id = 'account-dialog';
  authDialog.setAttribute('aria-labelledby', 'account-dialog-title');
  const close = node('button', 'account-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar acesso à conta');
  const copy = node('div', 'account-dialog-copy');
  const brand = node('img', 'aori-logo account-logo');
  brand.src = '/assets/brand/logo/aori-logo-original.svg';
  brand.alt = 'Aori';
  brand.width = 132;
  brand.height = 41;
  title = node('h2');
  title.id = 'account-dialog-title';
  explanation = node('p', 'account-explanation');
  form = node('form', 'account-form');
  form.id = 'account-form';
  const fields = [
    ['nome', 'Nome completo', 'text', 'name', true],
    ['cpf', 'CPF', 'text', 'off', true],
    ['telefone', 'Telefone', 'tel', 'tel', true],
    ['email', 'Email', 'email', 'email', false],
    ['senha', 'Senha', 'password', 'current-password', false]
  ];
  fields.forEach(([name, label, type, autocomplete, signup]) => {
    const wrapper = node('div', 'account-field');
    if (signup) wrapper.dataset.registerField = '';
    const caption = node('label', '', label);
    const input = node('input');
    input.name = name;
    input.id = `account-${name}`;
    caption.htmlFor = input.id;
    input.type = type;
    input.autocomplete = autocomplete;
    input.required = true;
    input.maxLength = name === 'senha' ? 128 : name === 'nome' ? 120 : name === 'email' ? 254 : name === 'cpf' ? 14 : 25;
    if (name === 'cpf') { input.inputMode = 'numeric'; input.placeholder = '000.000.000-00'; }
    if (name === 'senha') { input.setAttribute('aria-describedby', 'account-password-hint'); }
    wrapper.append(caption, input);
    form.append(wrapper);
  });
  const passwordHint = node('p', 'account-hint', 'Para criar uma conta, use de 10 a 128 caracteres.');
  passwordHint.id = 'account-password-hint';
  submitButton = node('button', 'account-submit');
  submitButton.type = 'submit';
  authMessage = node('p', 'account-message');
  authMessage.id = 'account-message';
  authMessage.setAttribute('role', 'status');
  authMessage.setAttribute('aria-live', 'polite');
  authMessage.tabIndex = -1;
  form.append(passwordHint, submitButton, authMessage);
  switchButton = node('button', 'account-switch');
  switchButton.type = 'button';
  copy.append(brand, title, explanation, form, switchButton);
  authDialog.append(close, copy);
  document.body.append(authDialog);
  close.addEventListener('click', () => { if (!submitting) authDialog.close(); });
  authDialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
  authDialog.addEventListener('click', event => {
    if (submitting || event.target !== authDialog) return;
    const bounds = authDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) authDialog.close();
  });
  authDialog.addEventListener('close', () => {
    form.elements.namedItem('senha').value = '';
    resolveAuth?.(dialogAuthenticated ? user : null);
    dialogAuthenticated = false;
    resolveAuth = null;
    authPromise = null;
  });
  switchButton.addEventListener('click', () => {
    if (submitting) return;
    mode = mode === 'login' ? 'register' : 'login';
    renderMode();
    form.querySelector('input:not(:disabled)').focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    close.disabled = true;
    submitButton.disabled = true;
    switchButton.disabled = true;
    setMessage(mode === 'register' ? 'Criando sua conta…' : 'Entrando…');
    const values = Object.fromEntries(new FormData(form));
    const submittedMode = mode;
    const version = generation;
    try {
      const data = await request(`/api/${submittedMode}`, 'POST', values);
      if (version !== generation) {
        await refresh();
        setMessage('A conta mudou em outra aba. Feche esta janela e tente novamente.', true);
        return;
      }
      apply(data);
      broadcast();
      dialogAuthenticated = true;
      authDialog.close();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      submitting = false;
      form.elements.namedItem('senha').value = '';
      close.disabled = false;
      submitButton.disabled = false;
      switchButton.disabled = false;
    }
  });
}

async function ensureUser(message = 'Entre na sua conta para guardar seus lugares favoritos e encontrá-los em outras visitas.') {
  await ready;
  if (loadError) { await refresh(); if (loadError) throw loadError; }
  if (user) return user;
  if (submitting && !authPromise) throw new Error('Aguarde a conclusão do acesso à conta e tente novamente.');
  if (authPromise) return authPromise;
  if (!authDialog) buildDialog();
  mode = 'login';
  form.reset();
  dialogAuthenticated = false;
  renderMode();
  explanation.textContent = message;
  authPromise = new Promise(resolve => { resolveAuth = resolve; });
  authDialog.showModal();
  return authPromise;
}

async function toggleFavorite(id) {
  if (pending.has(id)) return pending.get(id);
  const operation = (async () => {
    const customer = await ensureUser('Entre ou crie sua conta para salvar este lugar nos seus favoritos.');
    if (!customer) return false;
    const version = generation;
    const change = async () => {
      if (version !== generation || user?.id !== customer.id) return false;
      try {
        const data = await request(`/api/favorites/${encodeURIComponent(id)}`, favorites.has(id) ? 'DELETE' : 'PUT', {});
        if (version !== generation || user?.id !== customer.id) return false;
        favorites = new Set(data.favorites || []);
        revision += 1;
        notify();
        broadcast();
        return true;
      } catch (error) {
        if (error.status === 401 && version === generation) { apply({ user: null }); broadcast(); }
        throw error;
      }
    };
    const result = favoriteQueue.then(change, change);
    favoriteQueue = result.catch(() => {});
    return result;
  })();
  pending.set(id, operation);
  notify();
  try { return await operation; } finally { pending.delete(id); notify(); }
}

async function logout() {
  await request('/api/logout', 'POST', {});
  apply({ user: null });
  broadcast();
}

export const account = {
  ready, refresh, ensureUser, toggleFavorite, logout,
  get user() { return user; },
  get favorites() { return new Set(favorites); },
  isPending(id) { return pending.has(id); },
  subscribe(listener) { listeners.add(listener); listener(); return () => listeners.delete(listener); }
};

function mountHeader() {
  const host = document.querySelector('.header-actions') || document.querySelector('.property-header-inner');
  if (!host) return;
  const controls = node('div', 'account-controls');
  const label = node('span', 'account-customer-name');
  const button = node('button', 'account-header-button', 'Entrar');
  button.type = 'button';
  const status = node('span', 'account-header-status');
  status.setAttribute('role', 'status');
  controls.append(label, button, status);
  const menu = host.querySelector('#mobile-menu-toggle');
  host.insertBefore(controls, menu);
  account.subscribe(() => {
    label.textContent = user ? `Olá, ${user.nome.trim().split(/\s+/)[0]}` : '';
    label.title = user?.nome || '';
    label.hidden = !user;
    button.textContent = user ? 'Sair' : 'Entrar';
    button.setAttribute('aria-label', user ? 'Sair da minha conta' : 'Entrar na minha conta');
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '';
    try { if (user) await logout(); else await ensureUser(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}


mountHeader();

channel?.addEventListener('message', () => {
  void refresh();
});

window.addEventListener('storage', event => {
  if (event.key === signalKey || event.key === null) {
    void refresh();
  }
});

window.addEventListener('focus', () => {
  void refresh();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void refresh();
  }
});
