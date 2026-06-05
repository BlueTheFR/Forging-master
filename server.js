const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
const clients = new Map();
let idCounter = 0;

function timestamp() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function getOnlineList() {
  const list = [];
  for (const [, info] of clients) {
    if (info.name) list.push({ name: info.name, icon: info.icon, power: info.power, forgeLv: info.forgeLv, wave: info.wave });
  }
  return list;
}

wss.on('connection', (ws) => {
  const id = ++idCounter;
  clients.set(ws, { id });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'join': {
          const info = clients.get(ws);
          info.name = msg.name || 'Unknown';
          info.icon = msg.icon || '👨';
          info.power = msg.power || 0;
          info.forgeLv = msg.forgeLv || 0;
          info.wave = msg.wave || 0;
          info.equipped = msg.equipped || null;
          clients.set(ws, info);
          broadcast({ type: 'system', message: `${info.name} joined the game!`, timestamp: timestamp() }, ws);
          ws.send(JSON.stringify({ type: 'players', players: getOnlineList().filter(p => p.name !== info.name) }));
          break;
        }
        case 'chat': {
          const info = clients.get(ws);
          if (!info || !info.name) return;
          broadcast({
            type: 'chat',
            icon: info.icon,
            name: info.name,
            power: info.power,
            message: msg.message.slice(0, 200),
            timestamp: timestamp()
          });
          break;
        }
        case 'update': {
          const info = clients.get(ws);
          if (info && msg.data) {
            if (msg.data.power !== undefined) info.power = msg.data.power;
            if (msg.data.icon !== undefined) info.icon = msg.data.icon;
            if (msg.data.name !== undefined) info.name = msg.data.name;
            if (msg.data.forgeLv !== undefined) info.forgeLv = msg.data.forgeLv;
            if (msg.data.wave !== undefined) info.wave = msg.data.wave;
            if (msg.data.equipped !== undefined) info.equipped = msg.data.equipped;
            clients.set(ws, info);
          }
          break;
        }
        case 'getStats': {
          let target = null;
          for (const [, info] of clients) {
            if (info.name === msg.name) { target = info; break; }
          }
          if (target) {
            ws.send(JSON.stringify({
              type: 'stats',
              name: target.name,
              icon: target.icon,
              power: target.power,
              forgeLv: target.forgeLv || 0,
              wave: target.wave || 0,
              equipped: target.equipped || null,
              online: true
            }));
          } else {
            ws.send(JSON.stringify({ type: 'stats', name: msg.name, online: false }));
          }
          break;
        }
      }
    } catch (e) {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info && info.name) {
      broadcast({ type: 'system', message: `${info.name} left the game.`, timestamp: timestamp() });
    }
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// Ping to keep connections alive
setInterval(() => {
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }
}, 30000);

console.log(`Forging Master Chat Server running on port ${PORT}`);
