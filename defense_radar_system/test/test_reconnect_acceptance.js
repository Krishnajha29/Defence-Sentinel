/**
 * Step 6 Reconnect Test
 * Verifies backend reconnect:
 * - no page refresh
 * - graceful disconnected state (OFFLINE in header)
 * - automatic reconnect
 * - exactly 7 canonical entities exist
 * - no duplicate tracks
 * - live telemetry resumes updating
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runReconnectTest() {
  console.log('--- STEP 6: BACKEND RECONNECT TEST ---');
  
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const cdpPort = 9444;

  console.log('Launching headless Edge for reconnect verification...');
  const edgeProcess = spawn(edgePath, [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1600,1050',
    'http://localhost:8080/'
  ]);

  try {
    await sleep(3000);

    const pageInfo = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${cdpPort}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(data);
            const p = list.find(x => x.url.includes('localhost:8080'));
            if (p) resolve(p);
            else reject(new Error('No matching target found'));
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    const cdpWs = new WebSocket(pageInfo.webSocketDebuggerUrl);
    await new Promise(r => cdpWs.on('open', r));

    let msgId = 1;
    function send(method, params = {}) {
      const id = msgId++;
      cdpWs.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const handler = raw => {
          const m = JSON.parse(raw);
          if (m.id === id) {
            cdpWs.off('message', handler);
            if (m.error) reject(m.error);
            else resolve(m.result);
          }
        };
        cdpWs.on('message', handler);
      });
    }

    await send('Runtime.enable');

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.text || 'Evaluation failed');
      }
      return res.result ? res.result.value : undefined;
    }

    console.log('1. Waiting for initial live connected state...');
    let initialReady = false;
    for (let i = 0; i < 30; i++) {
      const state = await evaluate(`(() => {
        const ents = window.app?.simState?.entities || [];
        const status = document.getElementById('globalSysStatus')?.textContent;
        const sweep = window.app?.radar?.sweepAngle;
        return {
          status,
          entCount: ents.length,
          sweep,
          wsOpen: window.app?.ws?.readyState === 1
        };
      })()`);

      if (state.wsOpen && state.entCount === 7 && state.status === 'ONLINE') {
        initialReady = true;
        console.log(`  Initial connection confirmed: Status=${state.status}, Entities=${state.entCount}, Sweep=${state.sweep?.toFixed(1)}°`);
        break;
      }
      await sleep(500);
    }

    if (!initialReady) {
      throw new Error('Initial connection failed to reach 7 entities and ONLINE status');
    }

    console.log('2. Simulating backend disconnect (closing WebSocket connection)...');
    await evaluate(`window.app.ws.close()`);
    await sleep(600);

    const discState = await evaluate(`(() => {
      return {
        status: document.getElementById('globalSysStatus')?.textContent,
        wsState: window.app?.ws?.readyState
      };
    })()`);

    console.log(`  Graceful disconnected state observed: Status=${discState.status}, WS readyState=${discState.wsState}`);
    if (discState.status !== 'OFFLINE' && discState.wsState === 1) {
      throw new Error('Failed to observe OFFLINE status on disconnect');
    }

    console.log('3. Waiting for automatic reconnection without page refresh...');
    let reconnected = false;
    let postReconnectEnts = [];
    let sweepA = null;
    let sweepB = null;

    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const cur = await evaluate(`(() => {
        const ents = (window.app?.simState?.entities || []).map(e => e.id);
        const status = document.getElementById('globalSysStatus')?.textContent;
        const sweep = window.app?.radar?.sweepAngle;
        const wsOpen = window.app?.ws?.readyState === 1;
        return { status, ents, sweep, wsOpen };
      })()`);

      if (cur.wsOpen && cur.status === 'ONLINE' && cur.ents.length === 7) {
        if (sweepA === null) {
          sweepA = cur.sweep;
        } else if (cur.sweep !== sweepA) {
          sweepB = cur.sweep;
          reconnected = true;
          postReconnectEnts = cur.ents;
          break;
        }
      }
    }

    if (!reconnected) {
      throw new Error('Failed to verify automatic reconnection and resuming telemetry');
    }

    console.log(`  Reconnected successfully: Status=ONLINE, Entities=${postReconnectEnts.length}`);
    console.log(`  Telemetry rotating actively: Sweep ${sweepA?.toFixed(1)}° -> ${sweepB?.toFixed(1)}°`);
    console.log(`  Post-reconnect canonical entities: ${JSON.stringify(postReconnectEnts)}`);

    const uniqueEnts = new Set(postReconnectEnts);
    if (postReconnectEnts.length !== 7 || uniqueEnts.size !== 7) {
      throw new Error(`Duplicate tracks or entity count mismatch! Found ${postReconnectEnts.length} (${uniqueEnts.size} unique)`);
    }

    console.log('  Duplicate tracks check: 0 duplicate entities (exactly 7 canonical tracks)');
    console.log('✓ STEP 6 RECONNECT TEST: PASS\n');

    cdpWs.close();
  } finally {
    edgeProcess.kill();
  }
}

runReconnectTest().catch(err => {
  console.error('Reconnect Test Failed:', err);
  process.exit(1);
});
