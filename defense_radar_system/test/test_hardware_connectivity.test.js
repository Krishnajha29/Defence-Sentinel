/**
 * Phase 3 Hardware-Ready Data & Connectivity Test Suite
 * Verifies:
 * - Demarcation between simulation engine and physical hardware
 * - Non-fabrication of physical readings when hardware is unavailable
 * - Accurate reporting of hardware verification state (UNVERIFIED)
 * - /api/hardware/status contract integrity
 * - WebSocket hardware payload contract integrity
 */

const http = require('http');
const WebSocket = require('ws');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runHardwareTests() {
  console.log('========================================================================');
  console.log('🔌 PHASE 3 — HARDWARE-READY DATA & CONNECTIVITY INTEGRITY SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`  ✕ FAIL: ${message}`);
      throw new Error(`Hardware Test Assertion Failed: ${message}`);
    }
    console.log(`  ✓ ${message}`);
    passed++;
  }

  // 1. Audit REST endpoint /api/hardware/status
  console.log('--- 1. REST Endpoint /api/hardware/status Audit ---');
  const hwRes = await fetchJson('http://localhost:8080/api/hardware/status');
  assert(hwRes.status === 200, 'GET /api/hardware/status returns HTTP 200');
  assert(hwRes.body.dataSource === 'SIMULATION_SYNTHETIC', 'dataSource is explicitly SIMULATION_SYNTHETIC');
  assert(hwRes.body.telemetryMode === 'SIMULATION', 'telemetryMode is explicitly SIMULATION');
  assert(hwRes.body.isHardwareConnected === false, 'isHardwareConnected is strictly false (no fake hardware claims)');
  assert(hwRes.body.hardwareVerificationState === 'UNVERIFIED', 'hardwareVerificationState is strictly UNVERIFIED');
  assert(typeof hwRes.body.serverUptimeSec === 'number', 'serverUptimeSec is reported');

  // 2. Audit Adapter Registries
  console.log('\n--- 2. Subsystem Adapter Interface Demarcation ---');
  const devices = hwRes.body.devices;
  assert(!!devices, 'Hardware registry contains devices dictionary');

  // RF / SDR Adapter
  const rf = devices.rfReceiver;
  assert(rf && rf.driverAdapter === 'USRP_UHD_SDR_ADAPTER', 'RF Adapter specifies USRP_UHD_SDR_ADAPTER');
  assert(rf.status === 'DEVICE_UNAVAILABLE', 'RF physical status is DEVICE_UNAVAILABLE');
  assert(rf.physicalDevicePresent === false, 'RF physicalDevicePresent is false');
  assert(rf.verified === false, 'RF hardware is marked verified=false');
  assert(rf.dataFlow === 'SIMULATION_SYNTHETIC', 'RF data flow is SIMULATION_SYNTHETIC');

  // Tactical Radar Adapter
  const radar = devices.tacticalRadar;
  assert(radar && radar.driverAdapter === 'ASTERIX_CAT048_ADAPTER', 'Radar Adapter specifies ASTERIX_CAT048_ADAPTER');
  assert(radar.status === 'DEVICE_UNAVAILABLE', 'Radar physical status is DEVICE_UNAVAILABLE');
  assert(radar.physicalDevicePresent === false, 'Radar physicalDevicePresent is false');
  assert(radar.verified === false, 'Radar hardware is marked verified=false');

  // Optical PTZ Adapter
  const ptz = devices.opticalPtz;
  assert(ptz && ptz.driverAdapter === 'ONVIF_RTSP_PTZ_ADAPTER', 'Optical PTZ Adapter specifies ONVIF_RTSP_PTZ_ADAPTER');
  assert(ptz.status === 'DEVICE_UNAVAILABLE', 'PTZ physical status is DEVICE_UNAVAILABLE');
  assert(ptz.physicalDevicePresent === false, 'PTZ physicalDevicePresent is false');
  assert(ptz.verified === false, 'PTZ hardware is marked verified=false');

  // 3. WebSocket Hardware Contract Verification
  console.log('\n--- 3. WebSocket C2 Frame & INIT_STATE Hardware Contract ---');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8080/ws/c2');
    ws.on('open', () => {});
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'INIT_STATE') {
          assert(!!msg.hardware, 'INIT_STATE delivers hardware registry metadata');
          assert(msg.hardware.isHardwareConnected === false, 'INIT_STATE marks isHardwareConnected as false');
          assert(msg.hardware.hardwareVerificationState === 'UNVERIFIED', 'INIT_STATE marks verification as UNVERIFIED');
        } else if (msg.type === 'C2_FRAME') {
          assert(!!msg.hardware, 'C2_FRAME delivers hardware registry metadata');
          assert(msg.hardware.dataSource === 'SIMULATION_SYNTHETIC', 'C2_FRAME marks data source as SIMULATION_SYNTHETIC');
          ws.close();
          resolve();
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    });
    ws.on('error', reject);
  });

  // 4. Backward Compatibility Check on /api/status
  console.log('\n--- 4. Compatibility with Existing Endpoints ---');
  const statusRes = await fetchJson('http://localhost:8080/api/status');
  assert(statusRes.status === 200, 'GET /api/status returns HTTP 200');
  assert(statusRes.body.simState.systemStatus === 'ONLINE', 'simState.systemStatus is ONLINE');
  assert(statusRes.body.simState.dataSource === 'SIMULATION_SYNTHETIC', 'simState.dataSource is SIMULATION_SYNTHETIC');
  assert(statusRes.body.simState.isHardwareConnected === false, 'simState.isHardwareConnected is false');
  assert(statusRes.body.hardware.hardwareVerificationState === 'UNVERIFIED', 'hardware metadata included on /api/status');

  console.log('\n========================================================================');
  console.log(`🎉 ALL PHASE 3 HARDWARE CONNECTIVITY CHECKS PASSED: ${passed}/${total}`);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runHardwareTests().catch(err => {
    console.error('Phase 3 Tests Failed:', err);
    process.exit(1);
  });
}

module.exports = { runHardwareTests };
