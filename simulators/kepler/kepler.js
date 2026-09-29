// --- DYNAMIC CONFIGURATION & CONSTANTS ---
const CONFIG = {
  CANVAS: {
    BG_COLOR: '#030712',
    ORBIT_COLOR: 'rgba(245, 158, 11, 0.4)',
    TRAIL_COLOR: 'rgba(56, 189, 248, 0.8)',
    GRID_COLOR: 'rgba(255, 255, 255, 0.05)',
    SUN_COLOR: '#fbbf24',
    PLANET_COLOR: '#38bdf8',
    SWEEP_COLOR: 'rgba(245, 158, 11, 0.22)',
    VECTOR_VELOCITY: '#4ade80',
    VECTOR_FORCE: '#f87171',
    FOCUS_COLOR: '#94a3b8'
  },
  PHYSICS: {
    G: 4 * Math.PI * Math.PI, // AU^3 / (yr^2 * M_sun)
    SUN_MASS: 1.0,
    AU_IN_KM: 149597870.7,
    SEC_IN_YEAR: 31557600
  },
  LIMITS: {
    A_MIN: 0.4,
    A_MAX: 5.0,
    A_STEP: 0.05,
    E_MIN: 0.0,
    E_MAX: 0.85,
    E_STEP: 0.01,
    SPEED_MIN: 0.1,
    SPEED_MAX: 5.0,
    SPEED_STEP: 0.1,
    TRAIL_MIN: 100,
    TRAIL_MAX: 2000,
    TRAIL_STEP: 100
  },
  DEFAULTS: {
    A: 2.0,
    E: 0.5,
    SPEED: 1.0,
    TRAIL: 800,
    SWEEP_ANGLE_DEG: 25
  },
  PRESETS: {
    custom: { name: 'Preset: Custom Orbit', a: 2.000, e: 0.5000 },
    mercury: { name: 'Preset: Mercury Orbit', a: 0.387, e: 0.2056 },
    earth: { name: 'Preset: Earth Circular Orbit', a: 1.000, e: 0.0167 },
    mars: { name: 'Preset: Mars Orbit', a: 1.524, e: 0.0934 },
    halley: { name: "Preset: Halley's Comet (High Eccentricity)", a: 4.200, e: 0.8200 }
  }
};

// --- ORBITAL PHYSICS ENGINE ---
class OrbitEngine {
  constructor(config) {
    this.config = config;
    this.a = config.DEFAULTS.A;
    this.e = config.DEFAULTS.E;
    this.trueAnomaly = 0;
    this.trailHistory = [];
  }

  setParameters(a, e) {
    this.a = Math.max(0.1, a);
    this.e = Math.min(0.99, Math.max(0, e));
  }

  reset() {
    this.trueAnomaly = 0;
    this.trailHistory = [];
  }

  getB() {
    return this.a * Math.sqrt(Math.max(0, 1 - this.e * this.e));
  }

  getC() {
    return this.a * this.e;
  }

  getPerihelion() {
    return this.a * (1 - this.e);
  }

  getAphelion() {
    return this.a * (1 + this.e);
  }

  getPeriod() {
    return Math.sqrt(Math.pow(this.a, 3) / this.config.PHYSICS.SUN_MASS);
  }

  getDistance(theta = this.trueAnomaly) {
    return (this.a * (1 - this.e * this.e)) / (1 + this.e * Math.cos(theta));
  }

  getSpeed(r = this.getDistance()) {
    const mu = this.config.PHYSICS.G * this.config.PHYSICS.SUN_MASS;
    const vAUperYr = Math.sqrt(Math.max(0, mu * (2 / r - 1 / this.a)));
    return (vAUperYr * this.config.PHYSICS.AU_IN_KM) / this.config.PHYSICS.SEC_IN_YEAR;
  }

  step(deltaTimeYears, maxTrailPts) {
    const r = this.getDistance();
    if (r <= 0) return;

    const h = Math.sqrt(
      this.config.PHYSICS.G * this.config.PHYSICS.SUN_MASS * this.a * (1 - this.e * this.e)
    );
    const dTheta = (h / (r * r)) * deltaTimeYears;
    this.trueAnomaly = (this.trueAnomaly + dTheta) % (2 * Math.PI);

    const pos = this.getPosition();
    this.trailHistory.push(pos);
    if (this.trailHistory.length > maxTrailPts) {
      this.trailHistory.shift();
    }
  }

  getPosition(theta = this.trueAnomaly) {
    const r = this.getDistance(theta);
    return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta)
    };
  }
}

// --- UI CONTROLLER ---
class UIManager {
  constructor(config, onUpdate, onReset, onToggleSim) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.onReset = onReset;
    this.onToggleSim = onToggleSim;

    this.bindElements();
    this.initializeControls();
    this.attachEvents();
  }

  bindElements() {
    this.presetSelect = document.getElementById('preset-select');
    this.sliderA = document.getElementById('semi-major-axis');
    this.sliderE = document.getElementById('eccentricity');
    this.sliderSpeed = document.getElementById('sim-speed');
    this.sliderTrail = document.getElementById('trail-length');
    
    this.btnToggleSim = document.getElementById('btn-toggle-sim');
    this.lblStart = document.getElementById('lbl-start');
    this.btnReset = document.getElementById('btn-reset');
    this.btnToggleGrid = document.getElementById('btn-toggle-grid');
    this.btnOpenFormulas = document.getElementById('btn-open-formulas');
    this.btnCloseFormulas = document.getElementById('btn-close-formulas');
    this.modalFormulas = document.getElementById('modal-formulas');

    this.valA = document.getElementById('val-a');
    this.valE = document.getElementById('val-e');
    this.valSpeed = document.getElementById('val-speed');
    this.valTrail = document.getElementById('val-trail');

    this.valPerihelion = document.getElementById('val-perihelion');
    this.valAphelion = document.getElementById('val-aphelion');
    this.valFocalDist = document.getElementById('val-focal-dist');

    this.chkOrbitPath = document.getElementById('show-orbit-path');
    this.chkArea = document.getElementById('show-swept-area');
    this.chkVectors = document.getElementById('show-vectors');
    this.chkFoci = document.getElementById('show-foci');

    this.telPeriod = document.getElementById('telemetry-period');
    this.telRatio = document.getElementById('telemetry-ratio');
    this.telSpeed = document.getElementById('telemetry-speed');
    this.telDist = document.getElementById('telemetry-distance');

    this.showGrid = true;
  }

  initializeControls() {
    this.sliderA.min = this.config.LIMITS.A_MIN;
    this.sliderA.max = this.config.LIMITS.A_MAX;
    this.sliderA.step = this.config.LIMITS.A_STEP;
    this.sliderA.value = this.config.DEFAULTS.A;

    this.sliderE.min = this.config.LIMITS.E_MIN;
    this.sliderE.max = this.config.LIMITS.E_MAX;
    this.sliderE.step = this.config.LIMITS.E_STEP;
    this.sliderE.value = this.config.DEFAULTS.E;

    this.sliderSpeed.min = this.config.LIMITS.SPEED_MIN;
    this.sliderSpeed.max = this.config.LIMITS.SPEED_MAX;
    this.sliderSpeed.step = this.config.LIMITS.SPEED_STEP;
    this.sliderSpeed.value = this.config.DEFAULTS.SPEED;

    this.sliderTrail.min = this.config.LIMITS.TRAIL_MIN;
    this.sliderTrail.max = this.config.LIMITS.TRAIL_MAX;
    this.sliderTrail.step = this.config.LIMITS.TRAIL_STEP;
    this.sliderTrail.value = this.config.DEFAULTS.TRAIL;

    this.presetSelect.innerHTML = '';
    Object.entries(this.config.PRESETS).forEach(([key, preset]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = preset.name;
      this.presetSelect.appendChild(option);
    });
    this.presetSelect.value = 'custom';
    this.updateLabels();
  }

  attachEvents() {
    const triggerUpdate = () => {
      this.updateLabels();
      this.onUpdate();
    };

    this.sliderA.addEventListener('input', () => {
      this.presetSelect.value = 'custom';
      triggerUpdate();
    });

    this.sliderE.addEventListener('input', () => {
      this.presetSelect.value = 'custom';
      triggerUpdate();
    });

    this.sliderSpeed.addEventListener('input', triggerUpdate);
    this.sliderTrail.addEventListener('input', triggerUpdate);

    this.presetSelect.addEventListener('change', (e) => {
      const preset = this.config.PRESETS[e.target.value];
      if (preset && e.target.value !== 'custom') {
        this.sliderA.value = preset.a;
        this.sliderE.value = preset.e;
        triggerUpdate();
      }
    });

    this.btnToggleSim.addEventListener('click', () => this.onToggleSim());
    this.btnReset.addEventListener('click', () => this.onReset());

    this.btnToggleGrid.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      this.btnToggleGrid.classList.toggle('text-amber-400', this.showGrid);
      this.btnToggleGrid.classList.toggle('text-slate-400', !this.showGrid);
    });

    this.btnOpenFormulas.addEventListener('click', () => {
      this.modalFormulas.classList.remove('hidden');
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([this.modalFormulas]).catch((err) => console.log(err));
      }
    });

    this.btnCloseFormulas.addEventListener('click', () => {
      this.modalFormulas.classList.add('hidden');
    });

    this.modalFormulas.addEventListener('click', (e) => {
      if (e.target === this.modalFormulas) {
        this.modalFormulas.classList.add('hidden');
      }
    });
  }

  updateLabels() {
    this.valA.textContent = `${parseFloat(this.sliderA.value).toFixed(2)} AU`;
    this.valE.textContent = parseFloat(this.sliderE.value).toFixed(2);
    this.valSpeed.textContent = `${parseFloat(this.sliderSpeed.value).toFixed(1)}x`;
    this.valTrail.textContent = `${this.sliderTrail.value} pts`;
  }

  updateGeometryInfo(perihelion, aphelion, c) {
    this.valPerihelion.textContent = `${perihelion.toFixed(2)} AU`;
    this.valAphelion.textContent = `${aphelion.toFixed(2)} AU`;
    this.valFocalDist.textContent = `${c.toFixed(2)} AU`;
  }

  getValues() {
    return {
      a: parseFloat(this.sliderA.value),
      e: parseFloat(this.sliderE.value),
      speed: parseFloat(this.sliderSpeed.value),
      trailPts: parseInt(this.sliderTrail.value, 10),
      showOrbitPath: this.chkOrbitPath.checked,
      showArea: this.chkArea.checked,
      showVectors: this.chkVectors.checked,
      showFoci: this.chkFoci.checked
    };
  }

  setPlayState(isRunning) {
    if (isRunning) {
      this.lblStart.textContent = 'Pause';
      this.btnToggleSim.firstElementChild.className = 'fa-solid fa-pause';
      this.btnToggleSim.className = 'px-3.5 py-1.5 rounded-xl font-semibold bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/30 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20';
    } else {
      this.lblStart.textContent = 'Start';
      this.btnToggleSim.firstElementChild.className = 'fa-solid fa-play';
      this.btnToggleSim.className = 'px-3.5 py-1.5 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/30 transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20';
    }
  }

  updateTelemetry(period, ratio, speed, distance) {
    this.telPeriod.textContent = `${period.toFixed(2)} yrs`;
    this.telRatio.textContent = ratio.toFixed(3);
    this.telSpeed.textContent = `${speed.toFixed(2)} km/s`;
    this.telDist.textContent = `${distance.toFixed(2)} AU`;
  }
}

// --- MAIN SIMULATION APPLICATION ---
class SimulationApp {
  constructor() {
    this.canvas = document.getElementById('sim-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.engine = new OrbitEngine(CONFIG);

    this.isRunning = true;
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this.ui = new UIManager(
      CONFIG, 
      () => this.syncUI(),
      () => this.resetSimulation(),
      () => this.toggleSimulation()
    );

    this.bindViewportControls();
    this.lastTime = performance.now();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.syncUI();
    this.ui.setPlayState(this.isRunning);

    // Initial MathJax Typeset Pass
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  bindViewportControls() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.zoomLevel = Math.min(this.zoomLevel * 1.25, 5.0);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.zoomLevel = Math.max(this.zoomLevel / 1.25, 0.3);
    });

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      this.zoomLevel = 1.0;
      this.panX = 0;
      this.panY = 0;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomLevel = Math.min(Math.max(this.zoomLevel * zoomFactor, 0.3), 5.0);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStart.x;
      this.panY = e.clientY - this.dragStart.y;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth - 320;
    this.canvas.height = rect.height || window.innerHeight - 60;
  }

  toggleSimulation() {
    this.isRunning = !this.isRunning;
    this.ui.setPlayState(this.isRunning);
  }

  resetSimulation() {
    this.engine.reset();
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1.0;
  }

  syncUI() {
    const values = this.ui.getValues();
    this.engine.setParameters(values.a, values.e);
    this.ui.updateGeometryInfo(
      this.engine.getPerihelion(),
      this.engine.getAphelion(),
      this.engine.getC()
    );
  }

  loop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    const uiState = this.ui.getValues();

    if (this.isRunning) {
      const simDtYears = dt * 0.2 * uiState.speed;
      this.engine.step(simDtYears, uiState.trailPts);
    }

    this.render(uiState);
    this.updateTelemetry();

    requestAnimationFrame((t) => this.loop(t));
  }

  render(uiState) {
    const { width, height } = this.canvas;
    if (width === 0 || height === 0) return;

    this.ctx.fillStyle = CONFIG.CANVAS.BG_COLOR;
    this.ctx.fillRect(0, 0, width, height);

    const minDim = Math.min(width, height);
    const scale = ((minDim * 0.38) / CONFIG.LIMITS.A_MAX) * this.zoomLevel;
    const centerX = width / 2 + this.panX;
    const centerY = height / 2 + this.panY;

    const cPx = this.engine.getC() * scale;
    const sunX = centerX - cPx;
    const sunY = centerY;

    // 0. Polar Grid Overlay
    if (this.ui.showGrid) {
      this.drawPolarGrid(sunX, sunY, scale);
    }

    // 1. Full Elliptical Path (Law 1)
    if (uiState.showOrbitPath) {
      this.ctx.beginPath();
      this.ctx.ellipse(
        centerX, centerY, 
        Math.max(1, this.engine.a * scale), 
        Math.max(1, this.engine.getB() * scale), 
        0, 0, 2 * Math.PI
      );
      this.ctx.strokeStyle = CONFIG.CANVAS.ORBIT_COLOR;
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // 2. Active Trail History
    if (this.engine.trailHistory.length > 1) {
      this.ctx.beginPath();
      const first = this.engine.trailHistory[0];
      this.ctx.moveTo(sunX + first.x * scale, sunY + first.y * scale);

      for (let i = 1; i < this.engine.trailHistory.length; i++) {
        const pt = this.engine.trailHistory[i];
        this.ctx.lineTo(sunX + pt.x * scale, sunY + pt.y * scale);
      }
      this.ctx.strokeStyle = CONFIG.CANVAS.TRAIL_COLOR;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    // 3. Equal Area Sweeps (Law 2)
    if (uiState.showArea) {
      const sweepRad = (CONFIG.DEFAULTS.SWEEP_ANGLE_DEG * Math.PI) / 180;
      const startAngle = this.engine.trueAnomaly - sweepRad / 2;
      const endAngle = this.engine.trueAnomaly + sweepRad / 2;

      this.ctx.beginPath();
      this.ctx.moveTo(sunX, sunY);
      for (let angle = startAngle; angle <= endAngle; angle += 0.02) {
        const pt = this.engine.getPosition(angle);
        this.ctx.lineTo(sunX + pt.x * scale, sunY + pt.y * scale);
      }
      this.ctx.closePath();
      this.ctx.fillStyle = CONFIG.CANVAS.SWEEP_COLOR;
      this.ctx.fill();
    }

    // 4. Focal Points (Law 1)
    if (uiState.showFoci) {
      this.ctx.fillStyle = CONFIG.CANVAS.FOCUS_COLOR;
      this.ctx.beginPath();
      this.ctx.arc(centerX + cPx, centerY, 4, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    // 5. Central Sun Body
    this.ctx.fillStyle = CONFIG.CANVAS.SUN_COLOR;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, 12, 0, 2 * Math.PI);
    this.ctx.fill();

    // 6. Planet Body
    const pos = this.engine.getPosition();
    const planetX = sunX + pos.x * scale;
    const planetY = sunY + pos.y * scale;

    this.ctx.fillStyle = CONFIG.CANVAS.PLANET_COLOR;
    this.ctx.beginPath();
    this.ctx.arc(planetX, planetY, 7, 0, 2 * Math.PI);
    this.ctx.fill();

    // 7. Velocity and Force Vectors
    if (uiState.showVectors) {
      const theta = this.engine.trueAnomaly;
      const mu = CONFIG.PHYSICS.G * CONFIG.PHYSICS.SUN_MASS;
      const p = this.engine.a * (1 - this.engine.e * this.engine.e);
      const vConst = Math.sqrt(mu / Math.max(0.0001, p));

      const vr = vConst * this.engine.e * Math.sin(theta);
      const vtheta = vConst * (1 + this.engine.e * Math.cos(theta));

      const vx = vr * Math.cos(theta) - vtheta * Math.sin(theta);
      const vy = vr * Math.sin(theta) + vtheta * Math.cos(theta);

      const vScale = 3.5;
      this.drawArrow(planetX, planetY, planetX + vx * vScale, planetY + vy * vScale, CONFIG.CANVAS.VECTOR_VELOCITY);

      const fScale = 32;
      const dx = sunX - planetX;
      const dy = sunY - planetY;
      const len = Math.hypot(dx, dy) || 1;
      this.drawArrow(planetX, planetY, planetX + (dx / len) * fScale, planetY + (dy / len) * fScale, CONFIG.CANVAS.VECTOR_FORCE);
    }
  }

  drawPolarGrid(cx, cy, scale) {
    this.ctx.strokeStyle = CONFIG.CANVAS.GRID_COLOR;
    this.ctx.lineWidth = 1;

    // Concentric AU distance circles
    for (let r = 1; r <= CONFIG.LIMITS.A_MAX; r++) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r * scale, 0, 2 * Math.PI);
      this.ctx.stroke();
    }

    // Radial spokes (every 30 degrees)
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + Math.cos(rad) * CONFIG.LIMITS.A_MAX * scale, cy + Math.sin(rad) * CONFIG.LIMITS.A_MAX * scale);
      this.ctx.stroke();
    }
  }

  drawArrow(fromX, fromY, toX, toY, color) {
    const headLen = 8;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
  }

  updateTelemetry() {
    const period = this.engine.getPeriod();
    const ratio = Math.pow(period, 2) / Math.pow(this.engine.a, 3);
    const speed = this.engine.getSpeed();
    const dist = this.engine.getDistance();

    this.ui.updateTelemetry(period, ratio, speed, dist);
  }
}

// Start simulation on DOM load
window.addEventListener('DOMContentLoaded', () => new SimulationApp());