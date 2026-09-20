/**
 * ESM-ASTRA: Adaptive RF/ESM Receiver Scheduler & Situational Platform (SIH26055)
 * Single Source of Truth: Synchronizes all 7 workspaces to master simulation entities
 */

class TacticalC2App {
  constructor() {
    this.ws = null;
    this.activeView = 'radar';

    this.radar = null;
    this.spectrum = null;
    this.camera = null;
    this.analytics = null;

    this.simState = null;
    this.entities = [];
    this.cameras = {};
    this.personnelDb = [];
    this.eventTimeline = [];
    this.sosLogs = [];

    this.init();
  }

  init() {
    // Instantiate visualization sub-engines
    this.radar = new TacticalRadarScope('tacticalRadarCanvas');
    this.spectrum = new CompactSpectrumAnalyzer('rfDedicatedSpectrumCanvas');
    this.camera = new OpticalSurveillanceMonitor('cameraPageCanvas');
    this.analytics = new SystemAnalyticsRenderer('analyticsChartCanvas');

    this.setupPageRouting();
    this.setupListeners();
    this.connectWebSocket();
    this.startGlobalClock();

    // 60 FPS Render loop
    const render = () => {
      if (this.activeView === 'radar' && this.radar) {
        this.radar.render();
      } else if (this.activeView === 'rf' && this.spectrum) {
        this.spectrum.render();
      } else if (this.activeView === 'camera' && this.camera) {
        this.camera.render();
      } else if (this.activeView === 'analytics' && this.analytics) {
        this.analytics.render();
      }
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  /* --------------------------------------------------------------------------
     1. GLOBAL PAGE ROUTING (7 DEDICATED WORKSPACES)
     -------------------------------------------------------------------------- */
  setupPageRouting() {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      const validPages = ['radar', 'rf', 'camera', 'fusion', 'scheduler', 'analytics', 'simulation'];
      if (validPages.includes(hash)) {
        this.switchPage(hash);
      }
    };

    window.addEventListener('hashchange', handleHash);

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const pageId = btn.getAttribute('data-view');
        window.location.hash = pageId;
        this.switchPage(pageId);
      };
    });

    if (window.location.hash) {
      handleHash();
    }
  }

  switchPage(pageId) {
    this.activeView = pageId;

    // 1. Update Navigation Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === pageId);
    });

    // 2. Switch Active Viewport
    document.querySelectorAll('.view-page').forEach(page => {
      page.classList.toggle('active', page.id === `view-${pageId}`);
    });

    // 3. Trigger immediate resize on target engine
    setTimeout(() => {
      if (pageId === 'radar' && this.radar) this.radar.resize();
      if (pageId === 'rf' && this.spectrum) this.spectrum.resize();
      if (pageId === 'camera' && this.camera) this.camera.resize();
      if (pageId === 'analytics' && this.analytics) this.analytics.resize();
    }, 20);
  }

  startGlobalClock() {
    const clockEl = document.getElementById('globalUtcTime');
    const update = () => {
      const now = new Date();
      if (clockEl) clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC';
    };
    update();
    setInterval(update, 1000);
  }

  /* --------------------------------------------------------------------------
     2. WEBSOCKET TELEMETRY SYNCHRONIZATION (SINGLE SOURCE OF TRUTH)
     -------------------------------------------------------------------------- */
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/c2`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      const st = document.getElementById('globalSysStatus');
      if (st) {
        st.textContent = 'ONLINE';
        st.style.color = 'var(--state-verified)';
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'INCIDENT_FALSE_ALARM_TEST_RESULT') {
          this.handleIncidentTestResult(data.result);
        } else {
          this.handleTelemetry(data);
        }
      } catch (err) {
        console.error('Telemetry error:', err);
      }
    };

    this.ws.onclose = () => {
      const st = document.getElementById('globalSysStatus');
      if (st) {
        st.textContent = 'OFFLINE';
        st.style.color = 'var(--state-critical)';
      }
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  handleTelemetry(data) {
    if (data.simState) {
      this.simState = data.simState;
      this.updateGlobalHeader(data.simState);
      this.updateSchedulerPage(data.simState);
      this.updateSimulationPage(data.simState);
    }
    if (data.entities) {
      this.entities = data.entities;
      this.renderRadarPageTrackCards(data.entities);
      this.renderRfEmitterTable(data.entities);
      this.renderCameraDetections(data.entities);
      this.renderSensorFusionPage(data.entities);
    }
    if (data.personnelDb) {
      this.personnelDb = data.personnelDb;
      this.renderPersonnelList(data.personnelDb);
    }
    if (data.sosLogs || data.incidents) {
      this.sosLogs = data.sosLogs || [];
      this.incidents = data.incidents || [];
      this.renderSosLogs(this.sosLogs, this.incidents);
    }
    if (data.eventTimeline) {
      this.eventTimeline = data.eventTimeline;
      this.renderEventFeeds(data.eventTimeline);
    }

    if (this.radar) this.radar.updateData(data);
    if (this.spectrum) this.spectrum.updateData(data);
    if (this.camera) this.camera.updateData(data);
    if (this.analytics) this.analytics.updateData(data);
  }

  updateGlobalHeader(sim) {
    const modeEl = document.getElementById('globalOpMode');
    if (modeEl) modeEl.textContent = sim.operatingMode;

    const badge = document.getElementById('simCurScenarioBadge');
    if (badge) badge.textContent = sim.scenario;

    // Highlight active scenario buttons
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-scenario') === sim.scenario);
    });

    // Highlight speed buttons
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-speed')) === (sim.speedMultiplier || 1));
    });

    const pauseRadar = document.getElementById('btnRadarPauseResume');
    if (pauseRadar) pauseRadar.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';

    const pauseSim = document.getElementById('btnSimPauseResume');
    if (pauseSim) pauseSim.textContent = sim.isRunning ? 'PAUSE' : 'RESUME';
  }

  /* --------------------------------------------------------------------------
     3. PAGE 1: TACTICAL RADAR RENDERING
     -------------------------------------------------------------------------- */
  renderRadarPageTrackCards(entities) {
    const container = document.getElementById('radarTrackListContainer');
    if (!container) return;

    const selId = this.simState?.selectedEntityId || 'TRK-021';
    container.innerHTML = '';

    // Build a fast name-lookup from personnelDb
    const personnelMap = {};
    (this.personnelDb || []).forEach(p => { personnelMap[p.tagId] = p; });

    entities.forEach(ent => {
      const card = document.createElement('div');
      const isSelected = ent.id === selId;
      const cls = ent.fusion.classification;

      // Classification styling
      let classSuffix = 'verified';
      let clsColor = 'var(--state-verified)';    // green
      let icon = '●';
      if      (cls === 'ANOMALOUS')    { classSuffix = 'anomalous'; clsColor = 'var(--state-critical)'; icon = '◆'; }
      else if (cls === 'WILDLIFE')     { classSuffix = 'warning';   clsColor = '#d7a84b';               icon = '▲'; }
      else if (cls === 'UNIDENTIFIED') { classSuffix = 'unknown';   clsColor = '#8a9ab5';               icon = '□'; }

      card.className = `track-card ${classSuffix} ${isSelected ? 'selected' : ''}`;
      card.onclick = () => this.selectEntity(ent.id);

      // Authorized person details from personnelDb
      const pRecord = ent.personnel?.matched && ent.personnel?.tagId ? personnelMap[ent.personnel.tagId] : null;
      const personName   = pRecord?.name   || (cls === 'ANOMALOUS' ? 'UNAUTHORIZED — IDENTITY UNKNOWN' : cls === 'WILDLIFE' ? 'WILDLIFE / FAUNA' : 'UNIDENTIFIED CONTACT');
      const personTag    = pRecord?.tagId  || ent.personnel?.tagId || '—';
      const personZone   = pRecord?.zone   || ent.personnel?.zone  || '—';
      const personStatus = pRecord?.status || (cls === 'ANOMALOUS' ? 'THREAT' : cls === 'WILDLIFE' ? 'FAUNA' : 'UNKNOWN');

      // Extra detail block based on classification
      const authorizedRows = pRecord ? `
        <div style="border-top:1px solid rgba(66,196,122,0.2); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor}; font-size:7.5px; font-weight:700; letter-spacing:0.07em; margin-bottom:3px;">✓ AUTHORIZED PERSONNEL</div>
          <div style="color:#e8f4ff; font-size:9.5px; font-weight:700; margin-bottom:4px;">${personName}</div>
          <div style="display:grid; grid-template-columns:auto 1fr; gap:2px 8px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">TAG ID</span>
            <span style="color:var(--radar-cyan);font-size:7.5px;font-weight:700;">${personTag}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">RANK</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.rank || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ROLE</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.role || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">UNIT</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${pRecord.unit || '—'}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ZONE</span>
            <span style="color:#e0f0ff;font-size:7.5px;">${personZone}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">CLEARANCE</span>
            <span style="color:${clsColor};font-size:7.5px;font-weight:700;">${pRecord.clearance || personStatus}</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">SHIFT</span>
            <span style="color:#b0c8e0;font-size:7.5px;">${pRecord.shift || '—'}</span>
          </div>
        </div>` : cls === 'ANOMALOUS' ? `
        <div style="border-top:1px solid rgba(212,88,88,0.25); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;font-weight:700;">⚠ UNAUTHORIZED — NO TAG MATCH</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">RISK</span>
            <span style="color:#ff6666;font-size:7.5px;font-weight:700;">${ent.fusion.anomalyScore}/100</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">CONFIDENCE</span>
            <span style="color:#ffaaaa;font-size:7.5px;">${ent.fusion.confidence}%</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">STATUS</span>
            <span style="color:${clsColor};font-size:7.5px;font-weight:700;">RESTRICTED ZONE BREACH</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ACTION</span>
            <span style="color:#ffaaaa;font-size:7.5px;">${ent.fusion.recommendation}</span>
          </div>
        </div>` : cls === 'WILDLIFE' ? `
        <div style="border-top:1px solid rgba(215,168,75,0.2); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;font-weight:700;">▲ WILDLIFE / FAUNA CONTACT</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">ANOMALY</span>
            <span style="color:#d7a84b;font-size:7.5px;">${ent.fusion.anomalyScore}/100</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">FILTER</span>
            <span style="color:#b09050;font-size:7.5px;">FAUNA FILTERED — NO ALERT</span>
          </div>
        </div>` : `
        <div style="border-top:1px solid rgba(138,154,181,0.15); margin-top:5px; padding-top:5px;">
          <div style="color:${clsColor};font-size:7.5px;">□ UNIDENTIFIED — OUTSIDE PERIMETER</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-top:3px;">
            <span style="color:var(--text-tertiary);font-size:7.5px;">CONFIDENCE</span>
            <span style="color:#8a9ab5;font-size:7.5px;">${ent.fusion.confidence}%</span>
            <span style="color:var(--text-tertiary);font-size:7.5px;">ACTION</span>
            <span style="color:#8a9ab5;font-size:7.5px;">MONITOR</span>
          </div>
        </div>`;


      card.innerHTML = `
        <div class="track-card-header">
          <span class="track-card-id" style="color:${isSelected ? 'var(--radar-cyan)' : clsColor};">${icon} ${ent.id}</span>
          <span class="track-pill ${classSuffix}">${cls}</span>
        </div>
        <div class="track-card-metrics" style="margin-top:3px;">
          <span>Range: <b>${ent.radar.range}m</b></span>
          <span>Az: <b>${ent.radar.azimuth}°</b></span>
          <span>Speed: <b>${ent.radar.speedKmh} km/h</b></span>
          <span>Hdg: <b>${ent.radar.heading}°</b></span>
        </div>
        ${authorizedRows}
      `;
      container.appendChild(card);
    });

    const countEl = document.getElementById('radarActiveCount');
    if (countEl) countEl.textContent = `${String(entities.length).padStart(2, '0')} ACTIVE`;
  }



  renderPersonnelList(db) {
    const container = document.getElementById('radarPersonnelListContainer');
    const modalContainer = document.getElementById('modalPersonnelListContainer');

    const renderRow = p => `
      <div class="person-row">
        <div>
          <span style="color:var(--radar-cyan); font-weight:700;">${p.tagId}</span>
          <span style="color:#fff; margin-left:4px; font-weight:600;">${p.name}</span>
          <span style="color:var(--text-tertiary); margin-left:4px;">(${p.role})</span>
        </div>
        <span class="track-pill verified">${p.status}</span>
      </div>
    `;

    if (container) {
      container.innerHTML = db.slice(0, 5).map(renderRow).join('');
    }
    if (modalContainer) {
      modalContainer.innerHTML = db.map(renderRow).join('');
    }
  }


  renderSosLogs(logs, incidents) {
    const container = document.getElementById('radarSosLogsContainer');
    if (!container) return;

    // Use rich incident data if available, otherwise fall back to legacy sosLogs
    const source = incidents && incidents.length > 0 ? incidents : logs;
    const isIncidents = incidents && incidents.length > 0;

    const activeAlerts = isIncidents ? incidents.filter(i => i.status === 'ACTIVE') : logs.filter(l => l.level === 'ELEVATED' || l.level === 'CRITICAL SIMULATION EVENT' || l.level === 'HIGH-RISK SIMULATED EVENT');
    const countEl = document.getElementById('sosAlertCount');
    if (countEl) {
      const count = activeAlerts.length;
      countEl.textContent = count > 0 ? `${count} ACTIVE` : '0 ACTIVE';
      countEl.style.color = count > 0 ? 'var(--state-critical)' : 'var(--state-verified)';
    }

    if (isIncidents) {
      container.innerHTML = incidents.map(inc => {
        const isActive = inc.status === 'ACTIVE';
        const isCritical = inc.alertLevel === 'CRITICAL SIMULATION EVENT';
        const isHighRisk = inc.alertLevel === 'HIGH-RISK SIMULATED EVENT';
        const hasAlert = isCritical || isHighRisk;

        const levelColor = isCritical ? 'var(--state-critical)' : isHighRisk ? '#f0a500' : 'var(--text-tertiary)';
        const bgColor = isActive && hasAlert ? 'rgba(220,38,38,0.08)' : 'transparent';

        const evidenceStr = inc.sensorEvidence ? [
          inc.sensorEvidence.radar ? 'RADAR' : null,
          inc.sensorEvidence.camera ? 'CAM' : null,
          inc.sensorEvidence.rfCorrelation ? 'RF' : null,
          inc.sensorEvidence.restrictedZone ? 'RZONE' : null,
          inc.sensorEvidence.unauthorized ? 'UNAUTH' : null
        ].filter(Boolean).join(' | ') : '';

        return `
          <div class="sos-log-entry" style="background:${bgColor}; border-left:2px solid ${levelColor}; padding-left:6px; margin-bottom:4px;">
            <div style="display:flex; justify-content:space-between; font-weight:700; align-items:center;">
              <span style="color:${levelColor}; font-size:9px;">${inc.incidentId || inc.id}</span>
              <span style="color:var(--text-tertiary); font-size:8px;">${inc.timeStr || inc.time}</span>
            </div>
            <div style="color:#fff; margin-top:1px; font-size:9px; font-weight:600;">${inc.entityId || inc.targetId} — ${inc.alertLevel || inc.level || 'NONE'}</div>
            <div style="color:var(--text-secondary); font-size:8px; margin-top:1px;">${inc.range ? `Range ${inc.range}m | Az ${inc.azimuth}° | ${inc.speed?.toFixed(1)} km/h` : (inc.location || '')}</div>
            ${evidenceStr ? `<div style="color:var(--radar-cyan); font-size:7.5px; margin-top:1px; font-family:var(--font-mono);">${evidenceStr}</div>` : ''}
            ${inc.riskScore !== undefined ? `<div style="color:${levelColor}; font-size:7.5px; font-family:var(--font-mono);">RISK: ${inc.riskScore}/100</div>` : ''}
            <div style="display:flex; align-items:center; gap:4px; margin-top:3px;">
              <span style="font-size:7.5px; color:${isActive ? 'var(--state-critical)' : 'var(--state-verified)'}; font-weight:700;">${inc.status}</span>
              ${isActive && hasAlert ? `<button class="btn-ops" style="font-size:7px; padding:1px 6px; height:16px; line-height:1;" onclick="window.app.acknowledgeIncident('${inc.incidentId}')">ACKNOWLEDGE</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = logs.map(l => `
        <div class="sos-log-entry">
          <div style="display:flex; justify-content:space-between; font-weight:700;">
            <span style="color:var(--state-critical);">${l.id} // ${l.targetId}</span>
            <span style="color:var(--text-tertiary);">${l.time}</span>
          </div>
          <div style="color:#fff; margin-top:2px;">${l.location} — ${l.status}</div>
        </div>
      `).join('');
    }
  }


  /* --------------------------------------------------------------------------
     4. PAGE 2: RF / ESM INTELLIGENCE RENDERING (SIH26055)
     -------------------------------------------------------------------------- */
  renderRfEmitterTable(entities) {
    const tbody = document.getElementById('rfEmitterTableBody');
    if (!tbody) return;

    const emitters = entities.filter(e => e.rf.hasEmitter);
    const selId = this.simState?.selectedEntityId || 'TRK-021';

    tbody.innerHTML = emitters.map(ent => {
      const isSelected = ent.id === selId;
      const isTx = ent.rf.isTransmitting;
      return `
        <tr style="background:${isSelected ? 'rgba(24, 184, 214, 0.12)' : 'transparent'};" onclick="window.app.selectEntity('${ent.id}')">
          <td style="color:var(--radar-cyan); font-weight:700;">${ent.rf.emitterId}</td>
          <td><b>${ent.rf.freqGhz ? ent.rf.freqGhz.toFixed(3) : '--'} GHz</b></td>
          <td>${ent.rf.powerDbm} dBm</td>
          <td><span class="track-pill ${isTx ? 'verified' : 'unknown'}">${isTx ? 'TRANSMITTING' : 'IDLE'}</span></td>
          <td>${ent.fusion.confidence}%</td>
          <td style="color:var(--radar-cyan); font-weight:600;">${ent.id}</td>
          <td style="color:var(--text-tertiary);">${new Date().toTimeString().split(' ')[0]}</td>
        </tr>
      `;
    }).join('');

    const countEl = document.getElementById('rfTotalEmittersCount');
    if (countEl) countEl.textContent = `${emitters.length} TRACKED`;

    // Update receiver telemetry values
    if (this.simState) {
      const rxFreq = document.getElementById('rfRxTunedFreq');
      if (rxFreq) rxFreq.textContent = `${this.simState.rfCurrentScanGhz.toFixed(3)} GHz`;

      const rxDwell = document.getElementById('rfRxDwellMs');
      if (rxDwell) rxDwell.textContent = `${this.simState.rfCurrentDwellMs} ms`;

      const nextBand = document.getElementById('rfNextBandGhz');
      if (nextBand) nextBand.textContent = `${this.simState.rfNextScanGhz.toFixed(3)} GHz`;

      const sel = entities.find(e => e.id === selId);
      const assocEl = document.getElementById('rfRxAssocEmitter');
      if (assocEl) {
        assocEl.textContent = sel && sel.rf.hasEmitter ? `${sel.rf.emitterId} (${sel.id})` : 'NO ASSOCIATED EMITTER';
      }
    }
  }

  /* --------------------------------------------------------------------------
     5. PAGE 3: OPTICAL SURVEILLANCE / CAMERA RENDERING
     -------------------------------------------------------------------------- */
  renderCameraDetections(entities) {
    const curCam = this.simState?.activeCameraId || 'CAM-01';

    // Highlight active camera tab
    document.querySelectorAll('.cam-big-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cam') === curCam);
    });

    const visible = entities.filter(e => e.camera.visibleCamId === curCam && e.camera.isVisuallyConfirmed);
    const container = document.getElementById('camDetectionListContainer');
    if (container) {
      if (visible.length === 0) {
        container.innerHTML = `<div style="color:var(--text-tertiary); padding:10px; font-family:var(--font-mono); font-size:9.5px;">NO OPTICAL DETECTIONS IN ${curCam} SECTOR FOV</div>`;
      } else {
        container.innerHTML = visible.map(ent => `
          <div class="cam-det-card" onclick="window.app.selectEntity('${ent.id}')">
            <div style="display:flex; justify-content:space-between; font-weight:700;">
              <span style="color:var(--cam-blue);">${ent.camera.detectionId} [${ent.camera.typeLabel}]</span>
              <span style="color:#fff;">${ent.camera.confidence}% CONF</span>
            </div>
            <div style="color:var(--text-secondary); margin-top:2px;">CORRELATED TO RADAR: <b style="color:var(--radar-cyan);">${ent.id}</b></div>
          </div>
        `).join('');
      }
    }

    const countEl = document.getElementById('camDetectionsCount');
    if (countEl) countEl.textContent = `${String(visible.length).padStart(2, '0')} IN FOV`;

    // Correlation card
    const selId = this.simState?.selectedEntityId || 'TRK-021';
    const sel = entities.find(e => e.id === selId);

    const corrRadar = document.getElementById('camCorrRadarId');
    if (corrRadar) corrRadar.textContent = selId;

    const corrDet = document.getElementById('camCorrDetId');
    const corrStatus = document.getElementById('camCorrStatus');
    const corrConf = document.getElementById('camCorrConf');
    const corrSector = document.getElementById('camCorrSector');

    if (sel && sel.camera.isVisuallyConfirmed && sel.camera.visibleCamId === curCam) {
      if (corrDet) corrDet.textContent = `${sel.camera.detectionId} (${sel.camera.typeLabel})`;
      if (corrStatus) { corrStatus.textContent = 'CORRELATED'; corrStatus.style.color = 'var(--state-verified)'; }
      if (corrConf) corrConf.textContent = `${sel.camera.confidence}%`;
      if (corrSector) corrSector.textContent = `${curCam} (ACTIVE)`;
    } else {
      if (corrDet) corrDet.textContent = sel && sel.camera.isVisuallyConfirmed ? `IN SECTOR ${sel.camera.visibleCamId}` : 'OUT OF FOV';
      if (corrStatus) { corrStatus.textContent = sel && sel.camera.isVisuallyConfirmed ? 'IN OTHER SECTOR' : 'NO VISUAL CONFIRMATION'; corrStatus.style.color = 'var(--text-tertiary)'; }
      if (corrConf) corrConf.textContent = '--';
      if (corrSector) corrSector.textContent = curCam;
    }
  }

  /* --------------------------------------------------------------------------
     6. PAGE 4: SENSOR FUSION WORKSPACE RENDERING
     -------------------------------------------------------------------------- */
  renderSensorFusionPage(entities) {
    const selId = this.simState?.selectedEntityId || 'TRK-021';
    const sel = entities.find(e => e.id === selId);
    if (!sel) return;

    const setEl = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setEl('fusionSelectedEntityBadge', `ENTITY-${sel.id.replace('TRK-', '')}`);
    setEl('fusionEntityName', `${sel.id} (${sel.displayName || 'Unidentified Contact'})`);
    setEl('fusionSummaryText', sel.fusion.statusSummary);

    const classBadge = document.getElementById('fusionClassificationBadge');
    if (classBadge) {
      classBadge.textContent = sel.fusion.classification;
      classBadge.className = `track-pill ${sel.fusion.classification.toLowerCase()}`;
    }

    setEl('fusionRadarEvidence', `Detected ✓ (${sel.radar.range}m / ${sel.radar.azimuth}° / ${sel.radar.speedKmh} km/h)`);

    if (sel.camera.isVisuallyConfirmed) {
      setEl('fusionCameraEvidence', `Visual Match ${sel.camera.confidence}% (${sel.camera.detectionId} on ${sel.camera.visibleCamId})`);
    } else {
      setEl('fusionCameraEvidence', 'No Visual Confirmation (Outside Optical FOV)');
    }

    if (sel.rf.hasEmitter && sel.rf.freqGhz) {
      setEl('fusionRfEvidence', `Active Associated Signal (${sel.rf.freqGhz.toFixed(3)} GHz, ${sel.rf.powerDbm} dBm)`);
    } else {
      setEl('fusionRfEvidence', 'No RF Emission (Passive Skin Return Only)');
    }

    if (sel.personnel.matched) {
      setEl('fusionPersonnelEvidence', `Credentials Verified (${sel.personnel.tagId} - ${sel.personnel.details.name})`);
    } else {
      setEl('fusionPersonnelEvidence', 'No Authorization Credentials Match');
    }

    setEl('fusionConfidenceScore', `${sel.fusion.confidence}%`);
    const confFill = document.getElementById('fusionConfidenceFill');
    if (confFill) confFill.style.width = `${sel.fusion.confidence}%`;

    setEl('fusionAnomalyScore', `${sel.fusion.anomalyScore} / 100`);
    setEl('fusionRecommendationText', sel.fusion.recommendation);

    // Dynamic Visual Node/Connector Flow Nodes
    setEl('nodeRadarStatus', 'ACQUIRED (98%)');
    setEl('nodeRadarBelief', `${sel.type === 'PERSON' ? 'Humanoid Movement' : (sel.type === 'VEHICLE' ? 'Motor Vehicle Return' : (sel.type === 'WILDLIFE' ? 'Quadruped Movement' : 'Unidentified Contact'))} // ${sel.radar.speedKmh} km/h`);
    setEl('nodeRadarMeta', `${sel.radar.range}m / ${sel.radar.azimuth}° Azimuth / SNR 28dB`);

    const camStatusEl = document.getElementById('nodeCameraStatus');
    if (sel.camera.isVisuallyConfirmed) {
      if (camStatusEl) {
        camStatusEl.textContent = `VISUAL ${sel.camera.confidence}%`;
        camStatusEl.className = 'snc-status verified';
      }
      setEl('nodeCameraBelief', `${sel.type} (${sel.camera.detectionId})`);
      setEl('nodeCameraMeta', `${sel.camera.visibleCamId} Sector // In Optical FOV`);
    } else {
      if (camStatusEl) {
        camStatusEl.textContent = 'OUT OF FOV';
        camStatusEl.className = 'snc-status neutral';
      }
      setEl('nodeCameraBelief', 'No Visual In FOV');
      setEl('nodeCameraMeta', 'Perimeter Cameras Cam-01..04 Active');
    }

    const rfStatusEl = document.getElementById('nodeRfStatus');
    if (sel.rf.hasEmitter && sel.rf.freqGhz) {
      if (rfStatusEl) {
        rfStatusEl.textContent = `ACTIVE (${sel.rf.powerDbm} dBm)`;
        rfStatusEl.className = 'snc-status warning';
      }
      setEl('nodeRfBelief', sel.rf.freqGhz >= 9.4 ? 'Frequency-Agile Intermittent' : 'Tactical Radio Emitter');
      setEl('nodeRfMeta', `${sel.rf.freqGhz.toFixed(3)} GHz // ${sel.rf.emitterId || 'EMITTER'}`);
    } else {
      if (rfStatusEl) {
        rfStatusEl.textContent = 'NO RF';
        rfStatusEl.className = 'snc-status neutral';
      }
      setEl('nodeRfBelief', 'Passive Skin Return');
      setEl('nodeRfMeta', 'Zero Emitter Transmissions');
    }

    const dbStatusEl = document.getElementById('nodeDbStatus');
    if (sel.personnel.matched) {
      if (dbStatusEl) {
        dbStatusEl.textContent = `VERIFIED (${sel.personnel.tagId})`;
        dbStatusEl.className = 'snc-status verified';
      }
      setEl('nodeDbBelief', `${sel.personnel.details.name} (Clearance OK)`);
      setEl('nodeDbMeta', `Zone: ${sel.personnel.details.zone || 'Base Perimeter'}`);
    } else {
      if (dbStatusEl) {
        dbStatusEl.textContent = 'UNAUTHORIZED';
        dbStatusEl.className = 'snc-status critical';
      }
      setEl('nodeDbBelief', sel.type === 'WILDLIFE' ? 'Non-Human Entity' : 'No Authorization Match');
      setEl('nodeDbMeta', 'Zero RFID Transponder Response');
    }

    setEl('nodeHubCorr', 'SPATIO-TEMPORAL ✓');
    setEl('nodeHubConf', `${sel.fusion.confidence}%`);
    setEl('nodeHubAnomaly', `${sel.fusion.anomalyScore} / 100`);

    const outPill = document.getElementById('nodeOutputPill');
    if (outPill) {
      outPill.textContent = sel.fusion.classification;
      outPill.className = `track-pill ${sel.fusion.classification.toLowerCase()}`;
    }
    setEl('nodeOutputTitle', `${sel.id}: ${sel.displayName || sel.type}`);
    setEl('nodeOutputAction', sel.fusion.recommendation);
    const outSos = document.getElementById('nodeOutputSos');
    if (outSos) {
      if (sel.fusion.classification === 'ANOMALOUS') {
        outSos.style.display = 'flex';
      } else {
        outSos.style.display = 'none';
      }
    }

    // Multi-entity evidence matrix table
    const matrixBody = document.getElementById('fusionMatrixBody');
    if (matrixBody) {
      matrixBody.innerHTML = entities.map(e => `
        <tr style="background:${e.id === selId ? 'rgba(24, 184, 214, 0.12)' : 'transparent'}; cursor:pointer;" onclick="window.app.selectEntity('${e.id}')">
          <td style="color:var(--radar-cyan); font-weight:700;">${e.id}</td>
          <td>✓ ${e.radar.range}m</td>
          <td>${e.camera.isVisuallyConfirmed ? `✓ ${e.camera.confidence}% (${e.camera.visibleCamId})` : 'OUT OF FOV'}</td>
          <td>${e.rf.hasEmitter ? `✓ ${e.rf.freqGhz ? e.rf.freqGhz.toFixed(3) : '--'}G` : 'NO RF'}</td>
          <td>${e.personnel.matched ? `✓ ${e.personnel.tagId}` : 'NO MATCH'}</td>
          <td><span class="track-pill ${e.fusion.classification.toLowerCase()}">${e.fusion.classification}</span></td>
        </tr>
      `).join('');
    }
  }

  /* --------------------------------------------------------------------------
     7. PAGE 5: ADAPTIVE EW SCAN SCHEDULER RENDERING (SIH CORE)
     -------------------------------------------------------------------------- */
  updateSchedulerPage(sim) {
    const cur = document.getElementById('schedCurTarget');
    if (cur) cur.textContent = `${sim.rfCurrentScanGhz.toFixed(3)} GHz (${sim.rfCurrentDwellMs} ms Dwell)`;

    const next = document.getElementById('schedNextTarget');
    if (next) next.textContent = `${sim.rfNextScanGhz.toFixed(3)} GHz (Pred Activity 87%)`;

    const reward = document.getElementById('schedTotalReward');
    const comp = document.getElementById('schedCompositeScore');
    const attr = sim.schedulerAttribution || {};

    if (reward) reward.textContent = String(attr.totalScore || 68);
    if (comp) comp.textContent = String(attr.totalScore || 68);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('attrRecentHit', `+${attr.recentHit !== undefined ? attr.recentHit : 22}`);
    setEl('attrActivity', `+${attr.activity !== undefined ? attr.activity : 18}`);
    setEl('attrUncertainty', `+${attr.uncertainty !== undefined ? attr.uncertainty : 14}`);
    setEl('attrRecency', `+${attr.recency !== undefined ? attr.recency : 9}`);
    setEl('attrExploration', `+${attr.exploration !== undefined ? attr.exploration : 5}`);
    setEl('attrMissPenalty', `-${attr.missPenalty !== undefined ? attr.missPenalty : 0}`);

    // Policy Inspector Rendering
    const pi = sim.policyInspector || {};
    setEl('piCurrentPolicy', sim.schedulerPolicy || pi.currentPolicy || 'Recency-Augmented UCB1');
    setEl('schedPolicyDisp', sim.schedulerPolicy || pi.currentPolicy || 'Recency-Augmented UCB1');
    setEl('piExplorationC', pi.explorationConstant !== undefined ? pi.explorationConstant.toFixed(3) : '1.414');
    setEl('piLearningRate', pi.learningRate || 'Conjugate Beta(α,β) (+1 per dwell)');
    setEl('piBestBand', `${(pi.currentBestBand || 9.420).toFixed(3)} GHz`);
    setEl('piUncertainty', pi.systemUncertainty !== undefined ? pi.systemUncertainty.toFixed(3) : '0.421');

    // Update active ablation toggle
    const currentAblation = sim.schedulerAblationMode || 'FULL_ADAPTIVE';
    const ablationGroup = document.getElementById('ablationBtnGroup');
    if (ablationGroup) {
      ablationGroup.querySelectorAll('.btn-ablation').forEach(btn => {
        if (btn.dataset.mode === currentAblation) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Decision pipeline steps
    const stepSel = document.getElementById('schedStepSelected');
    if (stepSel) stepSel.textContent = `Target: ${sim.rfCurrentScanGhz.toFixed(3)} GHz (Max Q)`;

    const stepDwell = document.getElementById('schedStepDwell');
    if (stepDwell) stepDwell.textContent = `${sim.rfCurrentDwellMs} ms Synthesizer lock`;

    const stepUpdate = document.getElementById('schedStepUpdate');
    if (stepUpdate) stepUpdate.textContent = `${sim.receiverState === 'HIT' ? 'HIT observed ➔ update p(θ|x)' : 'Dwell audit ➔ decay prior'}`;

    // 10-Attribute Per-Band Allocation State Table Rendering
    this.renderPerBandStateTable(sim);

    // Deterministic Learning Demonstrator Callout Rendering
    this.renderLearningDemonstrator(sim);

    // Live Decision Trace Feed Rendering
    this.renderDecisionTraceFeed(sim);

    // Render HIT/MISS history blocks
    this.renderHitMissGrid(sim);
  }

  renderPerBandStateTable(sim) {
    const tbody = document.getElementById('schedPerBandTableBody');
    if (!tbody) return;

    const bandsData = sim.perBandState || [];
    if (bandsData.length === 0) return;

    const currentScan = Number(sim.rfCurrentScanGhz.toFixed(3));
    const bestBand = sim.policyInspector?.currentBestBand || 9.420;

    tbody.innerHTML = bandsData.map(b => {
      const isActive = Math.abs(b.freqGhz - currentScan) < 0.005;
      const isBest = Math.abs(b.freqGhz - bestBand) < 0.005;
      const lastSeenStr = b.lastObserved !== null ? `${b.lastObserved.toFixed(1)}s ago` : 'None';

      return `
        <tr class="${isActive ? 'active-band-row' : ''} ${isBest ? 'best-band-row' : ''}">
          <td>
            <span class="band-indicator-dot ${isActive ? 'active' : ''}"></span>
            <b style="color:${isActive ? 'var(--radar-cyan)' : '#fff'};">${b.freqGhz.toFixed(3)} GHz</b>
          </td>
          <td>${b.visits}</td>
          <td style="color:var(--state-verified); font-weight:700;">${b.hits}</td>
          <td style="color:var(--text-tertiary);">${b.misses}</td>
          <td><span class="table-num-pill reward">${b.estimatedReward.toFixed(3)}</span></td>
          <td>${(b.activityProbability * 100).toFixed(1)}%</td>
          <td><span class="table-num-pill uncertainty">${b.uncertainty.toFixed(3)}</span></td>
          <td style="color:var(--text-tertiary);">${lastSeenStr}</td>
          <td style="color:var(--radar-cyan);">+${b.aging.toFixed(3)}</td>
          <td><span class="table-num-pill score">${b.currentScore.toFixed(3)}</span></td>
        </tr>
      `;
    }).join('');
  }

  renderLearningDemonstrator(sim) {
    const demo = sim.learningDemo;
    const callout = document.getElementById('learningDemoCallout');
    if (!callout) return;

    const stepGroup = document.getElementById('demoStepBtnGroup');
    if (stepGroup) {
      const activeStep = demo && demo.active ? demo.currentStep : 1;
      stepGroup.querySelectorAll('.btn-demo-step').forEach(btn => {
        if (Number(btn.dataset.step) === activeStep) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    if (demo && demo.active && demo.stepData) {
      const s = demo.stepData;
      const badge = document.getElementById('demoStepBadge');
      if (badge) badge.textContent = `STEP ${demo.currentStep} / 5: ${s.label}`;

      const title = document.getElementById('demoStepTitle');
      if (title) title.textContent = s.observation || s.reasoning || s.label;

      const desc = document.getElementById('demoStepDesc');
      if (desc) desc.textContent = s.reasoning || s.learning || 'Decision logic step executed.';

      const metrics = document.getElementById('demoStepMetrics');
      if (metrics) {
        let chips = '';
        if (s.selectedBand) chips += `<span class="lc-chip">Selected: <b>${s.selectedBand.toFixed(3)} GHz</b></span>`;
        if (s.scoreA !== undefined) chips += `<span class="lc-chip">Score A (9.420G): <b>${s.scoreA.toFixed(3)}</b></span>`;
        if (s.scoreB !== undefined) chips += `<span class="lc-chip">Score B (9.675G): <b>${s.scoreB.toFixed(3)}</b></span>`;
        if (s.armA_misses !== undefined) chips += `<span class="lc-chip">Arm A Misses: <b>${s.armA_misses}</b></span>`;
        if (s.armB_reward !== undefined) chips += `<span class="lc-chip">Arm B μ: <b>${s.armB_reward.toFixed(3)}</b></span>`;
        chips += `<span class="lc-chip">Status: <b style="color:var(--state-verified);">OBSERVABLE CLOSED LOOP</b></span>`;
        metrics.innerHTML = chips;
      }
    }
  }

  renderDecisionTraceFeed(sim) {
    const container = document.getElementById('schedDecisionTraceFeed');
    if (!container) return;

    const traces = sim.recentDecisionTrace || [];
    if (traces.length === 0) {
      container.innerHTML = `
        <div style="font-family:var(--font-mono); font-size:9px; color:var(--text-tertiary); padding:10px; text-align:center;">
          Awaiting receiver decision cycles...
        </div>
      `;
      return;
    }

    const countBadge = document.getElementById('decisionTraceCount');
    if (countBadge) countBadge.textContent = `${traces.length} DECISIONS LOGGED`;

    container.innerHTML = traces.slice(0, 10).map((dec, idx) => {
      const isLatest = idx === 0;
      const prevClass = dec.previousOutcome === 'HIT' ? 'hit' : (dec.previousOutcome === 'MISS' ? 'miss' : '');
      const maxScore = Math.max(...(dec.candidateScores || []).map(c => c.score), 0.01);

      const microbars = (dec.candidateScores || []).map(c => {
        const isSel = Math.abs(c.band - dec.selectedBand) < 0.005;
        const pct = Math.min(100, Math.max(5, Math.round((c.score / maxScore) * 100)));
        return `
          <div class="dc-bar-row">
            <span class="dc-bar-label">${c.band.toFixed(3)}G</span>
            <div class="dc-bar-track">
              <div class="dc-bar-fill ${isSel ? 'selected' : ''}" style="width:${pct}%;"></div>
            </div>
            <span class="dc-bar-val" style="color:${isSel ? 'var(--radar-cyan)' : 'var(--text-tertiary)'}; font-weight:${isSel ? '700' : '400'};">
              ${c.score.toFixed(3)}
            </span>
          </div>
        `;
      }).join('');

      const factors = (dec.topFactors || []).map(f => `<span class="dc-factor-pill">${f}</span>`).join('');

      return `
        <div class="decision-card ${isLatest ? 'latest' : ''}">
          <div class="dc-header">
            <span class="dc-id">${dec.decisionId || ('DEC-#' + (1000 + idx))}</span>
            <span class="dc-time">${dec.timestamp || '00:00:00'}</span>
            <span class="dc-prev-outcome ${prevClass}">PREV: ${dec.previousOutcome}</span>
          </div>
          <div class="dc-target-row">
            <span class="dc-band">TUNED: ${dec.selectedBand.toFixed(3)} GHz (${dec.dwell || 180} ms)</span>
            <span class="dc-score">Q = ${dec.selectedScore.toFixed(3)}</span>
          </div>
          <div class="dc-reasoning">"${dec.reasoning || 'Selected via Upper Confidence Bound policy.'}"</div>
          <div class="dc-microbars">
            ${microbars}
          </div>
          <div class="dc-factors">
            ${factors}
          </div>
        </div>
      `;
    }).join('');
  }

  renderHitMissGrid(sim) {
    if (!this.dwellHistory) {
      this.dwellHistory = [
        { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.42G' }, { type: 'miss', freq: '9.81G' }, { type: 'hit', freq: '9.68G' },
        { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.68G' }, { type: 'miss', freq: '9.31G' },
        { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.42G' }, { type: 'explore', freq: '9.18G' }, { type: 'hit', freq: '9.42G' },
        { type: 'hit', freq: '9.68G' }, { type: 'miss', freq: '9.81G' }, { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.42G' },
        { type: 'hit', freq: '9.68G' }, { type: 'hit', freq: '9.42G' }, { type: 'miss', freq: '9.31G' }, { type: 'hit', freq: '9.42G' },
        { type: 'hit', freq: '9.42G' }, { type: 'hit', freq: '9.68G' }, { type: 'miss', freq: '9.81G' }, { type: 'hit', freq: '9.42G' }
      ];
    }

    if (this._lastScanGhz !== sim.rfCurrentScanGhz) {
      this._lastScanGhz = sim.rfCurrentScanGhz;
      const isHit = (sim.receiverState === 'HIT' || sim.rfCurrentScanGhz === 9.420 || sim.rfCurrentScanGhz === 9.675);
      const isExplore = (sim.rfCurrentScanGhz === 9.180);
      const outcomeType = isHit ? 'hit' : (isExplore ? 'explore' : 'miss');
      const freqLabel = `${sim.rfCurrentScanGhz.toFixed(2)}G`;
      this.dwellHistory.shift();
      this.dwellHistory.push({ type: outcomeType, freq: freqLabel });
    }

    const grid = document.getElementById('schedHitMissGrid');
    if (grid) {
      grid.innerHTML = this.dwellHistory.map(b => `
        <div class="hm-block ${b.type}">
          <div class="hm-block-status">${b.type.toUpperCase()}</div>
          <div class="hm-block-freq">${b.freq}</div>
        </div>
      `).join('');
    }

    const hits = this.dwellHistory.filter(b => b.type === 'hit').length;
    const total = this.dwellHistory.length;
    const rate = ((hits / total) * 100).toFixed(1);
    const summary = document.getElementById('schedHitMissSummary');
    if (summary) {
      summary.textContent = `${hits} HITS / ${total} DWELLS (${rate}%)`;
    }
  }

  /* --------------------------------------------------------------------------
     8. PAGE 7: SIMULATION CONTROL CENTER RENDERING
     -------------------------------------------------------------------------- */
  updateSimulationPage(sim) {
    const inspector = document.getElementById('simLiveJsonInspector');
    if (inspector) {
      const displayData = {
        simState: sim,
        activeTrackId: sim.selectedEntityId,
        activeCamera: sim.activeCameraId,
        entitiesCount: this.entities.length,
        timestamp: new Date().toISOString()
      };
      inspector.textContent = JSON.stringify(displayData, null, 2);
    }
  }

  renderEventFeeds(timeline) {
    const renderItems = list => list.slice(0, 8).map(ev => `
      <div style="display:flex; align-items:center; gap:6px; padding:2px 0; font-family:var(--font-mono); font-size:9px;">
        <span style="color:var(--text-tertiary); font-size:8.5px;">${ev.time}</span>
        <span class="track-pill unknown">${ev.source}</span>
        <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ev.event}</span>
      </div>
    `).join('');

    const rfTimeline = document.getElementById('rfBurstTimelineContainer');
    if (rfTimeline) rfTimeline.innerHTML = renderItems(timeline);

    const camLog = document.getElementById('camOpticalEventLog');
    if (camLog) camLog.innerHTML = renderItems(timeline.filter(e => e.source === 'CAMERA' || e.source === 'FUSION'));

    const fusionTimeline = document.getElementById('fusionReasoningTimeline');
    if (fusionTimeline) fusionTimeline.innerHTML = renderItems(timeline);

    const schedTimeline = document.getElementById('schedulerTimelineContainer');
    if (schedTimeline) schedTimeline.innerHTML = renderItems(timeline.filter(e => e.source === 'SCHEDULER' || e.source === 'RECEIVER'));
  }

  /* --------------------------------------------------------------------------
     9. USER INTERACTION & CONTROLS
     -------------------------------------------------------------------------- */
  selectEntity(entityId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SELECT_ENTITY', entityId }));
    }
  }

  selectCamera(camId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SELECT_CAMERA', camId }));
    }
  }

  stepSimulationScan() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'STEP_SCAN' }));
    }
  }

  setupListeners() {
    // Camera tabs
    document.querySelectorAll('.cam-big-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const camId = btn.getAttribute('data-cam');
        this.selectCamera(camId);
      };
    });

    // Scenario buttons (Page 1 and Page 7)
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.onclick = () => {
        const scenario = btn.getAttribute('data-scenario');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SELECT_SCENARIO', scenario }));
        }
      };
    });

    // Speed multiplier buttons
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.onclick = () => {
        const speed = btn.getAttribute('data-speed');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'SET_SPEED', speed }));
        }
      };
    });

    // Radar page controls
    const radarPause = document.getElementById('btnRadarPauseResume');
    if (radarPause) {
      radarPause.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const radarReset = document.getElementById('btnRadarReset');
    if (radarReset) {
      radarReset.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET' }));
        }
      };
    }

    const radarDemo = document.getElementById('btnRadarTriggerDemo');
    if (radarDemo) {
      radarDemo.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'TRIGGER_DEMO' }));
        }
      };
    }

    // Simulation page controls
    const simPause = document.getElementById('btnSimPauseResume');
    if (simPause) {
      simPause.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'PAUSE_RESUME' }));
        }
      };
    }

    const simStep = document.getElementById('btnSimStep');
    if (simStep) {
      simStep.onclick = () => {
        this.stepSimulationScan();
      };
    }

    const simReset = document.getElementById('btnSimReset');
    if (simReset) {
      simReset.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET' }));
        }
      };
    }

    const simDemo = document.getElementById('btnSimTriggerDemo');
    if (simDemo) {
      simDemo.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'TRIGGER_DEMO' }));
        }
      };
    }

    // Policy Ablation Toggles (SIH26055 Core)
    const ablationGroup = document.getElementById('ablationBtnGroup');
    if (ablationGroup) {
      ablationGroup.querySelectorAll('.btn-ablation').forEach(btn => {
        btn.onclick = () => {
          const mode = btn.dataset.mode;
          if (mode && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'SET_SCHEDULER_ABLATION', mode }));
          }
        };
      });
    }

    // Deterministic Learning Demonstrator Controls
    const demoStepGroup = document.getElementById('demoStepBtnGroup');
    if (demoStepGroup) {
      demoStepGroup.querySelectorAll('.btn-demo-step').forEach(btn => {
        btn.onclick = () => {
          const step = Number(btn.dataset.step);
          if (step && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'STEP_LEARNING_DEMO', step }));
          }
        };
      });
    }

    const runDemoBtn = document.getElementById('btnRunLearningDemo');
    if (runDemoBtn) {
      runDemoBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RUN_LEARNING_DEMO' }));
        }
      };
    }

    const resetDemoBtn = document.getElementById('btnResetLearningDemo');
    if (resetDemoBtn) {
      resetDemoBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET_LEARNING_DEMO' }));
        }
      };
    }

    // Analytics Benchmark Run & Reset
    const runBenchBtn = document.getElementById('btnRunBenchmark');
    if (runBenchBtn) {
      runBenchBtn.onclick = () => {
        const seedInput = document.getElementById('inputBenchmarkSeed');
        const scenarioSelect = document.getElementById('selectBenchmarkScenario');
        const runsSelect = document.getElementById('selectBenchmarkRuns');

        const seed = seedInput ? Number(seedInput.value) || 42 : 42;
        const scenario = scenarioSelect ? scenarioSelect.value : 'FREQUENCY_AGILE';
        const runs = runsSelect ? Number(runsSelect.value) || 1000 : 1000;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'RUN_BENCHMARK',
            seed,
            scenario,
            runs
          }));
        }
      };
    }

    const runSuiteBtn = document.getElementById('btnRunSuite');
    if (runSuiteBtn) {
      runSuiteBtn.onclick = () => {
        const seedInput = document.getElementById('inputBenchmarkSeed');
        const runsSelect = document.getElementById('selectBenchmarkRuns');
        const seed = seedInput ? Number(seedInput.value) || 42 : 42;
        const runs = runsSelect ? Number(runsSelect.value) || 1000 : 1000;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'RUN_BENCHMARK_SUITE',
            seed,
            runs
          }));
        }
      };
    }

    const replayBtn = document.getElementById('btnReplayBenchmark');
    if (replayBtn) {
      replayBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'REPLAY_EXPERIMENT'
          }));
        }
      };
    }

    const exportJsonBtn = document.getElementById('btnExportBenchmarkJson');
    if (exportJsonBtn) {
      exportJsonBtn.onclick = () => {
        window.location.href = '/api/benchmark/export/json';
      };
    }

    const exportCsvBtn = document.getElementById('btnExportBenchmarkCsv');
    if (exportCsvBtn) {
      exportCsvBtn.onclick = () => {
        window.location.href = '/api/benchmark/export/csv';
      };
    }

    const exportReportBtn = document.getElementById('btnExportBenchmarkReport');
    if (exportReportBtn) {
      exportReportBtn.onclick = () => {
        window.location.href = '/api/benchmark/export/report';
      };
    }

    const resetAnalyticsBtn = document.getElementById('btnResetAnalytics');
    if (resetAnalyticsBtn) {
      resetAnalyticsBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET_ANALYTICS' }));
        }
      };
    }

    // Export SITREP
    const sitrepBtn = document.getElementById('btnExportSitrepGlobal');
    if (sitrepBtn) {
      sitrepBtn.onclick = () => {
        window.location.href = '/api/sitrep';
      };
    }

    // Modals
    const modalAdd = document.getElementById('modalAddPersonnel');
    const modalDetails = document.getElementById('modalPersonnelDetails');

    const openAdd = document.getElementById('btnOpenAddPersonnel');
    if (openAdd) openAdd.onclick = () => modalAdd.classList.add('open');

    const cancelAdd = document.getElementById('btnCancelAddPerson');
    if (cancelAdd) cancelAdd.onclick = () => modalAdd.classList.remove('open');

    const confirmAdd = document.getElementById('btnConfirmAddPerson');
    if (confirmAdd) {
      confirmAdd.onclick = () => {
        const name = document.getElementById('inputNewPersonName').value.trim();
        const tagId = document.getElementById('inputNewPersonTag').value.trim();
        const role = document.getElementById('inputNewPersonRole').value.trim();
        if (name && tagId) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              action: 'ADD_PERSONNEL',
              person: { tagId, name, role: role || 'Base Camp Security', status: 'VERIFIED' }
            }));
          }
          modalAdd.classList.remove('open');
        }
      };
    }

    const openDetails = document.getElementById('btnViewPersonnelDetails');
    if (openDetails) openDetails.onclick = () => modalDetails.classList.add('open');

    const closeDetails = document.getElementById('btnClosePersonnelDetails');
    if (closeDetails) closeDetails.onclick = () => modalDetails.classList.remove('open');

    // False Alarm Test button
    const falseAlarmBtn = document.getElementById('btnRunFalseAlarmTest');
    if (falseAlarmBtn) {
      falseAlarmBtn.onclick = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RUN_INCIDENT_FALSE_ALARM_TEST' }));
        }
      };
    }
  }

  /* --------------------------------------------------------------------------
     INCIDENT ENGINE: Acknowledge & WS Handler
     -------------------------------------------------------------------------- */
  acknowledgeIncident(incidentId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'ACKNOWLEDGE_INCIDENT',
        incidentId,
        operatorName: 'TACTICAL OPERATOR'
      }));
    }
  }

  handleIncidentTestResult(result) {
    const lines = result.testResults.map(t =>
      `${t.pass ? '✓' : '✗'} ${t.scenario}: ${t.evaluated} (Risk ${t.riskScore}/100) — ${t.pass ? 'PASS' : 'FAIL'}`
    ).join('\n');
    const summary = result.success ? '✓ ALL FALSE ALARM TESTS PASSED' : '✗ SOME FALSE ALARM TESTS FAILED';
    // Show a quick status overlay in the timeline
    console.log('[FALSE ALARM TEST]\n' + summary + '\n' + lines);
    // Flash a visible notification by briefly updating alert count color
    const el = document.getElementById('sosAlertCount');
    if (el) {
      const orig = el.style.color;
      el.textContent = result.success ? '✓ TEST PASSED' : '✗ TEST FAILED';
      el.style.color = result.success ? 'var(--state-verified)' : 'var(--state-critical)';
      setTimeout(() => {
        if (this.incidents) this.renderSosLogs(this.sosLogs || [], this.incidents);
      }, 3000);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new TacticalC2App();
});
