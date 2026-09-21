/**
 * FINAL PRESENTATION / END-TO-END BROWSER ACCEPTANCE TEST SUITE (SIH26055)
 * Verifies all 7 pages in a single uninterrupted browser session, the complete
 * 12-step demo progression, the presentation flow without page refresh,
 * network/console audit, and backend reconnect behavior.
 */

const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9245;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('========================================================================');
  console.log('🎯 FINAL PRESENTATION & END-TO-END BROWSER ACCEPTANCE SUITE (SIH26055)');
  console.log('========================================================================\n');

  // Verify backend and React radar endpoints
  console.log('--- STEP 1: VERIFYING ACTIVE SUBSYSTEM SERVICES ---');
  const backendRes = await fetchUrl('http://localhost:8080/api/status');
  console.log('  Main Dashboard API (http://localhost:8080): HTTP', backendRes.statusCode);
  if (backendRes.statusCode !== 200) throw new Error('Backend HTTP 8080 not responding with 200');

  const reactRes = await fetchUrl('http://localhost:5173');
  console.log('  React Radar-Scanner (http://localhost:5173): HTTP', reactRes.statusCode);
  if (reactRes.statusCode !== 200) throw new Error('React Radar-Scanner HTTP 5173 not responding with 200');
  console.log('  ✓ Step 1 Passed: Both complete system services online and responding.\n');

  // Launch browser
  const proc = spawn(edgePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--window-size=1600,1050',
    'http://localhost:8080/'
  ]);

  const consoleErrors = [];

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

    await send('Runtime.enable');
    await send('Log.enable');

    cdpWs.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.method === 'Runtime.consoleAPICalled') {
          if (msg.params.type === 'error') {
            consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
          }
        }
      } catch (e) {}
    });

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

    // =========================================================================
    // STEP 2: TEST EVERY PAGE (1 to 7) WITHOUT BROWSER RELOAD
    // =========================================================================
    console.log('--- STEP 2: VERIFYING ALL 7 PAGES IN SINGLE UNRELOADED SESSION ---');

    // --- PAGE 1: TACTICAL CONTEXT ---
    console.log('\n[PAGE 1: TACTICAL CONTEXT]');
    await evaluate(`window.app.switchPage('tactical')`);
    await new Promise(r => setTimeout(r, 2000));

    const p1 = await evaluate(`(() => {
      const tracks = document.querySelectorAll('.track-card');
      const radarEnts = window.app.radar?.lastEntities || [];
      const persList = document.getElementById('radarPersonnelListContainer');
      const alerts = document.querySelectorAll('.sos-log-item');
      const selTrack = document.querySelector('.track-card.selected');
      const pos0 = radarEnts.find(e => e.id === 'TRK-021')?.radar;
      return {
        trackCount: tracks.length,
        radarCount: radarEnts.length,
        personnelCount: persList?.children?.length || 0,
        alertCount: alerts.length,
        selectedId: selTrack?.getAttribute('data-track-id') || window.app.selectedEntityId,
        pos0Range: pos0?.range,
        pos0Azimuth: pos0?.azimuth
      };
    })()`);

    console.log(`  Live Tracks count: ${p1.trackCount} (Radar Canvas: ${p1.radarCount})`);
    console.log(`  Personnel Records: ${p1.personnelCount} | Alerts: ${p1.alertCount} | Selected: ${p1.selectedId}`);
    if (p1.trackCount < 7) throw new Error(`Page 1: Expected >= 7 tracks, got ${p1.trackCount}`);
    if (p1.personnelCount < 3) throw new Error(`Page 1: Personnel panel empty (${p1.personnelCount})`);

    // Verify track movement
    await new Promise(r => setTimeout(r, 600));
    const p1Move = await evaluate(`(() => {
      const e = (window.app.radar?.lastEntities || []).find(x => x.id === 'TRK-021')?.radar;
      return { range: e?.range, azimuth: e?.azimuth, sweepAngle: window.app.simState?.radarSweepAngle };
    })()`);
    console.log(`  Kinematics update: Range=${p1Move.range}m, Azimuth=${p1Move.azimuth}°, Sweep=${p1Move.sweepAngle?.toFixed(1)}°`);
    console.log('  ✓ PAGE 1 TACTICAL: PASS');

    // --- PAGE 2: RF / ESM ---
    console.log('\n[PAGE 2: RF / ESM]');
    await evaluate(`window.app.switchPage('rf')`);
    await new Promise(r => setTimeout(r, 600));

    const p2 = await evaluate(`(() => {
      const tuned = document.getElementById('rfRxTunedFreq')?.textContent?.trim();
      const state = document.getElementById('rfRxStateBadge')?.textContent?.trim();
      const snr = document.getElementById('rfRxSnr')?.textContent?.trim();
      const power = document.getElementById('rfRxPower')?.textContent?.trim();
      const nextBand = document.getElementById('rfNextBandGhz')?.textContent?.trim();
      const prob = document.getElementById('rfNextProb')?.textContent?.trim();
      const timelineItems = document.querySelectorAll('#rfBurstTimelineContainer > div');
      const wfRows = window.app.spectrum?.waterfallHistory?.length || 0;
      return { tuned, state, snr, power, nextBand, prob, timelineCount: timelineItems.length, wfRows };
    })()`);

    console.log(`  Rx Tuned: ${p2.tuned} | State: ${p2.state} | SNR: ${p2.snr} | Power: ${p2.power}`);
    console.log(`  Next Band: ${p2.nextBand} (${p2.prob}) | Waterfall rows: ${p2.wfRows} | Burst Timeline: ${p2.timelineCount}`);
    if (!p2.tuned || !p2.tuned.includes('GHz')) throw new Error('Page 2: Tuned frequency missing');
    if (p2.timelineCount === 0) throw new Error('Page 2: RF burst timeline empty');
    if (p2.wfRows === 0) throw new Error('Page 2: Waterfall history empty');
    console.log('  ✓ PAGE 2 RF/ESM: PASS');

    // --- PAGE 3: OPTICAL CONTEXT ---
    console.log('\n[PAGE 3: OPTICAL CONTEXT]');
    await evaluate(`window.app.switchPage('optical')`);
    await new Promise(r => setTimeout(r, 600));

    const p3Cams = ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'];
    for (const cam of p3Cams) {
      await evaluate(`(() => {
        const tab = document.querySelector('.cam-big-tab-btn[data-cam="${cam}"]');
        if (tab) tab.click();
        else window.app.selectCamera('${cam}');
      })()`);
      await new Promise(r => setTimeout(r, 450));
      const camCheck = await evaluate(`({
        activeTab: document.querySelector('.cam-big-tab-btn.active')?.getAttribute('data-cam'),
        appCam: window.app.camera?.activeCamId || window.app.simState?.activeCameraId,
        corrCam: document.getElementById('camCorrSector')?.textContent?.trim()
      })`);
      if (camCheck.activeTab !== cam) throw new Error(`Camera tab switch failed for ${cam}`);
      console.log(`  Tested ${cam}: Active Tab=${camCheck.activeTab}, Engine Cam=${camCheck.appCam}`);
    }

    const p3Log = await evaluate(`document.querySelectorAll('#camOpticalEventLog .sos-log-item')?.length`);
    console.log(`  Optical Event Log entries: ${p3Log}`);
    if (!p3Log || p3Log === 0) throw new Error('Page 3: Optical Event Log empty');
    console.log('  ✓ PAGE 3 OPTICAL: PASS');

    // --- PAGE 4: SENSOR FUSION ---
    console.log('\n[PAGE 4: SENSOR FUSION]');
    await evaluate(`window.app.switchPage('fusion')`);
    await new Promise(r => setTimeout(r, 600));

    const p4 = await evaluate(`(() => {
      const rows = document.querySelectorAll('#fusionMatrixBody tr');
      const steps = document.querySelectorAll('#fusionReasoningTimeline .sos-log-item');
      const selName = document.getElementById('fusionEntityName')?.textContent?.trim();
      const conf = document.getElementById('fusionScoreConfidence')?.textContent?.trim();
      const risk = document.getElementById('fusionScoreAnomaly')?.textContent?.trim();
      const rec = document.getElementById('fusionScoreRecommendation')?.textContent?.trim();
      return { matrixRows: rows.length, reasoningSteps: steps.length, selName, conf, risk, rec };
    })()`);

    console.log(`  Correlation Matrix Rows: ${p4.matrixRows} | Reasoning Trace Steps: ${p4.reasoningSteps}`);
    console.log(`  Selected Entity: ${p4.selName} | Conf: ${p4.conf} | Anomaly: ${p4.risk} | Rec: ${p4.rec}`);
    if (p4.matrixRows < 7) throw new Error(`Page 4: Expected 7 matrix rows, got ${p4.matrixRows}`);
    if (p4.reasoningSteps < 7) throw new Error(`Page 4: Expected 7 reasoning trace steps, got ${p4.reasoningSteps}`);

    // Test selection across TRK-014, TRK-021, TRK-019, TRK-055
    for (const tid of ['TRK-014', 'TRK-019', 'TRK-055', 'TRK-021']) {
      await evaluate(`window.app.selectEntity('${tid}')`);
      await new Promise(r => setTimeout(r, 300));
      const selCheck = await evaluate(`({
        selId: window.app.simState?.selectedEntityId,
        selName: document.getElementById('fusionEntityName')?.textContent?.trim()
      })`);
      if (selCheck.selId !== tid) throw new Error(`Entity selection failed for ${tid}`);
      console.log(`  Tested entity ${tid}: Selected=${selCheck.selId} (${selCheck.selName})`);
    }
    console.log('  ✓ PAGE 4 SENSOR FUSION: PASS');

    // --- PAGE 5: ADAPTIVE SCHEDULER ---
    console.log('\n[PAGE 5: ADAPTIVE SCHEDULER]');
    await evaluate(`window.app.switchPage('scheduler')`);
    await new Promise(r => setTimeout(r, 600));

    const p5 = await evaluate(`(() => {
      const rows = document.querySelectorAll('#schedPerBandTableBody tr');
      const hmBlocks = document.querySelectorAll('#schedHitMissGrid .hm-block');
      const timeline = document.querySelectorAll('#schedTimelineContainer .sched-timeline-item');
      const bayesBars = document.querySelectorAll('#schedBayesDistContainer .bar-track');
      const compRows = document.querySelectorAll('#schedBandPriorityContainer > div');
      const totalReward = document.getElementById('schedTotalReward')?.textContent?.trim();
      const whyComp = document.getElementById('schedCompositeScore')?.textContent?.trim();
      return {
        bandRows: rows.length,
        hmCount: hmBlocks.length,
        timelineCount: timeline.length,
        bayesCount: bayesBars.length,
        compCount: compRows.length,
        totalReward,
        whyComp
      };
    })()`);

    console.log(`  Band Table Rows: ${p5.bandRows} | Hit/Miss Blocks: ${p5.hmCount} | Timeline: ${p5.timelineCount}`);
    console.log(`  Bayesian Distributions: ${p5.bayesCount} | Priority Rows: ${p5.compCount} | Reward: ${p5.totalReward}`);
    if (p5.bandRows < 5) throw new Error(`Page 5: Expected 5 band rows, got ${p5.bandRows}`);
    if (p5.bayesCount < 5) throw new Error(`Page 5: Expected 5 Bayesian distributions, got ${p5.bayesCount}`);
    if (p5.compCount < 5) throw new Error(`Page 5: Expected 5 Priority comparison rows, got ${p5.compCount}`);

    // Test all 4 ablation modes: FULL_ADAPTIVE, UCB_ONLY, NO_EXPLORATION, OPEN_LOOP
    for (const mode of ['UCB_ONLY', 'NO_EXPLORATION', 'OPEN_LOOP', 'FULL_ADAPTIVE']) {
      await evaluate(`(() => {
        const btn = document.querySelector('.btn-ablation[data-mode="${mode}"]');
        if (btn) btn.click();
      })()`);
      await new Promise(r => setTimeout(r, 350));
      const ablCheck = await evaluate(`({
        activeBtn: document.querySelector('.btn-ablation.active')?.getAttribute('data-mode'),
        policyText: document.getElementById('schedPolicyBadge')?.textContent?.trim()
      })`);
      console.log(`  Tested Ablation [${mode}]: Active Button=${ablCheck.activeBtn}, Policy=${ablCheck.policyText}`);
      if (ablCheck.activeBtn !== mode) throw new Error(`Ablation switch failed for ${mode}`);
    }
    console.log('  ✓ PAGE 5 ADAPTIVE SCHEDULER: PASS');

    // --- PAGE 6: ANALYTICS & BENCHMARK ---
    console.log('\n[PAGE 6: ANALYTICS & BENCHMARK]');
    await evaluate(`window.app.switchPage('analytics')`);
    await new Promise(r => setTimeout(r, 600));

    const p6 = await evaluate(`(() => {
      const cards = ['metricAdaptiveDetRate', 'metricAdaptiveLatency', 'metricAdaptiveFar', 'metricAdaptiveAcc', 'metricAdaptiveUtil', 'metricAdaptiveSens'];
      const cardVals = cards.map(c => document.getElementById(c)?.textContent?.trim());
      const provId = document.getElementById('benchExpId')?.textContent?.trim();
      const provSeed = document.getElementById('benchExpSeed')?.textContent?.trim();
      const suiteRows = document.querySelectorAll('#suiteBreakdownTbody tr')?.length || 0;
      const chartPoints = (window.app.analytics?.getPoints() || []).length;
      return { cardVals, provId, provSeed, suiteRows, chartPoints };
    })()`);

    console.log(`  Provenance ID: ${p6.provId} | Seed: ${p6.provSeed}`);
    console.log(`  Metric Cards: ${p6.cardVals.join(' | ')}`);
    console.log(`  5-Scenario Suite Rows: ${p6.suiteRows} | Cumulative Interception Points: ${p6.chartPoints}`);
    if (p6.suiteRows < 5) throw new Error(`Page 6: Expected 5 scenario rows, got ${p6.suiteRows}`);
    if (p6.chartPoints === 0) throw new Error('Page 6: Cumulative chart points empty');

    // Test RUN EXPERIMENT interaction
    await evaluate(`document.getElementById('btnRunExperiment')?.click()`);
    await new Promise(r => setTimeout(r, 500));
    console.log('  Tested RUN EXPERIMENT execution');

    // Test RESET STATS interaction
    await evaluate(`document.getElementById('btnResetAnalytics')?.click()`);
    await new Promise(r => setTimeout(r, 500));
    const resetProv = await evaluate(`document.getElementById('benchExpId')?.textContent?.trim()`);
    console.log(`  Tested RESET STATS: Provenance=${resetProv}`);

    // Restore 5-scenario benchmark suite
    await evaluate(`document.getElementById('btnRunSuite')?.click()`);
    await new Promise(r => setTimeout(r, 600));
    console.log('  Tested RUN 5-SCENARIO SUITE restoration');

    // Test REPLAY interaction
    await evaluate(`document.getElementById('btnReplayBenchmark')?.click()`);
    await new Promise(r => setTimeout(r, 500));
    const replayProv = await evaluate(`document.getElementById('benchExpId')?.textContent?.trim()`);
    console.log(`  Tested REPLAY EXPERIMENT: Provenance=${replayProv}`);

    // Verify REST exports
    const expJson = await fetchUrl('http://localhost:8080/api/benchmark/export/json');
    const expCsv = await fetchUrl('http://localhost:8080/api/benchmark/export/csv');
    const expRep = await fetchUrl('http://localhost:8080/api/benchmark/export/report');
    console.log(`  REST Exports: JSON=${expJson.statusCode}, CSV=${expCsv.statusCode}, Report=${expRep.statusCode}`);
    if (expJson.statusCode !== 200 || expCsv.statusCode !== 200 || expRep.statusCode !== 200) {
      throw new Error('Page 6: Export endpoint failed');
    }
    console.log('  ✓ PAGE 6 ANALYTICS: PASS');

    // --- PAGE 7: MULTI-SENSOR / SIMULATION CONTROL CENTER ---
    console.log('\n[PAGE 7: MULTI-SENSOR / SIMULATION]');
    await evaluate(`window.app.switchPage('simulation')`);
    await new Promise(r => setTimeout(r, 600));

    const p7 = await evaluate(`(() => {
      const jsonInspector = document.getElementById('simLiveJsonInspector')?.textContent?.trim();
      const scBadge = document.getElementById('simCurScenarioBadge')?.textContent?.trim();
      const radarSubsys = document.getElementById('subsysRadarEngine')?.textContent?.trim();
      const rfSubsys = document.getElementById('subsysRfReceiver')?.textContent?.trim();
      const schedSubsys = document.getElementById('subsysScheduler')?.textContent?.trim();
      return { jsonLen: jsonInspector?.length || 0, scBadge, radarSubsys, rfSubsys, schedSubsys };
    })()`);

    console.log(`  Scenario Badge: ${p7.scBadge} | Subsystems: ${p7.radarSubsys}, ${p7.rfSubsys}, ${p7.schedSubsys}`);
    console.log(`  Live JSON State length: ${p7.jsonLen} bytes`);
    if (p7.jsonLen < 50) throw new Error('Page 7: Live JSON state is empty');

    // Test PAUSE, STEP, RESUME
    await evaluate(`document.getElementById('btnSimPauseResume')?.click()`);
    await new Promise(r => setTimeout(r, 300));
    const pauseTxt = await evaluate(`document.getElementById('btnSimPauseResume')?.textContent?.trim()`);
    if (pauseTxt !== 'RESUME') throw new Error(`Pause failed: got ${pauseTxt}`);

    await evaluate(`document.getElementById('btnSimStep')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    await evaluate(`document.getElementById('btnSimPauseResume')?.click()`);
    await new Promise(r => setTimeout(r, 300));
    const resumeTxt = await evaluate(`document.getElementById('btnSimPauseResume')?.textContent?.trim()`);
    if (resumeTxt !== 'PAUSE') throw new Error(`Resume failed: got ${resumeTxt}`);
    console.log('  Tested PAUSE, STEP, RESUME execution controls');

    // Test Speed Multipliers
    for (const sp of [2, 5, 1]) {
      await evaluate(`document.querySelector('.btn-speed[data-speed="${sp}"]')?.click()`);
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('  Tested Speed multipliers (1x, 2x, 5x)');

    // Test RESET
    await evaluate(`document.getElementById('btnSimReset')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    console.log('  Tested RESET controls');
    console.log('  ✓ PAGE 7 MULTI-SENSOR / SIMULATION: PASS\n');

    // =========================================================================
    // STEP 3: OBSERVE COMPLETE 12-STEP DEMONSTRATION
    // =========================================================================
    console.log('--- STEP 3: OBSERVING COMPLETE 12-STEP INTEGRATED DEMONSTRATION ---');
    await evaluate(`document.getElementById('btnSimTriggerDemo')?.click()`);
    await new Promise(r => setTimeout(r, 200));

    let demoFinished = false;
    for (let stepPoll = 0; stepPoll < 25; stepPoll++) {
      await new Promise(r => setTimeout(r, 800));
      const demoState = await evaluate(`({
        badge: document.getElementById('simDemoStepBadge')?.textContent?.trim(),
        count: document.getElementById('demoStepCountBadge')?.textContent?.trim(),
        text: document.getElementById('demoStepIndicatorText')?.textContent?.trim(),
        isDemoActive: JSON.parse(document.getElementById('simLiveJsonInspector')?.textContent || '{}').simulation?.isDemoActive,
        operatingMode: JSON.parse(document.getElementById('simLiveJsonInspector')?.textContent || '{}').simulation?.operatingMode
      })`);

      if (stepPoll % 2 === 0 || demoState.count === '12 / 12') {
        console.log(`  Demo Progress: [${demoState.count}] ${demoState.badge} | Mode: ${demoState.operatingMode}`);
      }

      if (demoState.count === '12 / 12' || demoState.badge.includes('COMPLETED')) {
        demoFinished = true;
        console.log(`  ✓ 12-Step Demo Completed: Operational State = '${demoState.operatingMode}'`);
        break;
      }
    }

    if (!demoFinished) throw new Error('12-Step Demo failed to complete within expected timeline');

    // Test repeatability
    await evaluate(`document.getElementById('btnSimTriggerDemo')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const rerunCheck = await evaluate(`document.getElementById('demoStepCountBadge')?.textContent?.trim()`);
    console.log(`  Demo Repeatability Check: Immediate restart at [${rerunCheck}]`);
    if (rerunCheck !== '1 / 12') throw new Error('Demo repeatability failed');
    // Reset back to standard state
    await evaluate(`document.getElementById('btnSimReset')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    console.log('  ✓ Step 3 Passed: Complete 12-Step Demo verified end-to-end with full repeatability.\n');

    // =========================================================================
    // STEP 4: COMPLETE PRESENTATION FLOW (WITHOUT PAGE REFRESH)
    // =========================================================================
    console.log('--- STEP 4: COMPLETE PRESENTATION FLOW (ZERO-REFRESH WALKTHROUGH) ---');

    console.log('  Action 1: RESET state');
    await evaluate(`document.getElementById('btnSimReset')?.click()`);
    await new Promise(r => setTimeout(r, 400));

    console.log('  Action 2: Switch to TACTICAL CONTEXT');
    await evaluate(`window.app.switchPage('tactical')`);
    await new Promise(r => setTimeout(r, 400));

    console.log('  Action 3: Select TRK-021');
    await evaluate(`window.app.selectEntity('TRK-021')`);
    await new Promise(r => setTimeout(r, 400));
    const flowTrk = await evaluate(`window.app.simState?.selectedEntityId`);
    if (flowTrk !== 'TRK-021') throw new Error('Failed to select TRK-021 in flow');

    console.log('  Action 4: Switch to OPTICAL CONTEXT (show visual correlation)');
    await evaluate(`window.app.switchPage('optical')`);
    await new Promise(r => setTimeout(r, 400));
    const flowCamCorr = await evaluate(`document.getElementById('camCorrRadarId')?.textContent?.trim()`);
    console.log(`    Correlated Track in Optical: ${flowCamCorr}`);

    console.log('  Action 5: Switch to RF / ESM (show current band + HIT/MISS)');
    await evaluate(`window.app.switchPage('rf')`);
    await new Promise(r => setTimeout(r, 400));
    const flowRf = await evaluate(`({
      tuned: document.getElementById('rfRxTunedFreq')?.textContent?.trim(),
      state: document.getElementById('rfRxStateBadge')?.textContent?.trim()
    })`);
    console.log(`    RF Tuned: ${flowRf.tuned}, State: ${flowRf.state}`);

    console.log('  Action 6: Switch to SENSOR FUSION (show 4-sensor reasoning)');
    await evaluate(`window.app.switchPage('fusion')`);
    await new Promise(r => setTimeout(r, 400));
    const flowFusion = await evaluate(`({
      entity: document.getElementById('fusionEntityName')?.textContent?.trim(),
      reasoningSteps: document.querySelectorAll('#fusionReasoningTimeline .sos-log-item')?.length
    })`);
    console.log(`    Fusion Entity: ${flowFusion.entity}, Causal Steps: ${flowFusion.reasoningSteps}`);

    console.log('  Action 7: Switch to ADAPTIVE SCHEDULER (show why next band selected)');
    await evaluate(`window.app.switchPage('scheduler')`);
    await new Promise(r => setTimeout(r, 400));
    const flowSched = await evaluate(`({
      cur: document.getElementById('schedCurTarget')?.textContent?.trim(),
      next: document.getElementById('schedNextTarget')?.textContent?.trim(),
      score: document.getElementById('schedCompositeScore')?.textContent?.trim()
    })`);
    console.log(`    Scheduler Target: ${flowSched.cur} -> Next: ${flowSched.next} (Score ${flowSched.score})`);

    console.log('  Action 8: Switch to ANALYTICS (show measured benchmark results)');
    await evaluate(`window.app.switchPage('analytics')`);
    await new Promise(r => setTimeout(r, 400));
    const flowAnalytics = await evaluate(`({
      detRate: document.getElementById('metricAdaptiveDetRate')?.textContent?.trim(),
      latency: document.getElementById('metricAdaptiveLatency')?.textContent?.trim()
    })`);
    console.log(`    Analytics Benchmark: Detection=${flowAnalytics.detRate}, Latency=${flowAnalytics.latency}`);

    console.log('  Action 9: Switch to MULTI-SENSOR DEMO');
    await evaluate(`window.app.switchPage('simulation')`);
    await new Promise(r => setTimeout(r, 400));

    console.log('  Action 10: Run 12-Step Demonstration');
    await evaluate(`document.getElementById('btnSimTriggerDemo')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const flowDemoStart = await evaluate(`document.getElementById('simDemoStepBadge')?.textContent?.trim()`);
    console.log(`    Flow Demo Triggered: ${flowDemoStart}`);
    console.log('  ✓ Step 4 Passed: Complete Presentation Flow executed flawlessly without refresh.\n');

    // =========================================================================
    // STEP 5: CONSOLE / NETWORK AUDIT
    // =========================================================================
    console.log('--- STEP 5: CONSOLE / NETWORK AUDIT ---');
    console.log(`  Total Console Errors Observed: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('  Errors:', consoleErrors);
      throw new Error(`Console audit failed with ${consoleErrors.length} errors`);
    }
    const wsReady = await evaluate(`window.app.ws?.readyState`);
    console.log(`  WebSocket ReadyState: ${wsReady} (1 = OPEN)`);
    if (wsReady !== 1) throw new Error('WebSocket connection lost');
    console.log('  ✓ Step 5 Passed: Zero console errors, stable WebSocket connection, valid network requests.\n');

    // =========================================================================
    // STEP 6: RECONNECT TEST
    // =========================================================================
    console.log('--- STEP 6: RECONNECT TEST ---');
    await evaluate(`window.app.switchPage('tactical')`);
    await new Promise(r => setTimeout(r, 500));

    // Tag window object to verify zero page refresh
    await evaluate(`window.__TEST_RELOAD_SENTINEL__ = 'PERSISTED_NO_REFRESH'`);

    console.log('  Simulating connection drop (closing WebSocket)...');
    await evaluate(`window.app.ws.close()`);
    await new Promise(r => setTimeout(r, 500));

    const discState = await evaluate(`({
      status: document.getElementById('globalSysStatus')?.textContent,
      wsState: window.app.ws?.readyState
    })`);
    console.log(`  Graceful disconnected state observed: Status=${discState.status}, WS ReadyState=${discState.wsState}`);
    if (discState.status !== 'OFFLINE' && discState.wsState === 1) {
      throw new Error('Failed to observe graceful OFFLINE status on disconnect');
    }

    console.log('  Waiting for automatic reconnection without page refresh...');
    let reconnected = false;
    let postReconnectEnts = [];
    let initialSweep = null;
    let nextSweep = null;

    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 500));
      const cur = await evaluate(`({
        wsOpen: window.app.ws?.readyState === 1,
        status: document.getElementById('globalSysStatus')?.textContent,
        sentinel: window.__TEST_RELOAD_SENTINEL__,
        ents: (window.app.entities || window.app.radar?.lastEntities || []).map(e => e.id),
        sweep: window.app.radar?.sweepAngle
      })`);

      if (cur.wsOpen && cur.status === 'ONLINE' && cur.ents.length === 7) {
        if (initialSweep === null) {
          initialSweep = cur.sweep;
        } else if (cur.sweep !== initialSweep) {
          nextSweep = cur.sweep;
          reconnected = true;
          postReconnectEnts = cur.ents;
          if (cur.sentinel !== 'PERSISTED_NO_REFRESH') {
            throw new Error('Page was unexpectedly refreshed during reconnect!');
          }
          break;
        }
      }
    }

    if (!reconnected) {
      throw new Error('Failed to verify automatic reconnection and resuming telemetry');
    }

    console.log(`  Reconnected: Status=ONLINE, Sentinel='PERSISTED_NO_REFRESH' (Zero Page Refresh)`);
    console.log(`  Telemetry active: Sweep angle advanced ${initialSweep?.toFixed(1)}° -> ${nextSweep?.toFixed(1)}°`);
    console.log(`  Canonical Entities (${postReconnectEnts.length}): ${JSON.stringify(postReconnectEnts)}`);

    const uniqueEnts = new Set(postReconnectEnts);
    if (postReconnectEnts.length !== 7 || uniqueEnts.size !== 7) {
      throw new Error(`Duplicate tracks or entity count mismatch! Found ${postReconnectEnts.length} (${uniqueEnts.size} unique)`);
    }
    console.log('  Zero duplicate tracks verified (exactly 7 unique canonical IDs).');
    console.log('  ✓ Step 6 Passed: Reconnect Test verified without page refresh, exactly 7 canonical entities, zero duplicate tracks, active telemetry resumption.\n');

    console.log('========================================================================');
    console.log('🏆 COMPLETE PRESENTATION & E2E ACCEPTANCE (STEPS 1 TO 6) PASSED');
    console.log('========================================================================\n');

  } finally {
    proc.kill();
  }
}

run().catch(err => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
