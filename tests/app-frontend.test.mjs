
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(
  new URL('../public/index.html', import.meta.url),
  'utf8'
);

const dom = new JSDOM(html, {
  url: 'http://localhost/'
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.FormData = dom.window.FormData;
globalThis.localStorage = dom.window.localStorage;

globalThis.BroadcastChannel = class {
  addEventListener() {}
  postMessage() {}
  close() {}
};

window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});

window.HTMLElement.prototype.scrollIntoView = function () {};

window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};

window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new window.Event('close'));
};

globalThis.fetch = async (url) => {
  if (url === '/api/me') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: null, favorites: [] })
    };
  }
  throw new Error(`Requisição inesperada: ${url}`);
};

const { account } = await import('../public/account.js');
const { stays } = await import('../public/stays.js');

await account.ready;
await import('../public/app.js');

const grid = document.querySelector('#stays-grid');
const form = document.querySelector('#search-form');

function reset() {
  document.querySelector('#clear-filters').click();
}

function submit() {
  form.dispatchEvent(new window.Event('submit', {
    bubbles: true,
    cancelable: true
  }));
}

test('a página inicial lista todas as hospedagens', () => {
  assert.equal(
    grid.querySelectorAll('.stay-card').length,
    stays.length
  );
  assert.match(
    document.querySelector('#results-count').textContent,
    new RegExp(String(stays.length))
  );
});

test('o filtro por destino mostra apenas hospedagens correspondentes', () => {
  reset();
  document.querySelector('[data-destination="serra"]').click();

  const expected = stays.filter(stay =>
    stay.destination === 'serra' && stay.guests >= 2
  );

  assert.equal(
    grid.querySelectorAll('.stay-card').length,
    expected.length
  );

  assert.equal(
    document.querySelector('[data-destination="serra"]')
      .getAttribute('aria-pressed'),
    'true'
  );

  reset();
});

test('o filtro por interesse restringe os resultados', () => {
  reset();
  document.querySelector('[data-filter="natureza"]').click();

  const expected = stays.filter(stay =>
    stay.filters.includes('natureza') && stay.guests >= 2
  );

  assert.equal(
    grid.querySelectorAll('.stay-card').length,
    expected.length
  );

  reset();
});

test('a busca considera a quantidade de hóspedes', () => {
  reset();

  form.elements.namedItem('guests').value = '6';
  submit();

  const expected = stays.filter(stay => stay.guests >= 6);

  assert.equal(
    grid.querySelectorAll('.stay-card').length,
    expected.length
  );

  assert.match(
    document.querySelector('#search-feedback').textContent,
    /encontrado/
  );

  reset();
});

test('datas incompletas apresentam mensagem de erro', () => {
  reset();

  form.elements.namedItem('checkin').value = '2028-03-01';
  form.elements.namedItem('checkout').value = '';
  submit();

  const feedback = document.querySelector('#search-feedback');

  assert.match(feedback.textContent, /Escolha as datas/);
  assert.equal(feedback.classList.contains('is-error'), true);

  reset();
});

test('a busca rejeita saída anterior à entrada', () => {
  reset();

  form.elements.namedItem('checkin').value = '2028-03-10';
  form.elements.namedItem('checkout').value = '2028-03-05';
  submit();

  assert.match(
    document.querySelector('#search-feedback').textContent,
    /saída precisa ser depois/
  );

  reset();
});

test('o botão de detalhes abre a hospedagem correta', () => {
  reset();

  const first = stays[0];
  const button = grid.querySelector(
    `[data-open-stay="${first.id}"]`
  );

  assert.ok(button);

  button.click();

  const dialog = document.querySelector('#stay-dialog');

  assert.equal(dialog.open, true);
  assert.match(dialog.textContent, new RegExp(first.name));

  const link = dialog.querySelector('.dialog-availability');
  assert.ok(link);
  assert.match(link.getAttribute('href'), /estadia\.html/);

  dialog.querySelector('[data-close-dialog]').click();

  assert.equal(dialog.open, false);
});

test('limpar filtros restaura todas as hospedagens', () => {
  reset();

  document.querySelector('[data-destination="campo"]').click();
  reset();

  assert.equal(
    grid.querySelectorAll('.stay-card').length,
    stays.length
  );

  assert.equal(
    form.elements.namedItem('destination').value,
    ''
  );
});

test('o menu móvel pode ser aberto e fechado', () => {
  const toggle = document.querySelector('#mobile-menu-toggle');
  const menu = document.querySelector('#mobile-menu');

  toggle.click();

  assert.equal(menu.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  toggle.click();

  assert.equal(menu.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});
