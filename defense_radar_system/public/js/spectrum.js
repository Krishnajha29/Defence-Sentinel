/**
 * ESM-ASTRA: RF / ESM Intelligence Spectrum Analyzer & Waterfall Spectrogram (SIH26055 Core)
 * Single Source of Truth: Synthesizes spectral peaks from master transmitting entities
 */

class CompactSpectrumAnalyzer {
  constructor(canvasId = 'rfDedicatedSpectrumCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.minFreq = 9.00;
    this.maxFreq = 10.00;
    this.minPower = -100.0;
    this.maxPower = -40.0;

    this.entities = [];
    this.simState = null;
    this.width = 600;
    this.height = 340;

    // Waterfall history buffer (rows of power values across frequency bins)
    this.waterfallRows = 60;
    this.waterfallBins = 180;
    this.waterfallHistory = [];
    for (let r = 0; r < this.waterfallRows; r++) {
      const row = new Float32Array(this.waterfallBins);
      for (let b = 0; b < this.waterfallBins; b++) row[b] = -95.0;
      this.waterfallHistory.push(row);
    }

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    this.ctx.scale(dpr, dpr);
  }

  setupEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const padL = 46;
      const padR = 20;
      const plotW = this.width - padL - padR;

      if (clickX >= padL && clickX <= this.width - padR) {
        const norm = (clickX - padL) / plotW;
        const clickedGhz = this.minFreq + norm * (this.maxFreq - this.minFreq);

        let closest = null;
        let minDist = 0.15;
        this.entities.forEach(ent => {
          if (ent.rf.hasEmitter && ent.rf.freqGhz) {
            const d = Math.abs(ent.rf.freqGhz - clickedGhz);
            if (d < minDist) {
              minDist = d;
              closest = ent;
            }
          }
        });

        if (closest && window.app) {
          window.app.selectEntity(closest.id);
        } else if (window.app) {
          window.app.stepSimulationScan();
        }
      }
    });
  }

  updateData(data) {
    if (data.entities) this.entities = data.entities;
    if (data.simState) this.simState = data.simState;
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

    const padL = 46;
    const padR = 20;
    const padT = 24;
    const splitRatio = 0.58; // Upper 58% spectrum, lower 42% waterfall
    const specH = Math.round((h - padT - 30) * splitRatio);
    const wfTop = padT + specH + 18;
    const wfH = Math.max(40, h - wfTop - 18);
    const plotW = w - padL - padR;

    if (plotW <= 10 || specH <= 10) return;

    const freqToX = f => padL + ((f - this.minFreq) / (this.maxFreq - this.minFreq)) * plotW;
    const powerToY = p => padT + (1 - (p - this.minPower) / (this.maxPower - this.minPower)) * specH;

    // 1. Spectrum Analyzer Background Grid & dBm lines
    ctx.strokeStyle = '#14202c';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5c6f80';
    ctx.font = '9px "JetBrains Mono", monospace';

    [-90, -80, -70, -60, -50].forEach(p => {
      const y = powerToY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`${p} dBm`, padL - 6, y + 3);
    });

    for (let f = 9.0; f <= 10.001; f += 0.1) {
      const x = freqToX(f);
      const isMajor = Math.abs(Math.round(f * 10) % 2) === 0;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + specH);
      ctx.strokeStyle = isMajor ? '#192837' : '#101b24';
      ctx.stroke();

      if (isMajor) {
        ctx.textAlign = 'center';
        ctx.fillText(`${f.toFixed(1)}G`, x, padT + specH + 12);
      }
    }

    // 2. RECEIVER 50 MHz IBW WINDOW
    if (this.simState) {
      const curGhz = this.simState.rfCurrentScanGhz || 9.420;
      const minW = freqToX(curGhz - 0.025);
      const maxW = freqToX(curGhz + 0.025);
      const winW = maxW - minW;

      ctx.fillStyle = 'rgba(75, 169, 199, 0.14)';
      ctx.fillRect(minW, padT, winW, specH);
      ctx.strokeStyle = 'rgba(75, 169, 199, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(minW, padT, winW, specH);

      const cx = freqToX(curGhz);
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, padT + specH);
      ctx.strokeStyle = '#4ba9c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#4ba9c7';
      ctx.fillRect(cx - 32, padT - 18, 64, 14);
      ctx.fillStyle = '#070b10';
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`RCVR ${curGhz.toFixed(3)}G`, cx, padT - 8);

      if (this.simState.rfNextScanGhz) {
        const nx = freqToX(this.simState.rfNextScanGhz);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(nx, padT);
        ctx.lineTo(nx, padT + specH);
        ctx.strokeStyle = '#d7a84b';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#d7a84b';
        ctx.fillRect(nx - 30, padT - 18, 60, 14);
        ctx.fillStyle = '#070b10';
        ctx.fillText(`NEXT ${this.simState.rfNextScanGhz.toFixed(3)}G`, nx, padT - 8);
        ctx.restore();
      }
    }

    // 3. Synthesize Current Spectral Slice & Update Waterfall Buffer
    const points = [];
    const numPts = 180;
    const now = performance.now();
    const currentSlice = new Float32Array(numPts);

    for (let i = 0; i <= numPts; i++) {
      const f = this.minFreq + (i / numPts) * (this.maxFreq - this.minFreq);
      const noise = -94.0 + (Math.sin(i * 0.4 + now * 0.003) * 0.8) + ((Math.random() - 0.5) * 1.2);
      let power = noise;

      for (const ent of this.entities) {
        if (ent.rf.hasEmitter && ent.rf.isTransmitting && ent.rf.freqGhz) {
          const delta = f - ent.rf.freqGhz;
          if (Math.abs(delta) < 0.045) {
            const g = Math.exp(-(delta * delta) / (2 * 0.008 * 0.008));
            power = Math.max(power, -95 + (ent.rf.powerDbm - (-95)) * g);
          }
        }
      }

      if (i < numPts) currentSlice[i] = power;
      points.push({ x: freqToX(f), y: powerToY(power) });
    }

    // Push slice into waterfall history buffer
    if (Math.random() < 0.35) {
      this.waterfallHistory.unshift(currentSlice);
      if (this.waterfallHistory.length > this.waterfallRows) {
        this.waterfallHistory.pop();
      }
    }

    // Fill under spectrum curve
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + specH);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, padT + specH);
    ctx.closePath();

    const specGrad = ctx.createLinearGradient(0, padT, 0, padT + specH);
    specGrad.addColorStop(0, 'rgba(75, 169, 199, 0.35)');
    specGrad.addColorStop(0.6, 'rgba(75, 169, 199, 0.08)');
    specGrad.addColorStop(1, 'rgba(7, 11, 16, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fill();

    // Spectrum stroke
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#4ba9c7';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Peak markers
    this.entities.forEach(ent => {
      if (ent.rf.hasEmitter && ent.rf.freqGhz) {
        const ex = freqToX(ent.rf.freqGhz);
        const ey = powerToY(ent.rf.isTransmitting ? ent.rf.powerDbm : -92);
        const isSelected = ent.id === (this.simState?.selectedEntityId || 'TRK-021');

        ctx.save();
        ctx.fillStyle = isSelected ? '#18b8d6' : (ent.rf.isTransmitting ? '#42c47a' : '#687784');
        ctx.beginPath();
        ctx.arc(ex, ey, isSelected ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (ent.rf.isTransmitting) {
          ctx.strokeStyle = isSelected ? '#18b8d6' : '#42c47a';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.fillStyle = isSelected ? '#18b8d6' : '#e6edf3';
          ctx.textAlign = 'center';
          ctx.fillText(`${ent.rf.emitterId} (${ent.id})`, ex, ey - 9);
          ctx.font = '7.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#9aa7b5';
          ctx.fillText(`${ent.rf.freqGhz.toFixed(3)}G [${ent.rf.powerDbm}dBm]`, ex, ey + 13);
        }
        ctx.restore();
      }
    });
    ctx.restore();

    // 4. WATERFALL SPECTROGRAM UNDERNEATH SPECTRUM
    ctx.save();
    // Waterfall box border
    ctx.strokeStyle = '#182736';
    ctx.strokeRect(padL, wfTop, plotW, wfH);

    // Label
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#617180';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTROGRAM WATERFALL // TIME DECAY', padL + 4, wfTop - 4);

    const rowH = wfH / this.waterfallHistory.length;
    const colW = plotW / this.waterfallBins;

    for (let r = 0; r < this.waterfallHistory.length; r++) {
      const row = this.waterfallHistory[r];
      const y = wfTop + r * rowH;

      for (let c = 0; c < row.length; c++) {
        const p = row[c];
        const x = padL + c * colW;

        // Intensity color mapping (-95 dBm -> dark, -60 dBm -> bright cyan/yellow)
        const norm = Math.max(0, Math.min(1, (p - (-95)) / 45));
        if (norm > 0.05) {
          if (norm < 0.3) {
            ctx.fillStyle = `rgba(24, 184, 214, ${norm * 0.5})`;
          } else if (norm < 0.7) {
            ctx.fillStyle = `rgba(66, 196, 122, ${norm * 0.8})`;
          } else {
            ctx.fillStyle = `rgba(215, 168, 75, ${norm})`;
          }
          ctx.fillRect(x, y, colW + 0.5, rowH + 0.5);
        }
      }
    }
    ctx.restore();
  }
}

window.CompactSpectrumAnalyzer = CompactSpectrumAnalyzer;
