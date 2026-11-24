// Real, DB-free tests for the catalog HTTP contract.
// They cover validation paths that return before any SQL is executed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool } = require('../server.js');

let server;
let base;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('GET /products/:id rejects a non-numeric id with 400', async () => {
  const res = await fetch(`${base}/products/abc`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid product ID' });
});

test('GET /products/:id rejects id 0 with 400', async () => {
  const res = await fetch(`${base}/products/0`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid product ID' });
});

test('POST /products rejects a missing name', async () => {
  const res = await fetch(`${base}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: 100 }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /name must be a non-empty string/);
});

test('POST /products rejects a non-positive price', async () => {
  const res = await fetch(`${base}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', price: 0 }),
  });
  assert.equal(res.status, 400);
});

test('unknown route returns 404', async () => {
  const res = await fetch(`${base}/does-not-exist`);
  assert.equal(res.status, 404);
});
