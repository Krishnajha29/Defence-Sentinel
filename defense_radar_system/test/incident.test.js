/**
 * ESM-ASTRA: Suite L — Simulated Security Alert & Incident Response Engine
 * Tests: trigger logic, payload schema, audit trail, false alarm filter, acknowledge, SITREP export
 */

const { IncidentEngine } = require('../server/incident_engine');

function runSuiteLTests() {
  console.log('\n🧪 RUNNING SUITE L: Simulated Security Alert & Incident Response Engine...');
  let pass = 0, fail = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  ✓ ${desc}`);
      pass++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      fail++;
    }
  }

  const engine = new IncidentEngine();

  // ────────────────────────────────────────────────────────────────────
  // 1. FALSE ALARM TEST SUITE
  // ────────────────────────────────────────────────────────────────────
  const falseAlarmResult = engine.runFalseAlarmTest();

  assert('False alarm test suite runs successfully', falseAlarmResult && typeof falseAlarmResult.success === 'boolean');
  assert('False alarm test contains 3 scenarios', Array.isArray(falseAlarmResult.testResults) && falseAlarmResult.testResults.length === 3);

  const authTest = falseAlarmResult.testResults.find(t => t.scenario === 'AUTHORIZED PERSON');
  assert('AUTHORIZED PERSON → NO ALARM (alertLevel = NONE)', authTest && authTest.evaluated === 'NONE');
  assert('AUTHORIZED PERSON risk score ≤ 30', authTest && authTest.riskScore <= 30);
  assert('AUTHORIZED PERSON test PASS', authTest && authTest.pass === true);

  const wildTest = falseAlarmResult.testResults.find(t => t.scenario === 'WILDLIFE / ENVIRONMENTAL');
  assert('WILDLIFE → NO HIGH-RISK ALARM (alertLevel = NONE)', wildTest && wildTest.evaluated === 'NONE');
  assert('WILDLIFE risk score ≤ 30', wildTest && wildTest.riskScore <= 30);
  assert('WILDLIFE test PASS', wildTest && wildTest.pass === true);

  const unauthTest = falseAlarmResult.testResults.find(t => t.scenario === 'UNAUTHORIZED ENTRY');
  assert('UNAUTHORIZED ENTRY → HIGH-RISK or CRITICAL alert', unauthTest &&
    (unauthTest.evaluated === 'HIGH-RISK SIMULATED EVENT' || unauthTest.evaluated === 'CRITICAL SIMULATION EVENT'));
  assert('UNAUTHORIZED ENTRY risk score ≥ 70', unauthTest && unauthTest.riskScore >= 70);
  assert('UNAUTHORIZED ENTRY test PASS', unauthTest && unauthTest.pass === true);

  assert('Overall false alarm test suite PASS', falseAlarmResult.success === true);

  // ────────────────────────────────────────────────────────────────────
  // 2. TRIGGER LOGIC — HIGH-RISK SIMULATED EVENT
  // ────────────────────────────────────────────────────────────────────
  const highRiskEntity = {
    id: 'TRK-L-001',
    type: 'PERSON',
    radar: { detected: true, range: 300, azimuth: 45, speedKmh: 8.0, heading: 90, x: 200, y: 200 },
    camera: { isVisuallyConfirmed: false },
    rf: { hasEmitter: false, isTransmitting: false },
    personnel: { matched: false }
  };

  const highRiskResult = engine.evaluateEntity(highRiskEntity, 450);
  assert('UNAUTHORIZED + RADAR + RESTRICTED ZONE → HIGH-RISK SIMULATED EVENT',
    highRiskResult.alertLevel === 'HIGH-RISK SIMULATED EVENT');
  assert('HIGH-RISK risk score ≥ 70', highRiskResult.riskScore >= 70);

  // ────────────────────────────────────────────────────────────────────
  // 3. TRIGGER LOGIC — CRITICAL SIMULATION EVENT
  // ────────────────────────────────────────────────────────────────────
  const criticalEntity = {
    id: 'TRK-L-002',
    type: 'PERSON',
    radar: { detected: true, range: 250, azimuth: 320, speedKmh: 12.0, heading: 140, x: -150, y: 200 },
    camera: { isVisuallyConfirmed: true },
    rf: { hasEmitter: true, isTransmitting: true },
    personnel: { matched: false }
  };

  const criticalResult = engine.evaluateEntity(criticalEntity, 450);
  assert('UNAUTHORIZED + RADAR + CAMERA + RF + RESTRICTED → CRITICAL SIMULATION EVENT',
    criticalResult.alertLevel === 'CRITICAL SIMULATION EVENT');
  assert('CRITICAL risk score ≥ 90', criticalResult.riskScore >= 90);

  // ────────────────────────────────────────────────────────────────────
  // 4. INCIDENT PAYLOAD SCHEMA VALIDATION
  // ────────────────────────────────────────────────────────────────────
  const incidents = engine.getIncidents();
  const activeInc = incidents.find(i => i.status === 'ACTIVE' &&
    (i.alertLevel === 'HIGH-RISK SIMULATED EVENT' || i.alertLevel === 'CRITICAL SIMULATION EVENT'));
  assert('At least one ACTIVE incident exists after evaluations', activeInc != null);

  if (activeInc) {
    assert('Incident has incidentId', typeof activeInc.incidentId === 'string');
    assert('Incident has timestamp', typeof activeInc.timestamp === 'string');
    assert('Incident has entityId', typeof activeInc.entityId === 'string');
    assert('Incident has position object', activeInc.position && typeof activeInc.position.x === 'number');
    assert('Incident has range', typeof activeInc.range === 'number');
    assert('Incident has azimuth', typeof activeInc.azimuth === 'number');
    assert('Incident has speed', typeof activeInc.speed === 'number');
    assert('Incident has heading', typeof activeInc.heading === 'number');
    assert('Incident has sensorEvidence', activeInc.sensorEvidence && typeof activeInc.sensorEvidence.evidenceCount === 'number');
    assert('Incident has riskScore', typeof activeInc.riskScore === 'number');
    assert('Incident has dispatchType = SIMULATED INCIDENT DISPATCH', activeInc.dispatchType === 'SIMULATED INCIDENT DISPATCH');
    assert('Incident disclaimer present', activeInc.disclaimer && activeInc.disclaimer.includes('PROTOTYPE'));
  }

  // ────────────────────────────────────────────────────────────────────
  // 5. AUDIT TRAIL COMPLETENESS
  // ────────────────────────────────────────────────────────────────────
  if (activeInc) {
    assert('Audit trail is an array', Array.isArray(activeInc.auditTrail));
    assert('Audit trail has ≥ 3 entries (detected, risk raised, alarm triggered)',
      activeInc.auditTrail.length >= 3);

    const stageNames = activeInc.auditTrail.map(a => a.stage);
    assert('Audit trail contains "event detected"', stageNames.includes('event detected'));
    assert('Audit trail contains "risk increased"', stageNames.includes('risk increased'));
    assert('Audit trail contains "alarm triggered"', stageNames.includes('alarm triggered'));
  }

  // ────────────────────────────────────────────────────────────────────
  // 6. ACKNOWLEDGEMENT FLOW
  // ────────────────────────────────────────────────────────────────────
  if (activeInc) {
    const acked = engine.acknowledgeIncident(activeInc.incidentId, 'TEST OPERATOR');
    assert('Acknowledgement returns incident object', acked != null);
    assert('Status changes to ALERT ACKNOWLEDGED', acked.status === 'ALERT ACKNOWLEDGED');

    const finalTrail = acked.auditTrail;
    const ackedEntry = finalTrail.find(a => a.stage === 'operator acknowledged');
    assert('Audit trail has "operator acknowledged" entry', ackedEntry != null);
    assert('Audit trail acknowledged entry mentions operator', ackedEntry && ackedEntry.details.includes('TEST OPERATOR'));

    // Incident stays in history
    const inHistory = engine.getIncidents().find(i => i.incidentId === activeInc.incidentId);
    assert('Acknowledged incident remains in history', inHistory != null);
    assert('Acknowledged incident status is ALERT ACKNOWLEDGED in history', inHistory.status === 'ALERT ACKNOWLEDGED');
  }

  // ────────────────────────────────────────────────────────────────────
  // 7. SITREP REPORT GENERATION
  // ────────────────────────────────────────────────────────────────────
  const sitrep = engine.generateSitrepReport({
    simulationId: 'SIM-TEST-L',
    operatingMode: 'TEST MODE',
    schedulerPolicy: 'Recency-Augmented UCB1',
    rfCurrentScanGhz: 9.420
  });

  assert('SITREP is a string', typeof sitrep === 'string');
  assert('SITREP contains PROTOTYPE / SIMULATION ONLY disclaimer', sitrep.includes('PROTOTYPE / SIMULATION'));
  assert('SITREP contains SIMULATION INCIDENT REPORT heading', sitrep.includes('SIMULATION INCIDENT REPORT'));
  assert('SITREP does NOT claim real QRT connection', !sitrep.includes('REAL QRT CONNECTED') && !sitrep.includes('ACTUAL MILITARY'));
  assert('SITREP lists incidents', sitrep.includes('INCIDENT ID'));

  // ────────────────────────────────────────────────────────────────────
  // 8. OUT-OF-ZONE ENTITY DOES NOT TRIGGER ALARM
  // ────────────────────────────────────────────────────────────────────
  const farEntity = {
    id: 'TRK-L-FAR',
    type: 'PERSON',
    radar: { detected: true, range: 600, azimuth: 90, speedKmh: 3.0, heading: 0, x: 600, y: 0 },
    camera: { isVisuallyConfirmed: false },
    rf: { hasEmitter: false, isTransmitting: false },
    personnel: { matched: false }
  };
  const farResult = engine.evaluateEntity(farEntity, 450);
  assert('Entity outside restricted zone (600m > 450m) → alertLevel = NONE', farResult.alertLevel === 'NONE');

  // ────────────────────────────────────────────────────────────────────
  // RESULT
  // ────────────────────────────────────────────────────────────────────
  const total = pass + fail;
  console.log(`\n${fail === 0 ? '✅' : '❌'} Suite L: ${pass}/${total} tests passed`);
  if (fail > 0) {
    console.error(`  ${fail} test(s) FAILED`);
  }

  return { pass, fail, total, success: fail === 0 };
}

module.exports = { runSuiteLTests };

if (require.main === module) {
  const result = runSuiteLTests();
  process.exit(result.fail > 0 ? 1 : 0);
}
