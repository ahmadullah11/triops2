// Unit tests for the API layer. `fetch` is stubbed, so no server is required.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.js';

const realFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body, status = 200, statusText = 'OK') =>
  new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });

test('products() calls the catalog path and parses JSON', async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return json([{ id: 1, name: 'Keyboard', price: '4500.00' }]);
  };

  const list = await api.products();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/catalog/products');
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(list, [{ id: 1, name: 'Keyboard', price: '4500.00' }]);
});

test('stock() uses the inventory path with an encoded id', async () => {
  await api.stock(7);
  assert.equal(calls[0].url, '/api/inventory/stock/7');
});

test('createOrder() posts the documented body to the order path', async () => {
  await api.createOrder(3, 2);

  assert.equal(calls[0].url, '/api/orders/orders');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { productId: 3, quantity: 2 });
});

test('backend error bodies become ApiError with status and message', async () => {
  globalThis.fetch = async () => json({ error: 'not enough stock' }, 409, 'Conflict');

  await assert.rejects(
    () => api.createOrder(1, 999),
    (err) =>
      err instanceof ApiError &&
      err.status === 409 &&
      err.message === 'not enough stock',
  );
});

test('Spring default error bodies fall back to their error field', async () => {
  globalThis.fetch = async () =>
    json({ timestamp: 'x', status: 400, error: 'Bad Request', path: '/orders' }, 400, 'Bad Request');

  await assert.rejects(
    () => api.products(),
    (err) => err instanceof ApiError && err.status === 400 && err.message === 'Bad Request',
  );
});

test('non-JSON gateway errors keep a readable message', async () => {
  globalThis.fetch = async () =>
    new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
      status: 502,
      statusText: 'Bad Gateway',
    });

  await assert.rejects(
    () => api.products(),
    (err) => err instanceof ApiError && err.status === 502 && err.message.includes('502 Bad Gateway'),
  );
});

test('network failures become ApiError with status 0', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  await assert.rejects(
    () => api.products(),
    (err) => err instanceof ApiError && err.status === 0 && /Network error/.test(err.message),
  );
});

test('checkout submits one request per line and reports partial success', async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const { productId } = JSON.parse(init.body);
    if (productId === 2) return json({ error: 'not enough stock' }, 409, 'Conflict');
    return json({ id: 10, productId, quantity: 1, total: '4500.00' }, 201, 'Created');
  };

  const result = await api.checkout([
    { productId: 1, quantity: 1 },
    { productId: 2, quantity: 99 },
  ]);

  assert.equal(calls.length, 2);
  assert.equal(result.complete, false);
  assert.equal(result.orders.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].status, 409);
});
