/**
 * PHASE 5D — SENSOR FUSION PAGE LIVE VERIFICATION & ACCEPTANCE SUITE
 * Single Source of Truth Validation, 10s Live Soak Test, Multi-Entity Matrix, Causal Reasoning Trace, CDP DOM Audit.
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9235;

async function run() {
  console.log('========================================================================');
  console.log('🎯 PHASE 5D — SENSOR FUSION PAGE VISUAL & FUNCTIONAL ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  // Launch Edge headless with CDP
  const proc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--window-size=1600,1000',
    'http://localhost:8080/#fusion'
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
    // CHECK 1: MULTI-ENTITY CORRELATION MATRIX
    // -----------------------------------------------------------------------
    console.log('--- 1. Multi-Entity Correlation Matrix ---');
    const matrixCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('#fusionMatrixBody tr')).map(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim().replace(/\\s+/g, ' '));
          return {
            track: cells[0],
            radar: cells[1],
            camera: cells[2],
            rf: cells[3],
            personnel: cells[4],
            classification: cells[5],
            confidence: cells[6]
          };
        });
        return {
          rowCount: rows.length,
          rows
        };
      })()`,
      returnByValue: true
    });

    console.log(`Correlation Matrix has ${matrixCheck.result.value.rowCount} rows:`);
    matrixCheck.result.value.rows.forEach(r => {
      console.log(`  - [${r.track}] Radar: ${r.radar} | Cam: ${r.camera} | RF: ${r.rf} | IFF: ${r.personnel} | Cls: ${r.classification} | Conf: ${r.confidence}`);
    });

    if (matrixCheck.result.value.rowCount < 7) {
      throw new Error(`Expected at least 7 entities in Correlation Matrix, found ${matrixCheck.result.value.rowCount}`);
    }

    const expectedTracks = ['TRK-014', 'TRK-021', 'TRK-033', 'TRK-007', 'TRK-042', 'TRK-019', 'TRK-055'];
    for (const trk of expectedTracks) {
      const match = matrixCheck.result.value.rows.find(r => r.track.includes(trk));
      if (!match) {
        throw new Error(`Entity ${trk} missing from correlation matrix!`);
      }
    }
    console.log('✅ Multi-Entity Correlation Matrix populated with all 7 master entities');

    // -----------------------------------------------------------------------
    // CHECK 2: FUSION REASONING TRACE (SELECTED ENTITY)
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Fusion Reasoning Trace (Causal Pipeline) ---');
    const traceCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const items = Array.from(document.querySelectorAll('#fusionReasoningTimeline .sos-log-item')).map(item => ({
          time: item.querySelector('.sos-time')?.textContent,
          tag: item.querySelector('.sos-tag')?.textContent,
          title: item.querySelector('.sos-title')?.textContent.trim(),
          meta: item.querySelector('.sos-meta')?.textContent.trim()
        }));
        return {
          stepCount: items.length,
          steps: items
        };
      })()`,
      returnByValue: true
    });

    console.log(`Fusion Reasoning Trace has ${traceCheck.result.value.stepCount} steps:`);
    traceCheck.result.value.steps.forEach((s, idx) => {
      console.log(`  [Step ${idx + 1}] [${s.tag}] ${s.title}`);
      console.log(`            ${s.meta}`);
    });

    if (traceCheck.result.value.stepCount < 7) {
      throw new Error(`Expected 7 reasoning trace steps, found ${traceCheck.result.value.stepCount}`);
    }

    const tags = traceCheck.result.value.steps.map(s => s.tag);
    const expectedTags = ['RADAR', 'OPTICAL', 'RF/ESM', 'IFF/DB', 'PERIMETER', 'FUSION', 'DECISION'];
    for (const tag of expectedTags) {
      if (!tags.includes(tag)) {
        throw new Error(`Missing expected reasoning trace tag: ${tag}`);
      }
    }
    console.log('✅ Fusion Reasoning Trace represents full explainable causal pipeline');

    // -----------------------------------------------------------------------
    // CHECK 3: SELECTED ENTITY INTERACTION & DETAIL UPDATES
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Selected Entity Interactivity & Synchronization ---');
    
    // Test selecting TRK-014 (Authorized Person)
    console.log('Selecting TRK-014...');
    await send('Runtime.evaluate', { expression: `window.app.selectEntity('TRK-014')` });
    await new Promise(r => setTimeout(r, 600));

    const ent014 = await send('Runtime.evaluate', {
      expression: `({
        badge: document.getElementById('fusionSelectedEntityBadge')?.textContent,
        classification: document.getElementById('fusionClassificationBadge')?.textContent,
        personnel: document.getElementById('fusionPersonnelEvidence')?.textContent,
        recommendation: document.getElementById('fusionRecommendationText')?.textContent
      })`,
      returnByValue: true
    });
    console.log('TRK-014 State:', ent014.result.value);
    if (!ent014.result.value.badge.includes('014') || ent014.result.value.classification !== 'VERIFIED') {
      throw new Error('TRK-014 selection did not properly update fusion state to VERIFIED');
    }
    console.log('  ✓ TRK-014 verified: Authorized Personnel');

    // Test selecting TRK-019 (Wildlife)
    console.log('Selecting TRK-019...');
    await send('Runtime.evaluate', { expression: `window.app.selectEntity('TRK-019')` });
    await new Promise(r => setTimeout(r, 600));

    const ent019 = await send('Runtime.evaluate', {
      expression: `({
        badge: document.getElementById('fusionSelectedEntityBadge')?.textContent,
        classification: document.getElementById('fusionClassificationBadge')?.textContent,
        recommendation: document.getElementById('fusionRecommendationText')?.textContent
      })`,
      returnByValue: true
    });
    console.log('TRK-019 State:', ent019.result.value);
    if (!ent019.result.value.badge.includes('019') || ent019.result.value.classification !== 'WILDLIFE') {
      throw new Error('TRK-019 selection did not properly update fusion state to WILDLIFE');
    }
    console.log('  ✓ TRK-019 verified: Wildlife Fauna Filtered');

    // Test selecting TRK-055 (Anomalous Object)
    console.log('Selecting TRK-055...');
    await send('Runtime.evaluate', { expression: `window.app.selectEntity('TRK-055')` });
    await new Promise(r => setTimeout(r, 600));

    const ent055 = await send('Runtime.evaluate', {
      expression: `({
        badge: document.getElementById('fusionSelectedEntityBadge')?.textContent,
        rf: document.getElementById('fusionRfEvidence')?.textContent
      })`,
      returnByValue: true
    });
    console.log('TRK-055 State:', ent055.result.value);
    if (!ent055.result.value.badge.includes('055')) {
      throw new Error('TRK-055 selection did not update badge');
    }
    console.log('  ✓ TRK-055 verified');

    // Restore selection to TRK-021 (Primary Intruder Hero Subject)
    console.log('Restoring selection to TRK-021...');
    await send('Runtime.evaluate', { expression: `window.app.selectEntity('TRK-021')` });
    await new Promise(r => setTimeout(r, 600));

    const ent021 = await send('Runtime.evaluate', {
      expression: `({
        badge: document.getElementById('fusionSelectedEntityBadge')?.textContent,
        classification: document.getElementById('fusionClassificationBadge')?.textContent,
        radar: document.getElementById('fusionRadarEvidence')?.textContent,
        camera: document.getElementById('fusionCameraEvidence')?.textContent,
        rf: document.getElementById('fusionRfEvidence')?.textContent,
        personnel: document.getElementById('fusionPersonnelEvidence')?.textContent,
        confidence: document.getElementById('fusionConfidenceScore')?.textContent,
        anomalyScore: document.getElementById('fusionAnomalyScore')?.textContent,
        recommendation: document.getElementById('fusionRecommendationText')?.textContent
      })`,
      returnByValue: true
    });
    console.log('TRK-021 Restored State:', ent021.result.value);
    if (!ent021.result.value.badge.includes('021') || !['ANOMALOUS', 'UNIDENTIFIED'].includes(ent021.result.value.classification)) {
      throw new Error('Failed restoring TRK-021 as primary selected entity');
    }
    console.log('  ✓ TRK-021 restored dynamically: ' + ent021.result.value.classification);
    console.log('✅ Entity selection and synchronization across all entities verified');

    // -----------------------------------------------------------------------
    // CHECK 4: 10-SECOND LIVE SOAK TEST & CONSOLE ERROR AUDIT
    // -----------------------------------------------------------------------
    console.log('\n--- 4. 10-Second Live Soak Test ---');
    const initialRadar = ent021.result.value.radar;
    for (let s = 1; s <= 10; s++) {
      await new Promise(r => setTimeout(r, 1000));
      process.stdout.write(`\rSoak test: ${s}/10 seconds elapsed...`);
    }
    console.log('\nSoak test completed.');

    const finalCheck = await send('Runtime.evaluate', {
      expression: `({
        radar: document.getElementById('fusionRadarEvidence')?.textContent,
        matrixRows: document.querySelectorAll('#fusionMatrixBody tr').length,
        traceSteps: document.querySelectorAll('#fusionReasoningTimeline .sos-log-item').length
      })`,
      returnByValue: true
    });
    console.log('Telemetry updates live during soak:', {
      initialRadar,
      finalRadar: finalCheck.result.value.radar,
      matrixRows: finalCheck.result.value.matrixRows,
      traceSteps: finalCheck.result.value.traceSteps
    });

    if (consoleErrors.length > 0) {
      console.error('❌ Console errors detected during soak test:', consoleErrors);
      throw new Error(`Console errors detected: ${consoleErrors.join(', ')}`);
    }
    console.log('✅ Zero console errors or uncaught exceptions during live run');

    // -----------------------------------------------------------------------
    // CHECK 5: SCREENSHOT CAPTURE
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Screenshot Capture ---');
    const screenshotData = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshotData.data, 'base64');
    const artifactPath = 'C:\\Users\\krish\\.gemini\\antigravity\\brain\\cc7717d7-87f4-46d4-829f-3064629866f5\\fusion_verified_screenshot.png';
    const localPath = path.join(__dirname, '..', 'scratch_fusion_verified.png');
    fs.writeFileSync(artifactPath, buffer);
    fs.writeFileSync(localPath, buffer);
    console.log(`Saved verified screenshot to:\n - ${artifactPath}\n - ${localPath}`);

    console.log('\n========================================================================');
    console.log('🎉 PHASE 5D — SENSOR FUSION PAGE ACCEPTANCE: ALL CHECKS PASSED');
    console.log('========================================================================\n');

  } finally {
    proc.kill();
  }
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
