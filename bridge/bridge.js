#!/usr/bin/env node
// ORCA Ireland — Decoder bridge.
//
// Reads config.json, connects to a transponder decoder (TCP or serial),
// parses the stream with the matching protocol parser, and exposes a
// WebSocket server on localhost (and LAN) that emits normalized crossings:
//   { transponder: "12345", timestamp: 1713100000000, source: "amb", ... }
//
// Runs on a Raspberry Pi in the pit box. One service, always on, no laptop
// needed.
//
// Usage:   node bridge.js [path/to/config.json]
// Default: ./config.json in this directory.

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { WebSocketServer } = require('ws');

const { AmbParser }       = require('./parsers/amb');
const { P3Parser }        = require('./parsers/p3');
const { ILapParser }      = require('./parsers/ilap');
const { TrackmateParser } = require('./parsers/trackmate');

const PARSERS = {
  amb:       AmbParser,
  p3:        P3Parser,
  ilap:      ILapParser,
  trackmate: TrackmateParser,
};

const configPath = process.argv[2] || path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error(`[bridge] config not found: ${configPath}`);
  console.error(`[bridge] copy config.example.json → config.json and edit.`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const log = (...a) => console.log(new Date().toISOString(), ...a);

const ParserClass = PARSERS[cfg.decoder];
if (!ParserClass) {
  console.error(`[bridge] unknown decoder: ${cfg.decoder}`);
  console.error(`[bridge] supported: ${Object.keys(PARSERS).join(', ')}`);
  process.exit(1);
}

// ─────────────── WebSocket server (browser clients connect here) ───────────────
const wsPort = cfg.wsPort || 2346;
const httpServer = http.createServer((req, res) => {
  // Small status endpoint for health checks.
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, decoder: cfg.decoder,
      connection: cfg.connection || (cfg.serialPort ? 'serial' : 'tcp'),
      decoderConnected,
      clients: wss.clients.size,
      uptimeSec: Math.round(process.uptime()),
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`ORCA decoder bridge — decoder=${cfg.decoder} ws=${wsPort}\n`);
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(wsPort, () => {
  log(`[bridge] WebSocket listening on :${wsPort}`);
});

function broadcast(msg) {
  const text = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

// Notify clients when decoder status changes so the UI can show it.
let decoderConnected = false;
function setDecoderConnected(v, detail = null) {
  if (decoderConnected === v) return;
  decoderConnected = v;
  broadcast({ type: 'status', decoderConnected: v, decoder: cfg.decoder, detail });
  log(`[bridge] decoder ${v ? 'CONNECTED' : 'DISCONNECTED'}`, detail || '');
}

wss.on('connection', (ws) => {
  log(`[bridge] browser connected (${wss.clients.size} total)`);
  // Tell the newcomer our current status immediately.
  ws.send(JSON.stringify({
    type: 'status', decoderConnected, decoder: cfg.decoder,
  }));
  ws.on('close', () => log(`[bridge] browser disconnected (${wss.clients.size} total)`));
});

// ─────────────── Parser — shared instance, fed by whichever source wins ───────
const parser = new ParserClass((crossing) => {
  // Forward to all connected browsers.
  broadcast({ type: 'crossing', ...crossing });
  log(`[bridge] crossing t=${crossing.transponder}`);
}, log);

// ─────────────── Source: TCP (the AMB/Ethernet case) ──────────────────────────
function connectTcp() {
  const { host, port } = cfg;
  if (!host || !port) {
    log(`[bridge] tcp mode selected but host/port missing in config`);
    return;
  }
  const sock = new net.Socket();
  let retryMs = 2000;

  sock.on('connect', () => {
    log(`[bridge] tcp connected ${host}:${port}`);
    retryMs = 2000;
    setDecoderConnected(true, `${host}:${port}`);
  });
  sock.on('data', (chunk) => parser.feed(chunk));
  sock.on('error', (err) => {
    log(`[bridge] tcp error:`, err.message);
    setDecoderConnected(false, err.message);
  });
  sock.on('close', () => {
    setDecoderConnected(false);
    log(`[bridge] tcp closed, reconnecting in ${retryMs}ms`);
    setTimeout(() => {
      retryMs = Math.min(retryMs * 1.5, 15000);
      sock.connect(port, host);
    }, retryMs);
  });

  sock.connect(port, host);
}

// ─────────────── Source: serial (USB/RS-232) ──────────────────────────────────
function connectSerial() {
  let SerialPort;
  try { ({ SerialPort } = require('serialport')); }
  catch {
    log(`[bridge] serial mode requires 'serialport' — run: npm install serialport`);
    return;
  }
  const open = () => {
    const port = new SerialPort({
      path: cfg.serialPort, baudRate: cfg.serialBaud || 19200,
    });
    port.on('open', () => {
      log(`[bridge] serial opened ${cfg.serialPort}@${cfg.serialBaud || 19200}`);
      setDecoderConnected(true, cfg.serialPort);
    });
    port.on('data', (chunk) => parser.feed(chunk));
    port.on('error', (err) => {
      log(`[bridge] serial error:`, err.message);
      setDecoderConnected(false, err.message);
    });
    port.on('close', () => {
      setDecoderConnected(false);
      log(`[bridge] serial closed, reopening in 3s`);
      setTimeout(open, 3000);
    });
  };
  open();
}

// ─────────────── Source: simulator (no hardware, random crossings) ─────────────
function connectSimulator() {
  log(`[bridge] simulator mode — emitting fake crossings every 8-14s`);
  setDecoderConnected(true, 'simulator');
  const transponders = ['10001', '10002', '10003', '10004'];
  const tick = () => {
    const t = transponders[Math.floor(Math.random() * transponders.length)];
    broadcast({ type: 'crossing', transponder: t, timestamp: Date.now(),
      source: 'simulator' });
    log(`[bridge] simulated crossing t=${t}`);
    setTimeout(tick, 8000 + Math.random() * 6000);
  };
  setTimeout(tick, 3000);
}

// ─────────────── Start the right source ───────────────────────────────────────
if (cfg.simulate) {
  connectSimulator();
} else if (cfg.connection === 'serial' || (!cfg.connection && cfg.serialPort && !cfg.host)) {
  connectSerial();
} else {
  connectTcp();
}

// ─────────────── Graceful shutdown ────────────────────────────────────────────
function shutdown() {
  log(`[bridge] shutting down`);
  try { wss.close(); } catch {}
  try { httpServer.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
