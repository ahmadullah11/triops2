const express = require('express');
const { Pool } = require('pg');

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'shopdb',
  user: process.env.DB_USER || 'shop',
  password: process.env.DB_PASSWORD,
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ status: 'error' });
  }
});

// Get all products
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price FROM products ORDER BY id'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single product
app.get('/products/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, price FROM products WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a product
app.post('/products', async (req, res) => {
  const { name, price } = req.body;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    !Number.isFinite(Number(price)) ||
    Number(price) <= 0
  ) {
    return res.status(400).json({
      error: 'name must be a non-empty string and price must be greater than 0',
    });
  }

  try {
    const result = await pool.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id, name, price',
      [name.trim(), price]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server only when this file is run directly (`node server.js`).
// Importing it (for tests) must not bind a port.
function start() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Catalog service listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down catalog service...');

    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, pool, start };
