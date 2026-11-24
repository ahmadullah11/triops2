import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const SERVICES = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'orders', label: 'Orders' },
];

const nf = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (value) => nf.format(Number(value ?? 0));
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function StatusBar() {
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
        const title = state === undefined ? 'checking…' : state ? 'reachable' : 'unreachable';
        return (
          <li key={key} className={cls} title={`${label}: ${title}`}>
            <span aria-hidden="true" className="dot" />
            {label}
            <span className="sr-only"> is {title}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StockBadge({ stock }) {
  if (stock === null || stock === undefined) {
    return <span className="badge unknown">Stock unknown</span>;
  }
  if (stock <= 0) return <span className="badge out">Out of stock</span>;
  if (stock <= 5) return <span className="badge low">Only {stock} left</span>;
  return <span className="badge ok">{stock} in stock</span>;
}

function QuantityStepper({ value, min = 1, max, onChange, id, disabled = false }) {
  const cap = Number.isFinite(max) ? max : undefined;
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(cap === undefined ? value + 1 : Math.min(cap, value + 1));

  return (
    <div className="stepper">
      <button type="button" onClick={dec} disabled={disabled || value <= min} aria-label="Decrease quantity">
        −
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
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (Number.isNaN(next)) return onChange(min);
          onChange(Math.min(cap ?? Number.MAX_SAFE_INTEGER, Math.max(min, next)));
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
    <article className={`card${soldOut ? ' sold-out' : ''}`}>
      <div className="card-head">
        <h3>{product.name}</h3>
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
          className="btn primary"
          disabled={soldOut || busy}
          onClick={() => {
            onAdd(product, qty);
            setQty(1);
          }}
        >
          {soldOut ? 'Sold out' : 'Add to cart'}
        </button>
      </div>
    </article>
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
        <span className="pill">{count} item{count === 1 ? '' : 's'}</span>
      </div>

      {cart.length === 0 ? (
        <div className="empty">
          <p>Your cart is empty.</p>
          <p className="muted">Pick a product and press “Add to cart”.</p>
        </div>
      ) : (
        <>
          <ul className="cart-lines">
            {cart.map((item) => {
              const stock = stockById.get(item.productId);
              const capped = Number.isFinite(stock) && item.quantity > stock;
              return (
                <li key={item.productId} className="cart-line">
                  <div className="cart-line-main">
                    <p className="name">{item.name}</p>
                    <p className="muted">
                      {money(item.price)} × {item.quantity}
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
            <button type="button" className="btn primary wide" onClick={onCheckout} disabled={submitting || cart.length === 0}>
              {submitting ? 'Placing order…' : 'Checkout'}
            </button>
            <button type="button" className="btn ghost wide" onClick={onClear} disabled={submitting || cart.length === 0}>
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
                <strong>#{order.id}</strong> — {order.quantity} × product {order.productId} —{' '}
                {money(order.total)}
              </li>
            ))}
          </ul>
        </>
      )}

      {failed.length > 0 && (
        <div className="result-failure">
          <p>
            Line failed: product {failed[0].productId} × {failed[0].quantity}
            {failed[0].status ? ` (HTTP ${failed[0].status})` : ''}
          </p>
          <p>{failed[0].message}</p>
          <p className="muted small">
            Earlier lines in this checkout were already accepted and remain saved — the backend does
            not support multi-item transactions yet.
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
    return <p className="muted">No orders yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Product</th>
            <th scope="col">Qty</th>
            <th scope="col">Total</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>#{order.id}</td>
              <td>
                {productName(order.productId) ?? `Product ${order.productId}`}
                <span className="muted small"> (id {order.productId})</span>
              </td>
              <td>{order.quantity}</td>
              <td>{money(order.total)}</td>
              <td>{order.createdAt ? dateFmt.format(new Date(order.createdAt)) : '—'}</td>
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
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card skeleton">
          <div className="sk-line w60" />
          <div className="sk-line w30" />
          <div className="sk-line w90" />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [catalogState, setCatalogState] = useState('loading'); // loading | ready | error
  const [catalogError, setCatalogError] = useState('');

  const [cart, setCart] = useState([]); // {productId, name, price, quantity}
  const [notice, setNotice] = useState('');

  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const stockById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (Number.isFinite(p.stock)) map.set(p.id, p.stock);
    });
    return map;
  }, [products]);

  const nameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const load = useCallback(async () => {
    setCatalogState('loading');
    setCatalogError('');
    try {
      const list = await api.products();
      // Inventory has no "all stock" endpoint, so query it once per product.
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
    setNotice(`Added ${quantity} × ${product.name} to the cart.`);
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
      setNotice('');
      load();
    } catch (err) {
      setResult({ state: 'error', error: err.message, orders: [], failures: [] });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">SL</span>
          <div>
            <h1>ShopLite</h1>
            <p className="muted small">Microservices demo shop</p>
          </div>
        </div>
        <StatusBar />
      </header>

      <div aria-live="polite" className="sr-only">
        {notice}
      </div>

      <div className="layout">
        <section aria-labelledby="products-heading" className="products">
          <div className="section-head">
            <h2 id="products-heading">Products</h2>
            <button type="button" className="btn ghost small" onClick={load} disabled={catalogState === 'loading'}>
              {catalogState === 'loading' ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {catalogState === 'loading' && <SkeletonGrid />}

          {catalogState === 'error' && (
            <div className="notice error" role="alert">
              <p><strong>Could not load products.</strong> {catalogError}</p>
              <button type="button" className="btn ghost" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {catalogState === 'ready' && products.length === 0 && (
            <div className="notice">
              <p><strong>The catalog is empty.</strong></p>
              <p className="muted small">No products have been added yet.</p>
            </div>
          )}

          {catalogState === 'ready' && products.length > 0 && (
            <div className="product-grid">
              {products.map((product) => (
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

      <section aria-labelledby="orders-heading" className="orders">
        <div className="section-head">
          <h2 id="orders-heading">Recent orders</h2>
          <span className="muted small">GET /orders</span>
        </div>
        {ordersError ? (
          <p className="notice error" role="alert">Could not load orders: {ordersError}</p>
        ) : (
          <OrdersTable orders={orders} productName={(id) => nameById.get(id)} />
        )}
      </section>
    </main>
  );
}
