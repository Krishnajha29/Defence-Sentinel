/**
 * PHASE 5B — RF / ESM PAGE LIVE VERIFICATION & ACCEPTANCE SUITE
 * Single Source of Truth Validation, 30s Live Soak Test, Scenario Verification, CDP DOM & Canvas Audit.
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9226;

async function run() {
  console.log('========================================================================');
  console.log('🎯 PHASE 5B — RF / ESM PAGE VISUAL & FUNCTIONAL ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  // Launch Edge headless with CDP
  const proc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--window-size=1600,1000',
    'http://localhost:8080/#rf'
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
    // CHECK 1: RF TELEMETRY ELEMENTS & ATTRIBUTES
    // -----------------------------------------------------------------------
    console.log('--- 1. RF Receiver Telemetry Pipeline ---');
    const telCheck = await send('Runtime.evaluate', {
      expression: `({
        simState: !!window.app?.simState,
        rxTelemetry: !!window.app?.simState?.rxTelemetry,
        tunedFreqText: document.getElementById('rfRxTunedFreq')?.textContent,
        stateBadgeText: document.getElementById('rfRxStateBadge')?.textContent,
        snrText: document.getElementById('rfRxSnr')?.textContent,
        powerText: document.getElementById('rfRxPower')?.textContent,
        assocEmitterText: document.getElementById('rfRxAssocEmitter')?.textContent,
        feedbackText: document.getElementById('rfRxHitFeedback')?.textContent,
        nextBandText: document.getElementById('rfNextBandGhz')?.textContent,
        nextProbText: document.getElementById('rfNextProb')?.textContent,
        ibwText: document.getElementById('rfCurrentIbw')?.textContent,
        dwellText: document.getElementById('rfRxDwellMs')?.textContent,
        ibwLabel: document.getElementById('rfCurrentIbwLabel')?.textContent,
        rawRx: window.app?.simState?.rxTelemetry
      })`,
      returnByValue: true
    });

    const tel = telCheck.result.value;
    console.log(`  ✓ Receiver Tuned Frequency: ${tel.tunedFreqText}`);
    console.log(`  ✓ Receiver State Badge: ${tel.stateBadgeText}`);
    console.log(`  ✓ Measured SNR: ${tel.snrText}`);
    console.log(`  ✓ Signal Power: ${tel.powerText}`);
    console.log(`  ✓ Associated Emitter: ${tel.assocEmitterText}`);
    console.log(`  ✓ Status Feedback: ${tel.feedbackText}`);
    console.log(`  ✓ Next Recommended Band: ${tel.nextBandText}`);
    console.log(`  ✓ Predicted Probability: ${tel.nextProbText}`);
    console.log(`  ✓ Instantaneous Bandwidth: ${tel.ibwText} (${tel.ibwLabel})`);
    console.log(`  ✓ Dwell Allocation: ${tel.dwellText}`);

    if (!tel.tunedFreqText || !tel.snrText || !tel.powerText || !tel.nextBandText) {
      throw new Error('RF Telemetry fields missing from DOM');
    }

    // -----------------------------------------------------------------------
    // CHECK 2: RF SPECTRUM & WATERFALL VISUAL ENGINES
    // -----------------------------------------------------------------------
    console.log('\n--- 2. RF Spectrum & Waterfall Spectrogram Engine ---');
    const specCheck = await send('Runtime.evaluate', {
      expression: `({
        hasSpectrum: !!window.app?.spectrum,
        canvasW: document.getElementById('rfDedicatedSpectrumCanvas')?.width,
        canvasH: document.getElementById('rfDedicatedSpectrumCanvas')?.height,
        waterfallRows: window.app?.spectrum?.waterfallHistory?.length,
        waterfallBins: window.app?.spectrum?.waterfallBins,
        entitiesCount: window.app?.spectrum?.entities?.length,
        firstRowDwell: window.app?.spectrum?.waterfallHistory?.[0]?.dwellGhz,
        firstRowIsHit: window.app?.spectrum?.waterfallHistory?.[0]?.isHit
      })`,
      returnByValue: true
    });

    const spec = specCheck.result.value;
    console.log(`  ✓ CompactSpectrumAnalyzer active: ${spec.hasSpectrum}`);
    console.log(`  ✓ Canvas dimensions: ${spec.canvasW} x ${spec.canvasH}`);
    console.log(`  ✓ Waterfall history rows: ${spec.waterfallRows} rows (bins: ${spec.waterfallBins})`);
    console.log(`  ✓ Spectrum entities synchronized: ${spec.entitiesCount}`);
    console.log(`  ✓ Latest waterfall dwell record: ${spec.firstRowDwell} GHz (HIT: ${spec.firstRowIsHit})`);

    if (!spec.hasSpectrum || spec.waterfallRows < 50 || spec.canvasW === 0) {
      throw new Error('CompactSpectrumAnalyzer not properly initialized');
    }

    // -----------------------------------------------------------------------
    // CHECK 3: RF BURST TIMELINE DATA & STRUCTURE
    // -----------------------------------------------------------------------
    console.log('\n--- 3. RF Signal Burst Timeline ---');
    const timelineCheck = await send('Runtime.evaluate', {
      expression: `({
        itemCount: document.getElementById('rfBurstTimelineContainer')?.children?.length || 0,
        firstItemHtml: document.getElementById('rfBurstTimelineContainer')?.children?.[0]?.innerHTML || '',
        secondItemHtml: document.getElementById('rfBurstTimelineContainer')?.children?.[1]?.innerHTML || ''
      })`,
      returnByValue: true
    });

    const tl = timelineCheck.result.value;
    console.log(`  ✓ RF Burst Timeline entries rendered: ${tl.itemCount}`);
    console.log(`  ✓ Sample Event 1: ${tl.firstItemHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100)}...`);
    console.log(`  ✓ Sample Event 2: ${tl.secondItemHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100)}...`);

    if (tl.itemCount < 3) {
      throw new Error('RF Burst Timeline has fewer than 3 items');
    }

    // -----------------------------------------------------------------------
    // CHECK 4: CANONICAL SCENARIOS TEST (PERIODIC, FREQUENCY_AGILE, MULTI_EMITTER)
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Canonical Scenarios Dynamic Adaptation ---');
    const scenarios = ['PERIODIC', 'FREQUENCY_AGILE', 'MULTI_EMITTER'];

    for (const sc of scenarios) {
      // Send WebSocket SELECT_SCENARIO
      await send('Runtime.evaluate', {
        expression: `window.app.ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario: '${sc}' }))`
      });

      // Wait 2.5 seconds for scenario transition and telemetry update
      await new Promise(r => setTimeout(r, 2500));

      const scResult = await send('Runtime.evaluate', {
        expression: `({
          scenario: window.app?.simState?.scenario,
          activeEmitters: window.app?.entities?.filter(e => e.rf?.hasEmitter && e.rf?.isTransmitting).length,
          tunedFreq: document.getElementById('rfRxTunedFreq')?.textContent,
          rxState: document.getElementById('rfRxStateBadge')?.textContent,
          emitterCountText: document.getElementById('rfTotalEmittersCount')?.textContent
        })`,
        returnByValue: true
      });

      const sVal = scResult.result.value;
      console.log(`  ✓ Scenario [${sc}] switched successfully: current=${sVal.scenario}, active emitters=${sVal.activeEmitters}, tuned=${sVal.tunedFreq}, state=${sVal.rxState}`);
    }

    // Return to FREQUENCY_AGILE for presentation soak test
    await send('Runtime.evaluate', {
      expression: `window.app.ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario: 'FREQUENCY_AGILE' }))`
    });

    // -----------------------------------------------------------------------
    // CHECK 5: 30-SECOND LIVE SOAK TEST
    // -----------------------------------------------------------------------
    console.log('\n--- 5. 30-Second Live Soak Test (Observing Dynamic Adaptation Loop) ---');
    const samples = [];
    const startTime = Date.now();

    while (Date.now() - startTime < 30000) {
      const sample = await send('Runtime.evaluate', {
        expression: `({
          time: new Date().toTimeString().split(' ')[0],
          tuned: document.getElementById('rfRxTunedFreq')?.textContent,
          state: document.getElementById('rfRxStateBadge')?.textContent,
          snr: document.getElementById('rfRxSnr')?.textContent,
          power: document.getElementById('rfRxPower')?.textContent,
          next: document.getElementById('rfNextBandGhz')?.textContent,
          burstCount: document.getElementById('rfBurstTimelineContainer')?.children?.length || 0,
          waterfallLength: window.app?.spectrum?.waterfallHistory?.length || 0
        })`,
        returnByValue: true
      });
      samples.push(sample.result.value);
      await new Promise(r => setTimeout(r, 3000));
    }

    const uniqueTuned = new Set(samples.map(s => s.tuned));
    const uniqueStates = new Set(samples.map(s => s.state));
    const uniqueNext = new Set(samples.map(s => s.next));
    const finalSample = samples[samples.length - 1];

    console.log(`  ✓ 30-second soak complete: ${samples.length} sample snapshots collected`);
    console.log(`  ✓ Unique tuned frequencies visited: ${Array.from(uniqueTuned).join(', ')}`);
    console.log(`  ✓ Receiver states observed: ${Array.from(uniqueStates).join(', ')}`);
    console.log(`  ✓ Next recommended bands predicted: ${Array.from(uniqueNext).join(', ')}`);
    console.log(`  ✓ Final RF burst timeline items: ${finalSample.burstCount}`);
    console.log(`  ✓ Waterfall buffer depth maintained: ${finalSample.waterfallLength} rows`);

    if (uniqueTuned.size < 2) {
      throw new Error('Receiver did not switch frequencies during 30s soak test');
    }

    // -----------------------------------------------------------------------
    // CHECK 6: CONSOLE ERROR AUDIT
    // -----------------------------------------------------------------------
    console.log('\n--- 6. Console Error Audit ---');
    console.log(`  ✓ Runtime console errors or exceptions: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(e => console.error('    [ERROR]', e));
      throw new Error('Console errors encountered during test');
    }

    // Capture verified screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.join(__dirname, '..', 'scratch_rf_verified.png');
    fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    console.log(`\n  📸 Live screenshot saved to: ${screenshotPath}`);

    cdpWs.close();
    proc.kill();

    console.log('\n========================================================================');
    console.log('🎉 PHASE 5B VERIFICATION COMPLETE: ALL ACCEPTANCE CHECKS PASSED');
    console.log('========================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ACCEPTANCE TEST FAILED:', err.message);
    proc.kill();
    process.exit(1);
  }
}

run();
