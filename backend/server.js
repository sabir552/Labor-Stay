/**
 * LaborStay API — main Express entry point.
 * Routes are mounted lazily; missing route modules return 501 so the
 * server starts cleanly while individual pieces are still being built.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { apiLimiter } = require('./middleware/rateLimiter');
const { UPLOAD_PATH } = require('./middleware/upload');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ---------- Global middleware ----------
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Static uploads
app.use('/uploads', express.static(UPLOAD_PATH));

// Rate limit only the /api scope (not /uploads)
app.use('/api', apiLimiter);

// ---------- Health ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    service: 'LaborStay API',
    version: process.env.APP_VERSION || '2.0.0',
    env: process.env.NODE_ENV || 'development',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Detailed health — admin only (I2)
app.get('/api/health/detailed', async (req, res) => {
  try {
    const { authRequired, requireRole } = require('./middleware/auth');
    // Manually invoke the two middleware so we can keep this as a single app.get
    await new Promise((resolve, reject) => authRequired(req, res, (e) => e ? reject(e) : resolve()));
    await new Promise((resolve, reject) => requireRole('admin')(req, res, (e) => e ? reject(e) : resolve()));

    const db = require('./config/database');
    const cache = require('./utils/cache');
    let dbStatus = 'unknown';
    try { await db.query('SELECT 1 AS ok', []); dbStatus = 'connected'; }
    catch (e) { dbStatus = 'error: ' + e.message; }

    res.json({
      status: 'ok',
      service: 'LaborStay API',
      version: process.env.APP_VERSION || '2.0.0',
      env: process.env.NODE_ENV || 'development',
      db_driver: db.driver,
      database: dbStatus,
      uptime_seconds: Math.round(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      cache: cache.stats(),
      pid: process.pid,
      node_version: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (e) { /* authRequired/requireRole already responded */ }
});

app.get('/', (_req, res) => {
  res.send(`<h2>LaborStay API</h2>
    <p>API base: <code>/api</code></p>
    <p>Health: <a href="/api/health">/api/health</a></p>`);
});

// ---------- Route loader (lazy + tolerant) ----------
const routes = [
  ['/api/auth',          './routes/auth'],
  ['/api/users',         './routes/users'],
  ['/api/camps',         './routes/camps'],
  ['/api/rooms',         './routes/rooms'],
  ['/api/bookings',      './routes/bookings'],
  ['/api/payments',      './routes/payments'],
  ['/api/reviews',       './routes/reviews'],
  ['/api/messages',      './routes/messages'],
  ['/api/notifications', './routes/notifications'],
  ['/api/equipment',     './routes/equipment'],
  ['/api/services',      './routes/services'],
  ['/api/admin',         './routes/admin'],
  ['/api/waiting-list',  './routes/waitingList'],

  // ── v2 (Piece 13+) ─────────────────────────────────────────────
  ['/api/auth',                  './routes/auth2'],            // 2FA + sessions
  ['/api/admin/security',        './routes/adminSecurity'],    // F3 admin
  ['/api/admin/export',          './routes/adminExports'],     // I4 CSV
  ['/api',                       './routes/pdpl'],             // F7 data export/deletion (paths inside)
  ['/api',                       './routes/bookings2'],        // A1 sign agreement, A3 waitlist notify (paths inside)
  ['/api',                       './routes/campsRoomsV2'],     // B1, B2, B5 (paths inside)
  ['/api/catering',              './routes/catering'],         // B3
  ['/api/transport',             './routes/transportation'],   // B4
  ['/api/worker-requests',       './routes/workerServiceRequests'], // C1
  ['/api/surveys',               './routes/surveys'],           // C2
  ['/api',                       './routes/renewalsAndPrefs'],  // C3 + H10 (paths inside)
  ['/api/housekeeping',          './routes/housekeeping'],     // D1
  ['/api/visitors',              './routes/visitors'],         // D2
  ['/api/staff',                 './routes/staff'],            // D3
  ['/api',                       './routes/expiryAlerts'],     // D4 (paths inside)
  ['/api/payroll',               './routes/payroll'],          // D6
  ['/api',                       './routes/currency'],         // E1 (paths inside: /currency/* and /users/me/currency)
  ['/api/corporate',             './routes/corporate'],        // E2 + E3
  ['/api/payouts',               './routes/payouts'],          // E5
  ['/api/admin/finance',         './routes/financeReports'],   // E4
  ['/api/referrals',             './routes/referrals'],        // H1
  ['/api/loyalty',               './routes/loyalty'],          // H2
  ['/api',                       './routes/campsCompareAndBadges'],  // H3 + H5 (paths inside)
  ['/api/price-alerts',          './routes/priceAlerts'],      // H4
  ['/api/maintenance',           './routes/maintenanceV2'],    // H7
  ['/api/disputes',              './routes/disputesV2'],       // H8
  ['/api',                       './routes/calendars'],        // H9 (paths inside)
  ['/api/chatbot',               './routes/chatbot'],          // D5
  ['/api/cctv',                  './routes/cctv'],             // F4
  ['/api/access',                './routes/accessControl'],    // F5
  ['/api/biometric',             './routes/biometric'],        // F6
  ['/api/erp',                   './routes/erp'],              // G1
  ['/api/companies',             './routes/companies'],        // G2
  ['/api/utilities',             './routes/utilities'],        // G3
];

for (const [mount, modPath] of routes) {
  const fullPath = path.join(__dirname, modPath + '.js');
  if (fs.existsSync(fullPath)) {
    try {
      app.use(mount, require(modPath));
      console.log(`✓ mounted ${mount}`);
    } catch (err) {
      console.error(`✖ failed to mount ${mount}:`, err.message);
      app.use(mount, (_req, res) => res.status(500).json({ error: `Route load failed: ${err.message}` }));
    }
  } else {
    app.use(mount, (_req, res) => res.status(501).json({
      error: 'Not implemented yet',
      hint: `Route module ${modPath} will be added in an upcoming build piece.`,
    }));
  }
}

// ---------- 404 + error handlers ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ---------- Boot ----------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 LaborStay API listening on http://localhost:${PORT}`);
    console.log(`   Version: ${process.env.APP_VERSION || '2.0.0'}`);
    console.log(`   Frontend CORS allowed for: ${FRONTEND_URL}`);
    console.log(`   Database driver: ${process.env.DB_DRIVER || 'sqlite'}`);
    try {
      const scheduler = require('./utils/scheduler');
      scheduler.start();
    } catch (e) {
      console.warn('[boot] scheduler not started:', e.message);
    }
  });
}

module.exports = app;
