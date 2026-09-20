/**
 * ESM-ASTRA: Simulated Security Alert & Incident Response Engine
 * Problem Statement: SIH26055 (Adaptive Scan Strategy for Electronic Warfare)
 * 
 * IMPORTANT DISCLAIMER & POSITIONING:
 * This module generates SIMULATED SECURITY ALERTS and SIMULATED INCIDENT DISPATCH records
 * for demonstration, multi-sensor situational awareness, and benchmarking.
 * IT IS A PROTOTYPE SIMULATION ONLY AND DOES NOT CONNECT TO REAL QRT, MILITARY NETWORKS,
 * SMS GATEWAYS, OR COMMAND NETWORKS.
 */

class IncidentEngine {
  constructor() {
    this.incidents = [
      {
        incidentId: 'INC-SIM-2026-0089',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        timeStr: '14:10:12',
        entityId: 'TRK-021',
        position: { x: -160, y: 220, lat: 28.6139, lon: 77.2090 },
        range: 272,
        azimuth: 324,
        speed: 12.1,
        heading: 145,
        sensorEvidence: {
          radar: true,
          camera: true,
          rfCorrelation: true,
          restrictedZone: true,
          unauthorized: true,
          evidenceCount: 5
        },
        riskScore: 92,
        alertLevel: 'CRITICAL SIMULATION EVENT',
        dispatchType: 'SIMULATED INCIDENT DISPATCH',
        status: 'ACTIVE', // 'ACTIVE', 'ALERT ACKNOWLEDGED'
        disclaimer: 'PROTOTYPE / SIMULATION ONLY - NOT CONNECTED TO REAL QRT OR MILITARY NETWORKS',
        auditTrail: [
          { timestamp: new Date(Date.now() - 610000).toISOString(), stage: 'event detected', details: 'Sensor fusion detected contact TRK-021 at 272m North Gate' },
          { timestamp: new Date(Date.now() - 605000).toISOString(), stage: 'risk increased', details: 'Risk score elevated to 92 (Multi-sensor evidence correlated)' },
          { timestamp: new Date(Date.now() - 600000).toISOString(), stage: 'alarm triggered', details: 'CRITICAL SIMULATION EVENT triggered for TRK-021' }
        ]
      },
      {
        incidentId: 'INC-SIM-2026-0088',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        timeStr: '13:50:44',
        entityId: 'TRK-019',
        position: { x: 450, y: -260, lat: 28.6180, lon: 77.2150 },
        range: 520,
        azimuth: 120,
        speed: 4.2,
        heading: 88,
        sensorEvidence: {
          radar: true,
          camera: true,
          rfCorrelation: false,
          restrictedZone: false,
          unauthorized: false,
          evidenceCount: 2
        },
        riskScore: 12,
        alertLevel: 'NONE',
        dispatchType: 'SIMULATED INCIDENT DISPATCH',
        status: 'ALERT ACKNOWLEDGED',
        disclaimer: 'PROTOTYPE / SIMULATION ONLY - NOT CONNECTED TO REAL QRT OR MILITARY NETWORKS',
        auditTrail: [
          { timestamp: new Date(Date.now() - 1810000).toISOString(), stage: 'event detected', details: 'Fauna movement detected in Sector East' },
          { timestamp: new Date(Date.now() - 1805000).toISOString(), stage: 'risk increased', details: 'Anomaly score 12 (Fauna classified)' },
          { timestamp: new Date(Date.now() - 1800000).toISOString(), stage: 'operator acknowledged', details: 'WILDLIFE FILTERED - No alert required' }
        ]
      }
    ];

    this.nextIncidentSeq = 90;
  }

  /**
   * Evaluate a simulated entity against multi-sensor trigger criteria
   * @param {Object} entity Master entity state
   * @param {number} perimeterRadiusMeters Restricted zone radius threshold (default 450m)
   * @returns {Object} Evaluation result and incident object if alert triggered
   */
  evaluateEntity(entity, perimeterRadiusMeters = 450) {
    const isRadarConfirmed = Boolean(entity.radar && entity.radar.detected);
    const isCameraConfirmed = Boolean(entity.camera && entity.camera.isVisuallyConfirmed);
    const isRfCorrelated = Boolean(entity.rf && entity.rf.hasEmitter && entity.rf.isTransmitting);
    const isRestrictedZone = Boolean(entity.radar && entity.radar.range <= perimeterRadiusMeters);
    const isAuthorized = Boolean(entity.personnel && entity.personnel.matched);
    const isWildlife = entity.type === 'WILDLIFE';

    const sensorEvidence = {
      radar: isRadarConfirmed,
      camera: isCameraConfirmed,
      rfCorrelation: isRfCorrelated,
      restrictedZone: isRestrictedZone,
      unauthorized: !isAuthorized && !isWildlife,
      evidenceCount: (isRadarConfirmed ? 1 : 0) +
                     (isCameraConfirmed ? 1 : 0) +
                     (isRfCorrelated ? 1 : 0) +
                     (isRestrictedZone ? 1 : 0) +
                     (!isAuthorized && !isWildlife ? 1 : 0)
    };

    let riskScore = 0;
    let alertLevel = 'NONE';

    if (isAuthorized) {
      // Rule 1: AUTHORIZED PERSON -> No Alarm
      riskScore = 10;
      alertLevel = 'NONE';
    } else if (isWildlife) {
      // Rule 2: WILDLIFE / ENVIRONMENTAL -> No High-Risk Alarm
      riskScore = 12;
      alertLevel = 'NONE';
    } else {
      // Calculate dynamic risk score based on multi-sensor evidence
      if (!isAuthorized) riskScore += 30;
      if (isRestrictedZone) riskScore += 25;
      if (isRadarConfirmed) riskScore += 15;
      if (isCameraConfirmed) riskScore += 15;
      if (isRfCorrelated) riskScore += 15;

      riskScore = Math.min(100, riskScore);

      // Trigger Logic Evaluation:
      // UNAUTHORIZED + RADAR + CAMERA + RF CORRELATION + RESTRICTED ZONE -> CRITICAL SIMULATION EVENT
      if (!isAuthorized && isRestrictedZone && isRadarConfirmed && isCameraConfirmed && isRfCorrelated && riskScore >= 90) {
        alertLevel = 'CRITICAL SIMULATION EVENT';
      }
      // UNAUTHORIZED + RESTRICTED ZONE + RADAR CONFIRMATION -> HIGH-RISK SIMULATED EVENT
      else if (!isAuthorized && isRestrictedZone && isRadarConfirmed && riskScore >= 70) {
        alertLevel = 'HIGH-RISK SIMULATED EVENT';
      }
    }

    let incident = null;

    if (alertLevel !== 'NONE') {
      const existing = this.incidents.find(inc => inc.entityId === entity.id && inc.status === 'ACTIVE');
      const nowIso = new Date().toISOString();
      const timeStr = new Date().toTimeString().split(' ')[0];

      if (existing) {
        existing.riskScore = riskScore;
        existing.alertLevel = alertLevel;
        existing.range = entity.radar.range;
        existing.azimuth = entity.radar.azimuth;
        existing.speed = entity.radar.speedKmh;
        existing.heading = entity.radar.heading;
        existing.position = {
          x: entity.radar.x,
          y: entity.radar.y,
          lat: Number((28.6139 + entity.radar.y * 0.00001).toFixed(6)),
          lon: Number((77.2090 + entity.radar.x * 0.00001).toFixed(6))
        };
        existing.sensorEvidence = sensorEvidence;
        incident = existing;
      } else {
        const incidentId = `INC-SIM-2026-00${this.nextIncidentSeq++}`;
        const newIncident = {
          incidentId,
          timestamp: nowIso,
          timeStr,
          entityId: entity.id,
          position: {
            x: entity.radar.x,
            y: entity.radar.y,
            lat: Number((28.6139 + entity.radar.y * 0.00001).toFixed(6)),
            lon: Number((77.2090 + entity.radar.x * 0.00001).toFixed(6))
          },
          range: entity.radar.range,
          azimuth: entity.radar.azimuth,
          speed: entity.radar.speedKmh,
          heading: entity.radar.heading,
          sensorEvidence,
          riskScore,
          alertLevel,
          dispatchType: 'SIMULATED INCIDENT DISPATCH',
          status: 'ACTIVE',
          disclaimer: 'PROTOTYPE / SIMULATION ONLY - NOT CONNECTED TO REAL QRT OR MILITARY NETWORKS',
          auditTrail: [
            { timestamp: nowIso, stage: 'event detected', details: `Multi-sensor contact ${entity.id} detected at ${entity.radar.range}m range` },
            { timestamp: nowIso, stage: 'risk increased', details: `Risk score calculated at ${riskScore} (${sensorEvidence.evidenceCount}/5 sensors correlated)` },
            { timestamp: nowIso, stage: 'alarm triggered', details: `${alertLevel} triggered for ${entity.id}` }
          ]
        };
        this.incidents.unshift(newIncident);
        incident = newIncident;
      }
    }

    return {
      entityId: entity.id,
      riskScore,
      alertLevel,
      sensorEvidence,
      incident
    };
  }

  /**
   * Operator Acknowledgement of a Simulated Security Alert
   * @param {string} incidentId Incident ID or Entity ID to acknowledge
   * @param {string} operatorName Optional operator name
   * @returns {Object|null} Updated incident object
   */
  acknowledgeIncident(incidentId, operatorName = 'TACTICAL OPERATOR') {
    const inc = this.incidents.find(i => i.incidentId === incidentId || i.entityId === incidentId);
    if (!inc) return null;

    if (inc.status !== 'ALERT ACKNOWLEDGED') {
      inc.status = 'ALERT ACKNOWLEDGED';
      const nowIso = new Date().toISOString();
      inc.auditTrail.push({
        timestamp: nowIso,
        stage: 'operator acknowledged',
        details: `ALERT ACKNOWLEDGED by ${operatorName}`
      });
    }
    return inc;
  }

  /**
   * Retrieve all simulated incidents in memory
   */
  getIncidents() {
    return this.incidents;
  }

  /**
   * Run False Alarm Test Suite across 3 mandated scenarios:
   * 1. AUTHORIZED PERSON -> Verify NO ALARM
   * 2. WILDLIFE / ENVIRONMENTAL -> Verify NO HIGH-RISK ALARM
   * 3. UNAUTHORIZED restricted-zone entry -> Verify ALERT TRIGGERED
   */
  runFalseAlarmTest() {
    // 1. Authorized Person Test Vector
    const authorizedEntity = {
      id: 'TRK-TEST-AUTH',
      type: 'PERSON',
      radar: { detected: true, range: 200, azimuth: 45, speedKmh: 4.0, heading: 90, x: 100, y: 100 },
      camera: { isVisuallyConfirmed: true },
      rf: { hasEmitter: false, isTransmitting: false },
      personnel: { matched: true, tagId: 'TAG-ALPHA-01' }
    };

    // 2. Wildlife / Environmental Test Vector
    const wildlifeEntity = {
      id: 'TRK-TEST-WILD',
      type: 'WILDLIFE',
      radar: { detected: true, range: 300, azimuth: 120, speedKmh: 3.5, heading: 180, x: 200, y: -200 },
      camera: { isVisuallyConfirmed: true },
      rf: { hasEmitter: false, isTransmitting: false },
      personnel: { matched: false }
    };

    // 3. Unauthorized Entry Test Vector
    const unauthorizedEntity = {
      id: 'TRK-TEST-UNAUTH',
      type: 'PERSON',
      radar: { detected: true, range: 250, azimuth: 320, speedKmh: 12.0, heading: 140, x: -150, y: 200 },
      camera: { isVisuallyConfirmed: true },
      rf: { hasEmitter: true, isTransmitting: true },
      personnel: { matched: false }
    };

    const evalAuth = this.evaluateEntity(authorizedEntity);
    const evalWild = this.evaluateEntity(wildlifeEntity);
    const evalUnauth = this.evaluateEntity(unauthorizedEntity);

    const authPass = evalAuth.alertLevel === 'NONE' && evalAuth.riskScore <= 30;
    const wildPass = evalWild.alertLevel === 'NONE' && evalWild.riskScore <= 30;
    const unauthPass = (evalUnauth.alertLevel === 'HIGH-RISK SIMULATED EVENT' || evalUnauth.alertLevel === 'CRITICAL SIMULATION EVENT') && evalUnauth.riskScore >= 70;

    return {
      success: authPass && wildPass && unauthPass,
      testResults: [
        { scenario: 'AUTHORIZED PERSON', expected: 'NO ALARM', evaluated: evalAuth.alertLevel, riskScore: evalAuth.riskScore, pass: authPass },
        { scenario: 'WILDLIFE / ENVIRONMENTAL', expected: 'NO HIGH-RISK ALARM', evaluated: evalWild.alertLevel, riskScore: evalWild.riskScore, pass: wildPass },
        { scenario: 'UNAUTHORIZED ENTRY', expected: 'HIGH-RISK / CRITICAL ALERT', evaluated: evalUnauth.alertLevel, riskScore: evalUnauth.riskScore, pass: unauthPass }
      ]
    };
  }

  /**
   * Export formal SIMULATION INCIDENT REPORT (SITREP)
   * @param {Object} simState Live simulation state
   * @returns {string} Formatted text report
   */
  generateSitrepReport(simState = {}) {
    const now = new Date();
    let sitrep = `========================================================================\n`;
    sitrep += `ESM-ASTRA // SIMULATION INCIDENT REPORT (SITREP)\n`;
    sitrep += `CLASSIFICATION: PROTOTYPE / SIMULATION ONLY\n`;
    sitrep += `DISCLAIMER: THIS SYSTEM IS A PROTOTYPE / SIMULATION FOR SIH26055.\n`;
    sitrep += `IT DOES NOT CONNECT TO REAL QRT, MILITARY NETWORKS, SMS GATEWAYS, OR COMMAND NETWORKS.\n`;
    sitrep += `========================================================================\n\n`;

    sitrep += `[1. EXECUTIVE SIMULATION METADATA]\n`;
    sitrep += `  - Simulation ID: ${simState.simulationId || 'SIM-EW-2026-0941'}\n`;
    sitrep += `  - Operating Mode: ${simState.operatingMode || 'TACTICAL MONITORING'}\n`;
    sitrep += `  - Time of Report: ${now.toISOString()}\n`;
    sitrep += `  - EW Scheduler Engine: ${simState.schedulerPolicy || 'Recency-Augmented UCB1'}\n`;
    sitrep += `  - Active Tuned Scan Frequency: ${simState.rfCurrentScanGhz ? simState.rfCurrentScanGhz.toFixed(3) : '9.420'} GHz\n\n`;

    sitrep += `[2. SIMULATED SECURITY ALERTS & DISPATCH LOG]\n`;
    if (this.incidents.length === 0) {
      sitrep += `  (No simulated security alerts recorded)\n`;
    } else {
      this.incidents.forEach(inc => {
        sitrep += `  ----------------------------------------------------------------------\n`;
        sitrep += `  INCIDENT ID: ${inc.incidentId} | STATUS: ${inc.status}\n`;
        sitrep += `  ALERT LEVEL: ${inc.alertLevel} | DISPATCH: ${inc.dispatchType}\n`;
        sitrep += `  TARGET ENTITY: ${inc.entityId} | RISK SCORE: ${inc.riskScore} / 100\n`;
        sitrep += `  POSITION: Range ${inc.range}m | Azimuth ${inc.azimuth}° | Speed ${inc.speed} km/h | Heading ${inc.heading}°\n`;
        sitrep += `  SENSOR EVIDENCE: Radar=${inc.sensorEvidence.radar}, Camera=${inc.sensorEvidence.camera}, RF=${inc.sensorEvidence.rfCorrelation}, RestrictedZone=${inc.sensorEvidence.restrictedZone}, Unauthorized=${inc.sensorEvidence.unauthorized} (${inc.sensorEvidence.evidenceCount}/5)\n`;
        sitrep += `  AUDIT TRAIL:\n`;
        inc.auditTrail.forEach(a => {
          sitrep += `    - [${a.timestamp}] STAGE: ${a.stage.toUpperCase()} => ${a.details}\n`;
        });
      });
    }
    sitrep += `\n========================================================================\n`;
    sitrep += `END OF SIMULATION INCIDENT REPORT (PROTOTYPE / SIMULATION ONLY)\n`;
    sitrep += `========================================================================\n`;

    return sitrep;
  }
}

module.exports = { IncidentEngine };
