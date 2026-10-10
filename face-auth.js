/*
 * Defence Sentinel face authorization demo.
 * - Matches faces in the browser with face-api.js descriptors.
 * - Stores only descriptors in this browser's localStorage.
 * - Requires an explicit consent checkbox before enrollment.
 * IMPORTANT: This is a demonstration feature, not a secure access-control system.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'defenceSentinel.faceAuth.v1';
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  const MATCH_THRESHOLD = 0.48; // Calibrate on the actual camera; never treat this as a universal security threshold.
  const DETECT_INTERVAL_MS = 450;

  class FaceAuthorizationDemo {
    constructor() {
      this.overlay = document.getElementById('faceAuthOverlay');
      this.nameInput = document.getElementById('faceAuthNameInput');
      this.consentInput = document.getElementById('faceAuthConsent');
      this.enrollButton = document.getElementById('faceAuthEnrollButton');
      this.clearButton = document.getElementById('faceAuthClearButton');
      this.statusEl = document.getElementById('faceAuthStatus');
      this.rosterEl = document.getElementById('faceAuthRoster');
      this.ctx = this.overlay ? this.overlay.getContext('2d') : null;
      this.modelsReady = false;
      this.modelError = null;
      this.video = null;
      this.lastDetections = [];
      this.matches = [];
      this.isDetecting = false;
      this.lastDetectionAt = 0;
      this.enrollments = this.loadEnrollments();

      if (!this.overlay || !this.ctx) {
        console.warn('[FaceAuth] Overlay canvas not found; feature is disabled.');
        return;
      }

      this.bindControls();
      this.updateRoster();
      this.setStatus('Loading face models… verification is not available yet.', 'info');
      this.loadModels();
      this.start();
    }

    loadEnrollments() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry) =>
          entry && typeof entry.name === 'string' && Array.isArray(entry.descriptor) && entry.descriptor.length === 128
        );
      } catch (error) {
        console.warn('[FaceAuth] Could not read local enrollments:', error);
        return [];
      }
    }

    persistEnrollments() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.enrollments));
        return true;
      } catch (error) {
        this.setStatus('Could not save enrollment in this browser. Check storage/privacy settings.', 'error');
        console.error('[FaceAuth] Could not save local enrollments:', error);
        return false;
      }
    }

    bindControls() {
      if (this.enrollButton) this.enrollButton.addEventListener('click', () => this.enrollVisibleFace());
      if (this.clearButton) this.clearButton.addEventListener('click', () => this.clearEnrollments());
    }

    async loadModels() {
      try {
        if (!window.faceapi) throw new Error('face-api.js did not load from the CDN.');
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        this.modelsReady = true;
        this.setStatus('Face models ready. Ask each person for consent, then enroll them.', 'success');
      } catch (error) {
        this.modelError = error;
        this.modelsReady = false;
        this.setStatus('Face recognition unavailable: model download failed. No authorization decision is being made.', 'error');
        console.error('[FaceAuth] Model loading failed:', error);
      }
    }

    start() {
      // app.js initializes the OpticalSurveillanceMonitor after this script is parsed.
      // Poll until the camera object/video becomes available, then use its existing stream.
      const attach = () => {
        const camera = window.app && window.app.camera;
        if (camera && camera.webcamVideo) {
          this.video = camera.webcamVideo;
          if (camera.webcamReady) this.handleCameraReady();
          else this.setStatus('Waiting for webcam permission and video…', 'info');
          return;
        }
        this.setStatus('Waiting for the camera view to initialize…', 'info');
        window.setTimeout(attach, 350);
      };
      attach();

      // The renderer runs independently from the dashboard canvas and stays aligned with it.
      const render = () => {
        this.syncCanvasSize();
        this.drawOverlay();
        window.requestAnimationFrame(render);
      };
      window.requestAnimationFrame(render);

      this.detectTimer = window.setInterval(() => {
        if (this.video && this.video.readyState >= 2 && this.modelsReady && !this.isDetecting) {
          this.detectFaces();
        } else if (this.video && this.video.readyState >= 2 && !this.modelsReady && this.modelError) {
          this.clearOverlay();
        }
      }, DETECT_INTERVAL_MS);
    }

    handleCameraReady() {
      if (this.video && this.video.readyState >= 2) {
        this.setStatus(this.modelsReady
          ? 'Camera ready. Enroll a consenting person to enable matching.'
          : 'Camera is live; face models are still loading. No verification yet.', 'info');
      }
    }

    syncCanvasSize() {
      if (!this.overlay || !this.ctx) return;
      const base = document.getElementById('cameraPageCanvas');
      const rect = base ? base.getBoundingClientRect() : this.overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (this.overlay.width !== targetW || this.overlay.height !== targetH) {
        this.overlay.width = targetW;
        this.overlay.height = targetH;
        this.overlay.style.width = `${rect.width}px`;
        this.overlay.style.height = `${rect.height}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      this.width = rect.width;
      this.height = rect.height;
    }

    async detectFaces() {
      if (!this.video || this.video.videoWidth <= 0 || this.video.videoHeight <= 0) return;
      this.isDetecting = true;
      this.lastDetectionAt = Date.now();
      try {
        const detections = await window.faceapi
          .detectAllFaces(this.video, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.55 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        this.lastDetections = detections.map((item) => ({
          box: {
            x: item.detection.box.x,
            y: item.detection.box.y,
            width: item.detection.box.width,
            height: item.detection.box.height
          },
          score: item.detection.score,
          descriptor: Array.from(item.descriptor)
        }));
        this.matches = this.lastDetections.map((face) => this.matchDescriptor(face));

        if (this.lastDetections.length === 0) {
          this.setStatus(this.enrollments.length
            ? `No face detected · ${this.enrollments.length} enrolled identity/identities`
            : 'No face detected · enroll at least one consenting person first', 'info');
        } else {
          const authorized = this.matches.filter((face) => face.authorized).length;
          const unknown = this.matches.length - authorized;
          this.setStatus(`${this.lastDetections.length} face(s) detected · ${authorized} match(es) · ${unknown} unknown`, unknown ? 'warning' : 'success');
        }
      } catch (error) {
        this.lastDetections = [];
        this.matches = [];
        console.error('[FaceAuth] Detection failed:', error);
        this.setStatus('Face detection failed. Verification is unavailable; do not treat this as an authorization.', 'error');
      } finally {
        this.isDetecting = false;
      }
    }

    matchDescriptor(face) {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const person of this.enrollments) {
        const distance = this.euclideanDistance(face.descriptor, person.descriptor);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = person;
        }
      }
      const authorized = Boolean(best && bestDistance <= MATCH_THRESHOLD);
      return {
        box: face.box,
        score: face.score,
        authorized,
        name: authorized ? best.name : 'UNKNOWN PERSON',
        distance: Number.isFinite(bestDistance) ? bestDistance : null
      };
    }

    euclideanDistance(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
        return Number.POSITIVE_INFINITY;
      }
      let sum = 0;
      for (let i = 0; i < a.length; i += 1) {
        const delta = a[i] - b[i];
        sum += delta * delta;
      }
      return Math.sqrt(sum);
    }

    enrollVisibleFace() {
      const name = this.nameInput ? this.nameInput.value.trim() : '';
      if (!this.modelsReady) {
        this.setStatus('Wait until face models are ready. No enrollment was saved.', 'error');
        return;
      }
      if (!this.video || this.video.readyState < 2) {
        this.setStatus('Camera is not ready. Allow camera permission first.', 'error');
        return;
      }
      if (!name) {
        this.setStatus('Enter the consenting person’s name before enrollment.', 'error');
        if (this.nameInput) this.nameInput.focus();
        return;
      }
      if (!this.consentInput || !this.consentInput.checked) {
        this.setStatus('Enrollment blocked: confirm that the person has consented.', 'error');
        return;
      }
      if (this.lastDetections.length !== 1) {
        this.setStatus('Enrollment requires exactly one clearly visible face. Keep other people out of frame and try again.', 'error');
        return;
      }
      const face = this.lastDetections[0];
      if (face.score < 0.65 || face.box.width < 80 || face.box.height < 80) {
        this.setStatus('Face is too small or detection confidence is low. Move closer, improve lighting, and try again.', 'error');
        return;
      }

      const normalName = name.toLocaleLowerCase();
      const previousEnrollments = this.enrollments;
      this.enrollments = previousEnrollments.filter((entry) => entry.name.toLocaleLowerCase() !== normalName);
      this.enrollments.push({
        name,
        descriptor: face.descriptor,
        enrolledAt: new Date().toISOString(),
        consentRecordedAt: new Date().toISOString(),
        model: 'face-api.js-faceRecognitionNet'
      });

      if (!this.persistEnrollments()) {
        this.enrollments = previousEnrollments;
        return;
      }
      this.updateRoster();
      if (this.nameInput) this.nameInput.value = '';
      if (this.consentInput) this.consentInput.checked = false;
      this.setStatus(`${name} enrolled locally in this browser. This is a demo match, not production authorization.`, 'success');
      console.info('[FaceAuth] Enrolled local descriptor for:', name);
    }

    clearEnrollments() {
      const accepted = window.confirm('Remove all locally enrolled face descriptors from this browser? This cannot be undone.');
      if (!accepted) return;
      this.enrollments = [];
      if (!this.persistEnrollments()) return;
      this.updateRoster();
      this.matches = [];
      this.setStatus('All local enrollments removed. No one can be matched until a person is enrolled again.', 'info');
    }

    updateRoster() {
      if (!this.rosterEl) return;
      if (!this.enrollments.length) {
        this.rosterEl.textContent = 'REGISTERED: NONE';
      } else {
        const names = this.enrollments.map((person) => person.name).join(', ');
        this.rosterEl.textContent = `REGISTERED (${this.enrollments.length}): ${names}`;
      }
    }

    setStatus(message, tone) {
      if (!this.statusEl) return;
      this.statusEl.textContent = message;
      const tones = {
        success: { color: '#42c47a', borderColor: 'rgba(66,196,122,.55)' },
        warning: { color: '#d7a84b', borderColor: 'rgba(215,168,75,.55)' },
        error: { color: '#ff7272', borderColor: 'rgba(212,88,88,.65)' },
        info: { color: '#7fb8ff', borderColor: 'rgba(93,159,234,.4)' }
      };
      const style = tones[tone] || tones.info;
      this.statusEl.style.color = style.color;
      this.statusEl.style.borderColor = style.borderColor;
    }

    clearOverlay() {
      if (this.ctx && this.overlay) this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }

    drawOverlay() {
      if (!this.ctx || !this.overlay || !this.width || !this.height) return;
      this.ctx.clearRect(0, 0, this.width, this.height);
      if (!this.video || !this.video.videoWidth || !this.video.videoHeight || !this.modelsReady) return;
      const scaleX = this.width / this.video.videoWidth;
      const scaleY = this.height / this.video.videoHeight;
      for (const face of this.matches) {
        const x = Math.max(1, face.box.x * scaleX);
        const y = Math.max(2, face.box.y * scaleY);
        const w = Math.max(1, face.box.width * scaleX);
        const h = Math.max(1, face.box.height * scaleY);
        const color = face.authorized ? '#42c47a' : '#ff4d5a';
        const label = face.authorized ? `AUTHORIZED · ${face.name}` : 'UNAUTHORIZED · UNKNOWN PERSON';
        const detail = face.distance === null ? 'NO ENROLLED MATCH' : `DIST ${face.distance.toFixed(3)}`;
        const labelW = Math.min(this.width - 8, Math.max(130, Math.min(290, label.length * 7 + 18)));
        const labelX = Math.max(4, Math.min(this.width - labelW - 4, x));
        const labelY = Math.max(4, y - 27);

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeRect(x, y, w, h);
        this.ctx.fillStyle = 'rgba(3, 8, 14, 0.15)';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        if (typeof this.ctx.roundRect === 'function') this.ctx.roundRect(labelX, labelY, labelW, 20, 6);
        else this.ctx.rect(labelX, labelY, labelW, 20);
        this.ctx.fill();
        this.ctx.font = '700 10px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#071017';
        this.ctx.fillText(label, labelX + 7, labelY + 10, labelW - 14);
        this.ctx.font = '700 10px monospace';
        this.ctx.fillStyle = color;
        this.ctx.fillText(detail, labelX + 2, Math.min(this.height - 5, y + h + 13), 160);
        this.ctx.restore();
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.faceAuthorizationDemo = new FaceAuthorizationDemo();
  });
})();
