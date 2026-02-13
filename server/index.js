const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const parkingRoutes = require('./routes/parking');
const predictionRoutes = require('./routes/prediction');

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api', parkingRoutes);
app.use('/api', predictionRoutes);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── Expose Supabase Anon Key to Frontend ───────────────────────────────────
// This is the PUBLIC anon key — safe to expose in the browser
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  });
});

// ─── Fallback: Serve index.html for SPA ─────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`
  ╔═════════════════════════════════════════════════════════════╗
  ║   SpotTrend Parking System — Server Running                 ║
  ╠═════════════════════════════════════════════════════════════╣
  ║   Dashboard:  http://localhost:${config.port}               ║
  ║   API:        http://localhost:${config.port}/api           ║
  ║   Simulator:  http://localhost:${config.port}/simulate.html ║
  ╚═════════════════════════════════════════════════════════════╝
  `);
});
