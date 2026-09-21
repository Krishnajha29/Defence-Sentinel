/**
 * PHASE 5C — OPTICAL CONTEXT PAGE LIVE VERIFICATION & ACCEPTANCE SUITE
 * Single Source of Truth Validation, 10s Live Soak Test, Camera Switching, DOM & Canvas Audit.
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9228;

async function run() {
  console.log('========================================================================');
  console.log('🎯 PHASE 5C — OPTICAL CONTEXT PAGE VISUAL & FUNCTIONAL ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  // Launch Edge headless with CDP
  const proc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--window-size=1600,1000',
    'http://localhost:8080/#camera'
  ]);

  let consoleErrors = [];

  try {
    await new Promise(resolve => setTimeout(resolve, 2500));

    const pageInfo = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${CDP_PORT}/json`, res => {
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
      return new Promise(resolve => {
        const handler = raw => {
          const m = JSON.parse(raw);
          if (m.id === id) {
            cdpWs.off('message', handler);
            resolve(m.result);
          }
        };
        cdpWs.on('message', handler);
      });
    }

    cdpWs.on('message', raw => {
      try {
        const m = JSON.parse(raw);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
          consoleErrors.push(m.params.args?.map(a => a.value || a.description).join(' '));
        }
        if (m.method === 'Runtime.exceptionThrown') {
          consoleErrors.push(m.params.exceptionDetails?.text || 'Exception thrown');
        }
      } catch (_) {}
    });

    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.enable');

    // Wait 3 seconds for initial connection and state settling
    await new Promise(r => setTimeout(r, 3000));

    // -----------------------------------------------------------------------
    // CHECK 1: OPTICAL VIEWPORT & PROCEDURAL CANVAS
    // -----------------------------------------------------------------------
    console.log('--- 1. Optical Viewport & Procedural Canvas Rendering ---');
    const canvasCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.getElementById('cameraPageCanvas');
        if (!canvas) return { error: 'Canvas not found' };
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return { error: 'Canvas dimensions are 0' };

        // Sample center pixels to ensure procedural scene rendered
        const skyPixel = ctx.getImageData(Math.floor(w * 0.5), Math.floor(h * 0.15), 1, 1).data;
        const groundPixel = ctx.getImageData(Math.floor(w * 0.5), Math.floor(h * 0.75), 1, 1).data;
        const nonZero = skyPixel[0] + skyPixel[1] + skyPixel[2] + groundPixel[0] + groundPixel[1] + groundPixel[2];

        return {
          width: w,
          height: h,
          hasContent: nonZero > 0,
          skyRgb: [skyPixel[0], skyPixel[1], skyPixel[2]],
          groundRgb: [groundPixel[0], groundPixel[1], groundPixel[2]],
          webcamReady: window.app?.camera?.webcamReady,
          webcamErrorHandled: window.app?.camera?.webcamError !== undefined
        };
      })()`,
      returnByValue: true
    });

    console.log('Canvas Status:', canvasCheck.result.value);
    if (!canvasCheck.result.value.hasContent) {
      throw new Error('Canvas appears blank or unrendered!');
    }
    console.log('✅ Canvas has procedural IR scene actively rendering');

    // -----------------------------------------------------------------------
    // CHECK 2: CAMERA TABS & SECTOR SWITCHING
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Camera Switching Across All 4 Tabs ---');
    const tabsCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const tabs = Array.from(document.querySelectorAll('.cam-big-tab-btn')).map(btn => ({
          camId: btn.getAttribute('data-cam'),
          label: btn.textContent.trim().replace(/\\s+/g, ' '),
          isActive: btn.classList.contains('active')
        }));
        return {
          tabCount: tabs.length,
          tabs,
          activeCamId: window.app?.simState?.activeCameraId
        };
      })()`,
      returnByValue: true
    });
    console.log('Camera Tabs found:', tabsCheck.result.value);
    if (tabsCheck.result.value.tabCount !== 4) {
      throw new Error(`Expected 4 camera tabs, found ${tabsCheck.result.value.tabCount}`);
    }
    console.log('✅ All 4 camera tabs present');

    // Test switching to each tab
    for (const camId of ['CAM-02', 'CAM-03', 'CAM-04', 'CAM-01']) {
      await send('Runtime.evaluate', {
        expression: `window.app.selectCamera('${camId}')`
      });
      await new Promise(r => setTimeout(r, 600));

      const swCheck = await send('Runtime.evaluate', {
        expression: `({
          activeCamId: window.app?.simState?.activeCameraId,
          cameraClassCamId: window.app?.camera?.activeCamId,
          activeTab: document.querySelector('.cam-big-tab-btn.active')?.getAttribute('data-cam'),
          corrSector: document.getElementById('camCorrSector')?.textContent
        })`,
        returnByValue: true
      });
      console.log(`Switched to ${camId}:`, swCheck.result.value);
      if (swCheck.result.value.activeTab !== camId) {
        throw new Error(`Failed switching tab to ${camId}`);
      }
    }
    console.log('✅ Camera switching verified across all 4 sectors');

    // -----------------------------------------------------------------------
    // CHECK 3: ACTIVE FOV DETECTIONS & AVATAR PROJECTIONS
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Active FOV Detections & Avatars ---');
    // Ensure CAM-01 is active for hero track TRK-021
    await send('Runtime.evaluate', {
      expression: `window.app.selectCamera('CAM-01')`
    });
    await new Promise(r => setTimeout(r, 800));

    const detCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const countText = document.getElementById('camDetectionsCount')?.textContent;
        const detCards = Array.from(document.querySelectorAll('#camDetectionListContainer .cam-det-card')).map(c => c.textContent.trim().replace(/\\s+/g, ' '));
        const visibleEnts = (window.app?.entities || []).filter(e => e.camera?.visibleCamId === 'CAM-01' && e.camera?.isVisuallyConfirmed);
        
        return {
          countText,
          detCardCount: detCards.length,
          detCards,
          visibleEntsCount: visibleEnts.length,
          visibleIds: visibleEnts.map(e => ({ id: e.id, cvId: e.camera?.detectionId, conf: e.camera?.confidence, type: e.camera?.typeLabel }))
        };
      })()`,
      returnByValue: true
    });
    console.log('CAM-01 Detections:', detCheck.result.value);
    if (detCheck.result.value.visibleEntsCount === 0) {
      throw new Error('Expected at least 1 entity visible in CAM-01 FOV!');
    }
    console.log('✅ Active FOV detections verified in CAM-01');

    // -----------------------------------------------------------------------
    // CHECK 4: RADAR ↔ CAMERA CORRELATION PANEL
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Radar ↔ Camera Correlation Panel ---');
    const corrCheck = await send('Runtime.evaluate', {
      expression: `({
        radarId: document.getElementById('camCorrRadarId')?.textContent,
        cvDetId: document.getElementById('camCorrDetId')?.textContent,
        status: document.getElementById('camCorrStatus')?.textContent,
        conf: document.getElementById('camCorrConf')?.textContent,
        sector: document.getElementById('camCorrSector')?.textContent
      })`,
      returnByValue: true
    });
    console.log('Correlation Panel:', corrCheck.result.value);
    if (!corrCheck.result.value.radarId || !corrCheck.result.value.cvDetId || corrCheck.result.value.cvDetId.includes('--')) {
      throw new Error('Camera correlation panel missing live data!');
    }
    console.log('✅ Correlation panel verified with live track-to-optical correlation');

    // -----------------------------------------------------------------------
    // CHECK 5: OPTICAL EVENT LOG
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Optical Event Log ---');
    const logCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const items = Array.from(document.querySelectorAll('#camOpticalEventLog .sos-log-item')).map(item => ({
          time: item.querySelector('.sos-time')?.textContent,
          tag: item.querySelector('.sos-tag')?.textContent,
          title: item.querySelector('.sos-title')?.textContent.trim(),
          meta: item.querySelector('.sos-meta')?.textContent.trim()
        }));
        return {
          logCount: items.length,
          recentLogs: items.slice(0, 5)
        };
      })()`,
      returnByValue: true
    });
    console.log('Optical Event Log:', logCheck.result.value);
    if (logCheck.result.value.logCount === 0) {
      throw new Error('Optical Event Log is empty!');
    }
    console.log('✅ Optical Event Log populated with dedicated camera events');

    // -----------------------------------------------------------------------
    // CHECK 6: 10-SECOND LIVE SOAK TEST & CONSOLE ERROR AUDIT
    // -----------------------------------------------------------------------
    console.log('\n--- 6. 10-Second Live Soak Test ---');
    for (let s = 1; s <= 10; s++) {
      await new Promise(r => setTimeout(r, 1000));
      process.stdout.write(`\rSoak test: ${s}/10 seconds elapsed...`);
    }
    console.log('\nSoak test completed.');

    if (consoleErrors.length > 0) {
      console.error('❌ Console errors detected during soak test:', consoleErrors);
      throw new Error(`Console errors detected: ${consoleErrors.join(', ')}`);
    }
    console.log('✅ Zero console errors or uncaught exceptions during live run');

    // -----------------------------------------------------------------------
    // CHECK 7: SCREENSHOT CAPTURE
    // -----------------------------------------------------------------------
    console.log('\n--- 7. Screenshot Capture ---');
    const screenshotData = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshotData.data, 'base64');
    const artifactPath = 'C:\\Users\\krish\\.gemini\\antigravity\\brain\\cc7717d7-87f4-46d4-829f-3064629866f5\\camera_verified_screenshot.png';
    const localPath = path.join(__dirname, '..', 'scratch_camera_verified.png');
    fs.writeFileSync(artifactPath, buffer);
    fs.writeFileSync(localPath, buffer);
    console.log(`Saved verified screenshot to:\n - ${artifactPath}\n - ${localPath}`);

    console.log('\n========================================================================');
    console.log('🎉 PHASE 5C — OPTICAL CONTEXT PAGE ACCEPTANCE: ALL CHECKS PASSED');
    console.log('========================================================================\n');

  } finally {
    proc.kill();
  }
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
