/* eslint-disable no-console */
const { PrismaClient, MachineStatus, TariffType } = require('@prisma/client');
const WebSocket = require('ws');

const prisma = new PrismaClient();

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
}

function waitForMessage(ws, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timeout waiting for message in ${timeoutMs}ms`));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(msg);
        }
      } catch (err) {
        // ignore parse errors in smoke test
      }
    }

    ws.on('message', onMessage);
  });
}

async function ensureFixtures() {
  const computer = await prisma.computer.upsert({
    where: { ip: '127.0.0.99' },
    create: {
      name: 'PC Smoke',
      ip: '127.0.0.99',
      mac: 'AA-BB-CC-SM-OK-01',
      status: MachineStatus.OFFLINE,
    },
    update: {},
  });

  await prisma.account.upsert({
    where: { username: 'smoke_user' },
    create: {
      username: 'smoke_user',
      balance: 500000,
      bonusMinutes: 0,
    },
    update: {},
  });

  await prisma.tariff.upsert({
    where: { id: 'smoke_hourly_tariff' },
    create: {
      id: 'smoke_hourly_tariff',
      name: 'Smoke Hourly',
      type: TariffType.HOURLY,
      price: 10000,
      minutes: 60,
    },
    update: {},
  });

  return { computer };
}

async function login() {
  const res = await fetch('http://127.0.0.1:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function run() {
  const { computer } = await ensureFixtures();

  const auth = await login();
  console.log('[smoke] login ok, role=', auth.user.role);

  const clientWs = new WebSocket('ws://127.0.0.1:3000/client');
  await waitForOpen(clientWs);
  console.log('[smoke] client ws connected');

  const adminWs = new WebSocket(
    `ws://127.0.0.1:3000/admin?token=${encodeURIComponent(auth.accessToken)}`,
  );
  await waitForOpen(adminWs);
  console.log('[smoke] admin ws connected');

  clientWs.send(
    JSON.stringify({
      type: 'register',
      computerId: computer.id,
    }),
  );
  clientWs.send(
    JSON.stringify({
      type: 'heartbeat',
      computerId: computer.id,
      remainingMinutes: 0,
    }),
  );

  const snapshot = await waitForMessage(
    adminWs,
    (msg) => msg.type === 'snapshot' && Array.isArray(msg.machines),
    10000,
  );
  console.log('[smoke] snapshot received machines=', snapshot.machines.length);

  const commandId = `smoke-cmd-${Date.now()}`;
  adminWs.send(
    JSON.stringify({
      type: 'lock',
      commandId,
      computerId: computer.id,
    }),
  );

  const lockCommand = await waitForMessage(
    clientWs,
    (msg) => msg.type === 'lock' && msg.commandId === commandId,
    10000,
  );
  console.log('[smoke] lock command delivered:', lockCommand.type, lockCommand.commandId);

  clientWs.send(
    JSON.stringify({
      type: 'ack',
      computerId: computer.id,
      commandId,
      status: 'success',
    }),
  );

  const ackResult = await waitForMessage(
    adminWs,
    (msg) =>
      msg.type === 'command-result' &&
      msg.result &&
      msg.result.commandId === commandId &&
      msg.result.status === 'acked',
    10000,
  );
  console.log('[smoke] command-result acked:', ackResult.result.status);

  clientWs.close();
  adminWs.close();
  await prisma.$disconnect();
}

run()
  .then(() => {
    console.log('[smoke] PASS');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[smoke] FAIL', err);
    await prisma.$disconnect();
    process.exit(1);
  });

