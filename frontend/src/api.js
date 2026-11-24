// Central API module. Every network call in the app goes through here.
//
// URLs are *relative* by default (`/api/<service>/...`). The browser is not on a
// Docker network, so it cannot resolve `catalog`, `inventory` or `order`. In
// production Nginx (same origin) and in `npm run dev` the Vite proxy forward
// those paths to the real containers/Localhost ports.
//
// VITE_API_BASE_URL is optional and is inlined at BUILD time by Vite. Leave it
// empty for same-origin. Never put secrets in a VITE_* variable: it ships to the
// browser in clear text.

const ENV = import.meta.env ?? {};
const BASE_URL = (ENV.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = network failure / timeout, not an HTTP status
    this.body = body;
    this.cause = cause;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const url = `${BASE_URL}${path}`;
  let res;

  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // TimeoutError: our AbortSignal fired. TypeError: DNS/refused/offline.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${TIMEOUT_MS / 1000}s`, { cause: err });
    }
    throw new ApiError('Network error: the service is unreachable', { cause: err });
  }

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Not JSON (e.g. an Nginx HTML error page). Keep the raw text for context.
      payload = null;
    }
  }

  if (!res.ok) {
    // Backend shapes we must tolerate:
    //   {"error":"..."}                         (ShopLite services)
    //   {"timestamp":..,"status":400,"error":..} (Spring default errors)
    //   HTML                                     (Nginx 502/503)
    const message =
      payload?.error ||
      payload?.message ||
      (text && !payload ? text.replace(/\s+/g, ' ').trim().slice(0, 160) : '') ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new ApiError(message, { status: res.status, body: payload });
  }

  return payload;
}

const q = (id) => encodeURIComponent(String(id));

export const api = {
  // GET /health on a specific service
  health: (service) => request(`/api/${service}/health`),

  // Catalog: GET /products -> [{id,name,price}]
  products: () => request('/api/catalog/products'),
  // Catalog: GET /products/:id -> {id,name,price} (404 if unknown)
  product: (productId) => request(`/api/catalog/products/${q(productId)}`),

  // Inventory: GET /stock/:productId -> {productId,quantity} (404 = no stock row)
  stock: (productId) => request(`/api/inventory/stock/${q(productId)}`),

  // Order: GET /orders -> [{id,productId,quantity,total,createdAt}]
  orders: () => request('/api/orders/orders'),

  // Order: POST /orders {productId,quantity} -> 201 saved order
  createOrder: (productId, quantity) =>
    request('/api/orders/orders', { method: 'POST', body: { productId, quantity } }),

  // Multi-line checkout. The current backend accepts ONE product per request,
  // so this submits lines sequentially and stops at the first failure. It is
  // intentionally NOT atomic: lines already accepted stay committed, and the
  // returned `failures` tells the UI exactly what to report. Once a server-side
  // checkout endpoint exists, only this function needs to change.
  checkout: async (lines, onProgress) => {
    const orders = [];
    const failures = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      onProgress?.({ index: i, total: lines.length, productId: line.productId });

      try {
        const order = await api.createOrder(line.productId, line.quantity);
        orders.push(order);
      } catch (err) {
        failures.push({
          productId: line.productId,
          quantity: line.quantity,
          status: err.status ?? 0,
          message: err.message,
        });
        break; // stop: later lines would fail for the same reason
      }
    }

    return { orders, failures, complete: failures.length === 0 };
  },
};
