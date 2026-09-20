/**
 * ESM-ASTRA: Optical Surveillance Monitor
 * Real webcam feed with CV detection overlays + procedural IR fallback
 */

class OpticalSurveillanceMonitor {
  constructor(canvasId = 'cameraPageCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.width = 800;
    this.height = 450;
    this.activeCamId = 'CAM-01';
    this.selectedEntityId = 'TRK-021';
    this.entities = [];

    // Webcam
    this.webcamVideo = null;
    this.webcamReady = false;
    this.webcamError = null;
    this.startWebcam();

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.webcamError = 'Camera API not available';
      return;
    }
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    this.webcamVideo = video;

    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'environment' }, audio: false })
      .then(stream => {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().then(() => {
            this.webcamReady = true;
            console.log('[CAMERA] Webcam active:', video.videoWidth + 'x' + video.videoHeight);
          }).catch(e => { this.webcamError = e.message; });
        };
      })
      .catch(err => {
        this.webcamError = err.name + ': ' + err.message;
        console.warn('[CAMERA] Webcam unavailable, using procedural IR scene:', err.message);
      });
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      for (const ent of this.entities) {
        if (ent.camera.visibleCamId === this.activeCamId && ent.camera.isVisuallyConfirmed) {
          const b = ent.camera.screenBox;
          if (clickX >= b.x && clickX <= b.x + b.w && clickY >= b.y && clickY <= b.y + b.h) {
            if (window.app) window.app.selectEntity(ent.id);
            break;
          }
        }
      }
    });
  }

  updateData(data) {
    if (data.entities) this.entities = data.entities;
    if (data.simState) {
      this.activeCamId = data.simState.activeCameraId;
      this.selectedEntityId = data.simState.selectedEntityId;
    }
  }

  render() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      if (Math.abs(parent.clientWidth - this.width) > 2 || Math.abs(parent.clientHeight - this.height) > 2) {
        this.resize();
      }
    }

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    if (this.webcamReady && this.webcamVideo && this.webcamVideo.readyState >= 2) {
      // ── REAL WEBCAM FEED ─────────────────────────────────────────────────
      // Draw live video frame stretched to canvas
      ctx.save();
      ctx.drawImage(this.webcamVideo, 0, 0, w, h);
      // Dark tactical overlay so the HUD text stays readable
      ctx.fillStyle = 'rgba(3, 8, 14, 0.35)';
      ctx.fillRect(0, 0, w, h);
      // Subtle green IR tint
      ctx.fillStyle = 'rgba(18, 50, 30, 0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      // ── PROCEDURAL IR FALLBACK ────────────────────────────────────────────
      this.drawProceduralCameraScene(ctx, w, h);

      // Show webcam status if still loading
      if (!this.webcamError && !this.webcamReady) {
        ctx.save();
        ctx.fillStyle = 'rgba(24,184,214,0.85)';
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⟳ REQUESTING CAMERA ACCESS...', w / 2, 22);
        ctx.restore();
      } else if (this.webcamError) {
        ctx.save();
        ctx.fillStyle = 'rgba(212,88,88,0.85)';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CAM OFFLINE — PROCEDURAL IR MODE', w / 2, 22);
        ctx.restore();
      }
    }

    // ── OVERLAYS (always drawn on top of webcam or procedural) ─────────────
    this.drawOpticalReticle(ctx, w, h);
    this.drawDetectedEntities(ctx, w, h);
    this.drawCameraHud(ctx, w, h);
  }



  drawProceduralCameraScene(ctx, w, h) {
    const horizonY = h * 0.44;

    // Atmospheric Night IR Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#03060a');
    skyGrad.addColorStop(0.65, '#071018');
    skyGrad.addColorStop(1, '#0c1824');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Stars / Atmospheric Points
    ctx.fillStyle = 'rgba(200, 225, 255, 0.4)';
    for (let i = 0; i < 24; i++) {
      const sx = (i * 97) % w;
      const sy = (i * 37) % (horizonY - 15);
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    // Distant Mountain Ranges (2 Depth Layers)
    ctx.fillStyle = '#060c13';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w * 0.15, horizonY - 28);
    ctx.lineTo(w * 0.35, horizonY - 16);
    ctx.lineTo(w * 0.55, horizonY - 34);
    ctx.lineTo(w * 0.8, horizonY - 20);
    ctx.lineTo(w, horizonY - 26);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#08111a';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w * 0.25, horizonY - 14);
    ctx.lineTo(w * 0.48, horizonY - 22);
    ctx.lineTo(w * 0.72, horizonY - 12);
    ctx.lineTo(w * 0.92, horizonY - 18);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // Ground Plane Terrain
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    groundGrad.addColorStop(0, '#0a131c');
    groundGrad.addColorStop(0.5, '#070d14');
    groundGrad.addColorStop(1, '#04080d');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Perspective Terrain Lines
    ctx.strokeStyle = 'rgba(25, 42, 58, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const tx = (w / 6) * i;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, horizonY);
      ctx.lineTo(tx, h);
      ctx.stroke();
    }

    // Sector-specific perspective scene
    if (this.activeCamId === 'CAM-01') {
      this.drawNorthGateScene(ctx, w, h, horizonY);
    } else if (this.activeCamId === 'CAM-02') {
      this.drawEastWireScene(ctx, w, h, horizonY);
    } else if (this.activeCamId === 'CAM-03') {
      this.drawSouthMainScene(ctx, w, h, horizonY);
    } else {
      this.drawWestThicketScene(ctx, w, h, horizonY);
    }
  }

  drawNorthGateScene(ctx, w, h, horizonY) {
    const vpX = w * 0.52; // Vanishing point

    // Asphalt Access Road in Perspective
    ctx.fillStyle = '#0f1721';
    ctx.beginPath();
    ctx.moveTo(vpX - 12, horizonY);
    ctx.lineTo(vpX + 12, horizonY);
    ctx.lineTo(w * 0.88, h);
    ctx.lineTo(w * 0.16, h);
    ctx.closePath();
    ctx.fill();

    // Road Curbs
    ctx.strokeStyle = '#1e3040';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX - 12, horizonY); ctx.lineTo(w * 0.16, h);
    ctx.moveTo(vpX + 12, horizonY); ctx.lineTo(w * 0.88, h);
    ctx.stroke();

    // Dashed Road Centerline
    ctx.strokeStyle = '#2d4256';
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(vpX, horizonY);
    ctx.lineTo(w * 0.52, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Elevated Security Watchtower (Right Background)
    const twX = w * 0.82;
    const twY = horizonY - 45;
    ctx.fillStyle = '#0b131c';
    ctx.fillRect(twX - 18, twY, 36, 26);
    ctx.strokeStyle = '#24374a';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(twX - 18, twY, 36, 26);

    // Tower Stilts & Cross Bracing
    ctx.beginPath();
    ctx.moveTo(twX - 16, twY + 26); ctx.lineTo(twX - 22, horizonY + 36);
    ctx.moveTo(twX + 16, twY + 26); ctx.lineTo(twX + 22, horizonY + 36);
    ctx.moveTo(twX - 16, twY + 26); ctx.lineTo(twX + 22, horizonY + 36);
    ctx.moveTo(twX + 16, twY + 26); ctx.lineTo(twX - 22, horizonY + 36);
    ctx.stroke();

    // Spotlight beam cone from tower illuminating road
    const spotGrad = ctx.createRadialGradient(twX, twY + 14, 5, w * 0.45, h * 0.72, 170);
    spotGrad.addColorStop(0, 'rgba(93, 159, 234, 0.22)');
    spotGrad.addColorStop(0.5, 'rgba(93, 159, 234, 0.08)');
    spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(w * 0.45, h * 0.72, 140, 0, Math.PI * 2);
    ctx.fill();

    // Guard Checkpost Booth (Left Side)
    const gbX = w * 0.08;
    const gbY = h * 0.38;
    ctx.fillStyle = '#101923';
    ctx.fillRect(gbX, gbY, 65, 52);
    ctx.strokeStyle = '#283d52';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(gbX, gbY, 65, 52);

    // Overhanging Roof
    ctx.fillStyle = '#172533';
    ctx.fillRect(gbX - 4, gbY - 6, 73, 8);

    // Warm Interior Window Glow
    ctx.fillStyle = 'rgba(215, 168, 75, 0.45)';
    ctx.fillRect(gbX + 10, gbY + 12, 26, 18);
    ctx.strokeStyle = '#d7a84b';
    ctx.lineWidth = 1;
    ctx.strokeRect(gbX + 10, gbY + 12, 26, 18);

    // Barrier Gate Arm Across Access Road
    ctx.strokeStyle = '#47637d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.62);
    ctx.lineTo(w * 0.70, h * 0.62);
    ctx.stroke();

    // Barrier Red Warning Stripes
    ctx.strokeStyle = '#d45858';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.62);
    ctx.lineTo(w * 0.70, h * 0.62);
    ctx.stroke();
    ctx.setLineDash([]);

    // Perimeter Security Fence with Razor Coils (Perspective Left)
    this.drawPerspectiveFence(ctx, w * 0.16, h, vpX - 16, horizonY);
  }

  drawEastWireScene(ctx, w, h, horizonY) {
    // Continuous East Perimeter Security Line with Barbed Coils
    ctx.strokeStyle = '#1a2c3d';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(0, horizonY + 30);
    ctx.lineTo(w, horizonY + 36);
    ctx.stroke();

    // Concertina Coils
    ctx.strokeStyle = '#29435b';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 22);
    ctx.lineTo(w, horizonY + 28);
    ctx.stroke();
    ctx.setLineDash([]);

    // Regular Fence Posts
    for (let px = 20; px < w; px += 42) {
      ctx.beginPath();
      ctx.moveTo(px, horizonY + 14);
      ctx.lineTo(px, horizonY + 36);
      ctx.stroke();
    }

    // Elevated Watchtower
    const twX = w * 0.78;
    const twY = horizonY - 40;
    ctx.fillStyle = '#0b131c';
    ctx.fillRect(twX - 16, twY, 32, 24);
    ctx.strokeStyle = '#24374a';
    ctx.strokeRect(twX - 16, twY, 32, 24);

    ctx.beginPath();
    ctx.moveTo(twX - 14, twY + 24); ctx.lineTo(twX - 18, horizonY + 34);
    ctx.moveTo(twX + 14, twY + 24); ctx.lineTo(twX + 18, horizonY + 34);
    ctx.stroke();

    // Spotlight Cone
    const spotGrad = ctx.createRadialGradient(twX, twY + 12, 5, w * 0.4, h * 0.72, 160);
    spotGrad.addColorStop(0, 'rgba(93, 159, 234, 0.2)');
    spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(w * 0.4, h * 0.72, 130, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSouthMainScene(ctx, w, h, horizonY) {
    // Broad Dual Checkpoint Entry
    ctx.fillStyle = '#0e1722';
    ctx.beginPath();
    ctx.moveTo(w * 0.44, horizonY);
    ctx.lineTo(w * 0.56, horizonY);
    ctx.lineTo(w * 0.94, h);
    ctx.lineTo(w * 0.06, h);
    ctx.closePath();
    ctx.fill();

    // Overhead Inspection Gantry
    ctx.strokeStyle = '#324a5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.6);
    ctx.lineTo(w * 0.22, h * 0.44);
    ctx.lineTo(w * 0.78, h * 0.44);
    ctx.lineTo(w * 0.78, h * 0.6);
    ctx.stroke();

    // Inspection Lights
    ctx.fillStyle = '#d7a84b';
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.44, 4, 0, Math.PI * 2);
    ctx.arc(w * 0.62, h * 0.44, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWestThicketScene(ctx, w, h, horizonY) {
    // Dense foliage silhouettes
    ctx.fillStyle = '#09121a';
    for (let x = 10; x < w; x += 38) {
      ctx.beginPath();
      ctx.arc(x, horizonY + 14, 18 + (x % 16), Math.PI, 0);
      ctx.fill();
    }

    // Security Wire
    ctx.strokeStyle = '#1d2f40';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 20);
    ctx.lineTo(w, horizonY + 20);
    ctx.stroke();
  }

  drawPerspectiveFence(ctx, startX, startY, endX, endY) {
    ctx.save();
    ctx.strokeStyle = '#22384a';
    ctx.lineWidth = 1.2;

    const posts = 8;
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = startX + t * (endX - startX);
      const y = startY + t * (endY - startY);
      const postH = 46 * (1 - t * 0.65);

      // Vertical post
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - postH);
      ctx.stroke();

      // Top 45-degree angled barbed arm
      ctx.beginPath();
      ctx.moveTo(x, y - postH);
      ctx.lineTo(x + 6 * (1 - t * 0.6), y - postH - 6 * (1 - t * 0.6));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOpticalReticle(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(93, 159, 234, 0.22)';
    ctx.lineWidth = 0.8;

    // Center Crosshair
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // Corner Tactical Frame Brackets
    const pad = 12;
    const bLen = 14;
    ctx.beginPath();
    ctx.moveTo(pad, pad + bLen); ctx.lineTo(pad, pad); ctx.lineTo(pad + bLen, pad);
    ctx.moveTo(w - pad - bLen, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + bLen);
    ctx.moveTo(pad, h - pad - bLen); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + bLen, h - pad);
    ctx.moveTo(w - pad - bLen, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - bLen);
    ctx.stroke();

    ctx.restore();
  }

  drawDetectedEntities(ctx, w, h) {
    this.entities.forEach(ent => {
      // Must be geometrically inside active camera FOV
      if (ent.camera.visibleCamId !== this.activeCamId || !ent.camera.isVisuallyConfirmed) {
        return;
      }

      const b = ent.camera.screenBox;
      const isSelected = ent.id === this.selectedEntityId;

      // Color coding per classification state
      let color = '#5d9fea'; // Normal CV blue
      if (ent.fusion.classification === 'VERIFIED') color = '#42c47a'; // Green
      else if (ent.fusion.classification === 'ANOMALOUS') color = '#d45858'; // Red
      else if (ent.fusion.classification === 'LOW CONFIDENCE' || ent.type === 'WILDLIFE') color = '#d7a84b'; // Amber

      // 1. Render Simulated 2.5D Physical Silhouette Avatar in Perspective Scene
      this.drawRealisticAvatar(ctx, b.x + b.w/2, b.y + b.h, b.h, ent.type, color);

      // 2. Overlay Computer Vision Bounding Box
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1.2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Subtle fill
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1.0;

      // Top Tag
      ctx.fillStyle = color;
      const tagW = Math.max(b.w, 88);
      ctx.fillRect(b.x, b.y - 15, tagW, 15);

      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#070b10';
      ctx.fillText(`${ent.camera.typeLabel} ${ent.camera.confidence}%`, b.x + 4, b.y - 4);

      // Bottom Cross-Reference Label
      ctx.fillStyle = 'rgba(7, 11, 16, 0.88)';
      ctx.fillRect(b.x, b.y + b.h + 2, tagW, 13);
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.fillStyle = color;
      ctx.fillText(`RADAR ${ent.id} ↔ ${ent.camera.detectionId}`, b.x + 3, b.y + b.h + 11);

      // Corner Ticks on Bounding Box
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      const cL = 6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + cL); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + cL, b.y);
      ctx.moveTo(b.x + b.w - cL, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + cL);
      ctx.moveTo(b.x, b.y + b.h - cL); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x + cL, b.y + b.h);
      ctx.moveTo(b.x + b.w - cL, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h - cL);
      ctx.stroke();

      ctx.restore();
    });

    // Check if selected entity is outside current camera FOV
    const sel = this.entities.find(e => e.id === this.selectedEntityId);
    if (sel && sel.camera.visibleCamId !== this.activeCamId) {
      ctx.save();
      const bannerW = 420;
      const bannerH = 46;
      const bx = (w - bannerW) / 2;
      const by = 24;

      ctx.fillStyle = 'rgba(9, 14, 20, 0.88)';
      ctx.fillRect(bx, by, bannerW, bannerH);
      ctx.strokeStyle = '#d7a84b';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bx, by, bannerW, bannerH);

      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#d7a84b';
      ctx.textAlign = 'center';
      ctx.fillText(`[ ⚠️ TARGET OUT OF OPTICAL FOV ]`, w / 2, by + 16);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e6edf3';
      const visibleMsg = sel.camera.visibleCamId ? `(CURRENTLY IN SECTOR ${sel.camera.visibleCamId})` : `(BEYOND SENSOR RANGE: ${sel.radar.range}m / ${sel.radar.azimuth}°)`;
      ctx.fillText(`TARGET ${sel.id} IS OUTSIDE ${this.activeCamId} FIELD OF VIEW ${visibleMsg}`, w / 2, by + 32);

      ctx.restore();
    }
  }

  drawRealisticAvatar(ctx, x, groundY, boxH, type, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.82;

    if (type === 'PERSON') {
      const scale = boxH / 70;
      // Head with tactical helmet
      ctx.beginPath();
      ctx.arc(x, groundY - boxH * 0.88, 5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Tactical Torso & Vest
      ctx.fillRect(x - 4 * scale, groundY - boxH * 0.8, 8 * scale, boxH * 0.44);

      // Arms (Tactical walking stance)
      ctx.fillRect(x - 6.5 * scale, groundY - boxH * 0.78, 2.5 * scale, boxH * 0.38);
      ctx.fillRect(x + 4 * scale, groundY - boxH * 0.78, 2.5 * scale, boxH * 0.38);

      // Legs
      ctx.fillRect(x - 4.5 * scale, groundY - boxH * 0.36, 3.5 * scale, boxH * 0.36);
      ctx.fillRect(x + 1 * scale, groundY - boxH * 0.36, 3.5 * scale, boxH * 0.36);
    } else if (type === 'VEHICLE') {
      const scale = boxH / 45;
      // Vehicle Chassis
      ctx.fillRect(x - 24 * scale, groundY - 18 * scale, 48 * scale, 14 * scale);
      ctx.fillRect(x - 14 * scale, groundY - 28 * scale, 26 * scale, 10 * scale);

      // Wheels
      ctx.beginPath();
      ctx.arc(x - 14 * scale, groundY - 4 * scale, 4.5 * scale, 0, Math.PI * 2);
      ctx.arc(x + 14 * scale, groundY - 4 * scale, 4.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Headlight Beam
      ctx.fillStyle = 'rgba(215, 168, 75, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x + 24 * scale, groundY - 14 * scale);
      ctx.lineTo(x + 60 * scale, groundY - 26 * scale);
      ctx.lineTo(x + 60 * scale, groundY + 4 * scale);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'WILDLIFE') {
      const scale = boxH / 32;
      // Quadruped Body
      ctx.fillRect(x - 14 * scale, groundY - 17 * scale, 28 * scale, 9 * scale);
      // Head and Antlers
      ctx.beginPath();
      ctx.arc(x - 16 * scale, groundY - 20 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.fillRect(x - 12 * scale, groundY - 8 * scale, 2.2 * scale, 8 * scale);
      ctx.fillRect(x - 6 * scale, groundY - 8 * scale, 2.2 * scale, 8 * scale);
      ctx.fillRect(x + 6 * scale, groundY - 8 * scale, 2.2 * scale, 8 * scale);
      ctx.fillRect(x + 10 * scale, groundY - 8 * scale, 2.2 * scale, 8 * scale);
    }

    ctx.restore();
  }

  drawCameraHud(ctx, w, h) {
    ctx.save();
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';

    const now = new Date();
    const timeStr = now.toISOString().replace('T', ' ').substring(11, 19) + ' UTC';

    ctx.textAlign = 'right';
    ctx.fillText(`${this.activeCamId} // ${timeStr}`, w - 16, 16);
    ctx.fillText('IR THERMAL NIGHT VISION // 30 FPS // 70° FOV', w - 16, 28);

    // REC Dot
    ctx.fillStyle = '#d45858';
    ctx.beginPath();
    ctx.arc(w - 240, 13, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6edf3';
    ctx.fillText('REC [HD]', w - 198, 16);

    ctx.restore();
  }
}

window.OpticalSurveillanceMonitor = OpticalSurveillanceMonitor;
