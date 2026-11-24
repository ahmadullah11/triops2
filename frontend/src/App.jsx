import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const SERVICES = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'orders', label: 'Orders' },
];

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value) => nf.format(Number(value ?? 0));

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?';

// Curated tile gradients. A hash of the id would produce acid colours, so each
// product simply cycles through a palette that works in both themes.
const GRADIENTS = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#22d3ee'],
  ['#f43f5e', '#fb7185'],
  ['#f59e0b', '#fbbf24'],
  ['#10b981', '#34d399'],
  ['#8b5cf6', '#d946ef'],
];

const gradientFor = (id) => {
  const [from, to] = GRADIENTS[Number(id) % GRADIENTS.length];
  return { '--g1': from, '--g2': to };
};

/* ------------------------------------------------------------------ theme */

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('shoplite-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('shoplite-theme', theme);
  }, [theme]);

  return [theme, setTheme];
}

/* --------------------------------------------------------------- chrome */

function ServiceStatus() {
  const [status, setStatus] = useState({});

  useEffect(() => {
    let alive = true;
    const check = () => {
      SERVICES.forEach(({ key }) => {
        api
          .health(key)
          .then((body) => alive && setStatus((prev) => ({ ...prev, [key]: body?.status === 'ok' })))
          .catch(() => alive && setStatus((prev) => ({ ...prev, [key]: false })));
      });
    };
    check();
    const timer = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <ul className="status-bar" aria-label="Backend service status">
      {SERVICES.map(({ key, label }) => {
        const state = status[key];
        const cls = state === undefined ? 'pending' : state ? 'up' : 'down';
        const text = state === undefined ? 'checking' : state ? 'online' : 'offline';
        return (
          <li key={key} className={cls} title={`${label}: ${text}`}>
            <span className="dot" aria-hidden="true" />
            <span className="status-label">{label}</span>
            <span className="sr-only">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ThemeToggle({ theme, onChange }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => onChange(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
          <path
            d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.9 8.9 0 1 0 11.1 11.1Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}

function Hero({ productCount, unitsInStock, orderCount }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">Microservices demo &middot; Docker &middot; CI/CD</p>
        <h2 id="hero-title">
          Everyday gear,
          <br />
          <span className="grad-text">served by four services.</span>
        </h2>
        <p className="hero-sub">
          Catalog prices, inventory checks and order totals all come from separate containers behind one
          Nginx entry point.
        </p>
      </div>

      <dl className="hero-stats">
        <div>
          <dt>Products</dt>
          <dd>{productCount}</dd>
        </div>
        <div>
          <dt>In stock</dt>
          <dd>{unitsInStock}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd>{orderCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function StockBadge({ stock }) {
  if (stock === null || stock === undefined) return <span className="badge unknown">Stock unknown</span>;
  if (stock <= 0) return <span className="badge out">Out of stock</span>;
  if (stock <= 5) return <span className="badge low">Only {stock} left</span>;
  return <span className="badge ok">{stock} in stock</span>;
}

function QuantityStepper({ value, min = 1, max, onChange, id, disabled = false, compact = false }) {
  const cap = Number.isFinite(max) ? max : undefined;
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(cap === undefined ? value + 1 : Math.min(cap, value + 1));

  return (
    <div className={`stepper${compact ? ' compact' : ''}`}>
      <button type="button" onClick={dec} disabled={disabled || value <= min} aria-label="Decrease quantity">
        &minus;
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={cap}
        value={value}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isNaN(parsed)) return onChange(min);
          onChange(Math.min(cap ?? Number.MAX_SAFE_INTEGER, Math.max(min, parsed)));
        }}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled || (cap !== undefined && value >= cap)}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

function ProductCard({ product, onAdd, busy }) {
  const [qty, setQty] = useState(1);
  const stock = Number.isFinite(product.stock) ? product.stock : null;
  const soldOut = stock === 0;
  const inputId = `qty-${product.id}`;

  return (
    <article className={`card${soldOut ? ' sold-out' : ''}`} style={gradientFor(product.id)}>
      <div className="thumb" aria-hidden="true">
        <span>{initials(product.name)}</span>
        <small>#{product.id}</small>
      </div>

      <div className="card-body">
        <div className="card-head">
          <h3 title={product.name}>{product.name}</h3>
          <StockBadge stock={stock} />
        </div>

        <p className="price">
          {money(product.price)} <span className="unit">each</span>
        </p>

        <div className="card-actions">
          <label className="sr-only" htmlFor={inputId}>
            Quantity for {product.name}
          </label>
          <QuantityStepper
            id={inputId}
            value={qty}
            max={stock ?? undefined}
            onChange={setQty}
            disabled={soldOut || busy}
          />
          <button
            type="button"
            className="btn primary grow"
            disabled={soldOut || busy}
            onClick={() => {
              onAdd(product, qty);
              setQty(1);
            }}
          >
            {soldOut ? 'Sold out' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
}

function Toolbar({ query, onQuery, sort, onSort, onRefresh, loading, count }) {
  return (
    <div className="toolbar">
      <div className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="Search products"
          aria-label="Search products"
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>

      <label className="sort">
        <span className="sr-only">Sort products</span>
        <select value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="featured">Featured</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </label>

      <span className="count small muted">
        {count} result{count === 1 ? '' : 's'}
      </span>

      <button type="button" className="btn ghost small" onClick={onRefresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

function CartPanel({
  cart,
  stockById,
  estimatedTotal,
  onInc,
  onDec,
  onRemove,
  onClear,
  onCheckout,
  submitting,
  progress,
  result,
  onDismissResult,
}) {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <aside className="cart" aria-labelledby="cart-heading">
      <div className="cart-head">
        <h2 id="cart-heading">Your cart</h2>
        <span className="pill">
          {count} item{count === 1 ? '' : 's'}
        </span>
      </div>

      {cart.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path
                d="M4 5h2l2 10h9l2-7H7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="19" r="1.4" fill="currentColor" />
              <circle cx="16.5" cy="19" r="1.4" fill="currentColor" />
            </svg>
          </div>
          <p>Your cart is empty</p>
          <p className="muted small">Pick a product and press “Add to cart”.</p>
        </div>
      ) : (
        <>
          <ul className="cart-lines">
            {cart.map((item) => {
              const stock = stockById.get(item.productId);
              const capped = Number.isFinite(stock) && item.quantity > stock;
              return (
                <li key={item.productId} className="cart-line" style={gradientFor(item.productId)}>
                  <span className="line-thumb" aria-hidden="true">
                    {initials(item.name)}
                  </span>

                  <div className="cart-line-main">
                    <p className="name">{item.name}</p>
                    <p className="muted small">
                      {money(item.price)} &times; {item.quantity}
                    </p>
                    {capped && (
                      <p className="warn" role="alert">
                        Only {stock} left — reduce the quantity to order.
                      </p>
                    )}
                  </div>

                  <div className="cart-line-side">
                    <p className="line-total">{money(item.price * item.quantity)}</p>
                    <QuantityStepper
                      compact
                      value={item.quantity}
                      max={Number.isFinite(stock) ? stock : undefined}
                      onChange={(next) => (next > item.quantity ? onInc(item.productId) : onDec(item.productId))}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="link danger"
                      onClick={() => onRemove(item.productId)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="cart-total">
            <span>Estimated total</span>
            <strong>{money(estimatedTotal)}</strong>
          </div>
          <p className="muted small">Final prices and totals are calculated by the Order service.</p>

          <div className="cart-actions">
            <button
              type="button"
              className="btn primary wide checkout-btn"
              onClick={onCheckout}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? 'Placing order…' : 'Checkout'}
            </button>
            <button type="button" className="btn ghost wide" onClick={onClear} disabled={submitting}>
              Clear cart
            </button>
          </div>

          {submitting && progress && (
            <p className="muted small" role="status">
              Submitting item {progress.index + 1} of {progress.total}…
            </p>
          )}
        </>
      )}

      {result && <CheckoutResult result={result} onDismiss={onDismissResult} />}
    </aside>
  );
}

function CheckoutResult({ result, onDismiss }) {
  if (result.state === 'error') {
    return (
      <div className="result error" role="alert">
        <h3>Order failed</h3>
        <p>{result.error}</p>
        <p className="muted small">No order was created and no stock was reserved.</p>
        <button type="button" className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  const succeeded = result.orders ?? [];
  const failed = result.failures ?? [];

  return (
    <div className={`result ${result.state === 'success' ? 'success' : 'warning'}`} role="status">
      <h3>{result.state === 'success' ? 'Order confirmed' : 'Partially completed'}</h3>

      {succeeded.length > 0 && (
        <>
          <p className="muted small">
            Created {succeeded.length} order{succeeded.length === 1 ? '' : 's'}:
          </p>
          <ul className="result-orders">
            {succeeded.map((order) => (
              <li key={order.id}>
                <strong>#{order.id}</strong> — {order.quantity} &times; product {order.productId} —{' '}
                {money(order.total)}
              </li>
            ))}
          </ul>
        </>
      )}

      {failed.length > 0 && (
        <div className="result-failure">
          <p>
            Line failed: product {failed[0].productId} &times; {failed[0].quantity}
            {failed[0].status ? ` (HTTP ${failed[0].status})` : ''}
          </p>
          <p>{failed[0].message}</p>
          <p className="muted small">
            Earlier lines in this checkout were already accepted and remain saved — the backend does not
            support multi-item transactions yet.
          </p>
        </div>
      )}

      <button type="button" className="btn ghost" onClick={onDismiss}>
        Continue shopping
      </button>
    </div>
  );
}

function OrdersTable({ orders, productName }) {
  if (orders.length === 0) {
    return (
      <div className="empty slim">
        <p>No orders yet</p>
        <p className="muted small">Completed checkouts will appear here.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Product</th>
            <th scope="col">Qty</th>
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <span className="order-id">#{order.id}</span>
              </td>
              <td>
                {productName(order.productId) ?? `Product ${order.productId}`}
                <span className="muted small"> (id {order.productId})</span>
              </td>
              <td>{order.quantity}</td>
              <td className="num">{money(order.total)}</td>
              <td className="muted">{order.createdAt ? dateFmt.format(new Date(order.createdAt)) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="card skeleton">
          <div className="sk-thumb" />
          <div className="sk-line w70" />
          <div className="sk-line w40" />
          <div className="sk-line w90" />
        </div>
      ))}
    </div>
  );
}

// `toast` is a plain string (or null); the class drives the fade, so the text
// stays in the DOM for screen readers even while hidden.
function Toast({ toast }) {
  return (
    <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      {toast ?? ''}
    </div>
  );
}

/* ------------------------------------------------------------------- app */

export default function App() {
  const [theme, setTheme] = useTheme();

  const [products, setProducts] = useState([]);
  const [catalogState, setCatalogState] = useState('loading');
  const [catalogError, setCatalogError] = useState('');

  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState(null);

  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');

  const stockById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      if (Number.isFinite(product.stock)) map.set(product.id, product.stock);
    });
    return map;
  }, [products]);

  const nameById = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? products.filter((product) => product.name.toLowerCase().includes(needle))
      : products.slice();

    if (sort === 'price-asc') filtered.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === 'price-desc') filtered.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  }, [products, query, sort]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setCatalogState('loading');
    setCatalogError('');

    try {
      const list = await api.products();
      // Inventory exposes per-product stock only, so ask once per product.
      // A missing stock row (404) is not fatal: show "stock unknown".
      const withStock = await Promise.all(
        list.map(async (product) => {
          try {
            const stock = await api.stock(product.id);
            return { ...product, stock: stock.quantity };
          } catch {
            return { ...product, stock: null };
          }
        }),
      );
      setProducts(withStock);
      setCatalogState('ready');
    } catch (err) {
      setProducts([]);
      setCatalogState('error');
      setCatalogError(err.message);
    }

    try {
      setOrders(await api.orders());
      setOrdersError('');
    } catch (err) {
      setOrders([]);
      setOrdersError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addToCart = (product, quantity) => {
    const stock = Number.isFinite(product.stock) ? product.stock : Number.MAX_SAFE_INTEGER;
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: Math.min(stock, item.quantity + quantity) }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: Math.min(stock, quantity),
        },
      ];
    });
    setToast(`${quantity} × ${product.name} added to cart`);
    setResult(null);
  };

  const increment = (productId) =>
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const stock = stockById.get(productId);
        const cap = Number.isFinite(stock) ? stock : Number.MAX_SAFE_INTEGER;
        return { ...item, quantity: Math.min(cap, item.quantity + 1) };
      }),
    );

  const decrement = (productId) =>
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item,
      ),
    );

  const remove = (productId) => setCart((prev) => prev.filter((item) => item.productId !== productId));

  const clear = () => {
    setCart([]);
    setResult(null);
  };

  const estimatedTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const unitsInStock = products.reduce(
    (sum, product) => (Number.isFinite(product.stock) ? sum + product.stock : sum),
    0,
  );

  const checkout = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setResult(null);
    setProgress(null);
    try {
      const outcome = await api.checkout(
        cart.map(({ productId, quantity }) => ({ productId, quantity })),
        setProgress,
      );

      if (outcome.failures.length === 0) {
        setResult({ state: 'success', orders: outcome.orders, failures: [] });
        setCart([]);
      } else {
        const accepted = new Set(outcome.orders.map((order) => order.productId));
        setResult({ state: 'partial', orders: outcome.orders, failures: outcome.failures });
        setCart((prev) => prev.filter((item) => !accepted.has(item.productId)));
      }
      load();
    } catch (err) {
      setResult({ state: 'error', error: err.message, orders: [], failures: [] });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              SL
            </span>
            <div className="brand-text">
              <h1>ShopLite</h1>
              <p className="muted small">Microservices demo shop</p>
            </div>
          </div>

          <ServiceStatus />

          <div className="topbar-actions">
            <a className="btn ghost small cart-jump" href="#cart-heading">
              Cart
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </a>
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </header>

        <Hero productCount={products.length} unitsInStock={unitsInStock} orderCount={orders.length} />

        <div className="layout">
          <section aria-labelledby="products-heading" className="panel products">
            <div className="section-head">
              <h2 id="products-heading">Products</h2>
              <span className="muted small">GET /products</span>
            </div>

            <Toolbar
              query={query}
              onQuery={setQuery}
              sort={sort}
              onSort={setSort}
              onRefresh={load}
              loading={catalogState === 'loading'}
              count={visibleProducts.length}
            />

            {catalogState === 'loading' && <SkeletonGrid />}

            {catalogState === 'error' && (
              <div className="notice error" role="alert">
                <p>
                  <strong>Could not load products.</strong> {catalogError}
                </p>
                <button type="button" className="btn ghost" onClick={load}>
                  Try again
                </button>
              </div>
            )}

            {catalogState === 'ready' && products.length === 0 && (
              <div className="notice">
                <p>
                  <strong>The catalog is empty.</strong>
                </p>
                <p className="muted small">No products have been added yet.</p>
              </div>
            )}

            {catalogState === 'ready' && products.length > 0 && visibleProducts.length === 0 && (
              <div className="notice">
                <p>
                  <strong>No products match “{query}”.</strong>
                </p>
                <button type="button" className="btn ghost" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            )}

            {visibleProducts.length > 0 && (
              <div className="product-grid">
                {visibleProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onAdd={addToCart} busy={submitting} />
                ))}
              </div>
            )}
          </section>

          <CartPanel
            cart={cart}
            stockById={stockById}
            estimatedTotal={estimatedTotal}
            onInc={increment}
            onDec={decrement}
            onRemove={remove}
            onClear={clear}
            onCheckout={checkout}
            submitting={submitting}
            progress={progress}
            result={result}
            onDismissResult={() => setResult(null)}
          />
        </div>

        <section aria-labelledby="orders-heading" className="panel orders">
          <div className="section-head">
            <h2 id="orders-heading">Recent orders</h2>
            <span className="muted small">GET /orders</span>
          </div>
          {ordersError ? (
            <p className="notice error" role="alert">
              Could not load orders: {ordersError}
            </p>
          ) : (
            <OrdersTable orders={orders} productName={(id) => nameById.get(id)} />
          )}
        </section>

        <footer className="footer">
          <span>ShopLite · Catalog (Node) · Inventory (Go) · Orders (Spring Boot) · PostgreSQL</span>
          <span className="muted small">Served by Nginx on port 80</span>
        </footer>
      </div>

      {cartCount > 0 && (
        <div className="mobile-bar">
          <div className="mobile-total">
            <span className="muted small">
              {cartCount} item{cartCount === 1 ? '' : 's'}
            </span>
            <strong>{money(estimatedTotal)}</strong>
          </div>
          <button type="button" className="btn primary" onClick={checkout} disabled={submitting}>
            {submitting ? 'Placing order…' : 'Checkout'}
          </button>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
