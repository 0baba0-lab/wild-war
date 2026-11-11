const express = require("express");

module.exports = function createPresenceRouter(getSession) {
  const router = express.Router();
  const clients = new Map();
  const reconnectGrace = 750;
  const heartbeatTimeout = 8_000;
  let lastCount = 0;
  let ticks = 0;

  function broadcast(message) {
    for (const client of clients.values()) {
      for (const response of client.streams) {
        if (!response.writableEnded && !response.destroyed) {
          if (response.writableNeedDrain) response.destroy();
          else response.write(message);
        }
      }
    }
  }

  function countOnline() {
    const cutoff = Date.now() - heartbeatTimeout;
    let count = 0;
    for (const client of clients.values()) {
      if (client.lastSignal > cutoff) count++;
    }
    return count;
  }

  function publishCount() {
    const count = countOnline();
    if (count !== lastCount) {
      lastCount = count;
      broadcast(`data: ${JSON.stringify({ count })}\n\n`);
    }
    return count;
  }

  router.get("/", (req, res) => {
    const session = getSession(req, res);
    const client = clients.get(session);
    if (client?.streams.size) client.lastSignal = Date.now();
    res.json({ count: publishCount() });
  });

  router.get("/stream", (req, res) => {
    const session = getSession(req, res);
    let client = clients.get(session);
    if (!client) {
      client = { streams: new Set(), lastSignal: 0, reconnectTimer: null };
      clients.set(session, client);
    }
    clearTimeout(client.reconnectTimer);
    client.lastSignal = Date.now();
    client.streams.add(res);

    res.set("Content-Type", "text/event-stream");
    res.set("Cache-Control", "no-store, no-transform");
    res.flushHeaders();
    res.write("retry: 1000\n\n");
    res.write(`data: ${JSON.stringify({ count: countOnline() })}\n\n`);
    publishCount();

    res.once("close", () => {
      client.streams.delete(res);
      if (client.streams.size) return;
      client.reconnectTimer = setTimeout(() => {
        clients.delete(session);
        publishCount();
      }, reconnectGrace);
      client.reconnectTimer.unref();
    });
  });

  const maintenance = setInterval(() => {
    publishCount();
    if (++ticks % 15 === 0) broadcast(": keepalive\n\n");
  }, 1_000);
  maintenance.unref();
  return router;
};
