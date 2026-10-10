/**
 * Capture baseline screenshots of all 7 pages at 3 resolutions:
 * - 1920x1080
 * - 1440x900
 * - 1366x768
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9250;
const outputDir = path.join(__dirname, 'baseline_screenshots');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('--- CAPTURING BASELINE SCREENSHOTS ACROSS 7 PAGES & 3 RESOLUTIONS ---');
  
  const resolutions = [
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1366x768', width: 1366, height: 768 }
  ];

  const pages = [
    { id: 'radar', name: '01_tactical_radar' },
    { id: 'rf', name: '02_rf_esm' },
    { id: 'camera', name: '03_optical_context' },
    { id: 'fusion', name: '04_sensor_fusion' },
    { id: 'scheduler', name: '05_adaptive_scheduler' },
    { id: 'analytics', name: '06_analytics_benchmark' },
    { id: 'simulation', name: '07_simulation_demo' }
  ];

  const proc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--window-size=1920,1080',
    'http://localhost:8080/'
  ]);

  try {
    await sleep(3000);

    const pageInfo = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${CDP_PORT}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const list = JSON.parse(data);
          const p = list.find(x => x.url.includes('localhost:8080'));
          if (p) resolve(p); else reject(new Error('Target not found'));
        });
      }).on('error', reject);
    });

    const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let msgId = 1;
    function send(method, params = {}) {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const handler = raw => {
          const m = JSON.parse(raw);
          if (m.id === id) {
            ws.off('message', handler);
            if (m.error) reject(m.error); else resolve(m.result);
          }
        };
        ws.on('message', handler);
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    for (const res of resolutions) {
      console.log(`Setting resolution: ${res.name} (${res.width}x${res.height})`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: res.width,
        height: res.height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await send('Emulation.setVisibleSize', { width: res.width, height: res.height }).catch(() => {});

      for (const p of pages) {
        // Switch page
        await send('Runtime.evaluate', {
          expression: `(() => {
            const btn = document.querySelector('.nav-tab-btn[data-view="${p.id}"]');
            if (btn) btn.click();
          })()`,
          awaitPromise: true
        });

        await sleep(1200);

        // Capture screenshot
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(outputDir, `${p.name}_${res.name}.png`);
        fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
        console.log(`  ✓ Saved: ${p.name}_${res.name}.png`);
      }
    }

    ws.close();
    console.log(`\n🎉 Successfully captured all 21 screenshots in: ${outputDir}`);
  } finally {
    proc.kill();
  }
}

main().catch(err => {
  console.error('Screenshot Capture Failed:', err);
  process.exit(1);
});
