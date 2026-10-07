// Dynamic Configuration & Constants
const CONFIG = {
  CANVAS: {
    BG_COLOR: '#030712',
    ORBIT_COLOR: 'rgba(245, 158, 11, 0.4)',
    TRAIL_COLOR: 'rgba(56, 189, 248, 0.8)',
    GRID_COLOR: 'rgba(255, 255, 255, 0.05)',
    SUN_COLOR: '#fbbf24',
    PLANET_COLOR: '#38bdf8',
    SWEEP_COLOR: 'rgba(245, 158, 11, 0.35)',
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
    A_MAX: 20.0,
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
    TRAIL: 800
  },
  PRESETS: {
    custom: { name: 'Preset: Custom Orbit', a: 2.000, e: 0.5000 },
    mercury: { name: 'Preset: Mercury Orbit', a: 0.387, e: 0.2056 },
    earth: { name: 'Preset: Earth Circular Orbit', a: 1.000, e: 0.0167 },
    mars: { name: 'Preset: Mars Orbit', a: 1.524, e: 0.0934 },
    halley: { name: "Preset: Halley's Comet (Real)", a: 17.83, e: 0.9671 }
  }
};

// Orbital Physics Engine using RK4 Numerical Integration
class OrbitEngine {
  constructor(config) {
    this.config = config;
    this.a = config.DEFAULTS.A;
    this.e = config.DEFAULTS.E;
    
    // Cartesian State Vectors: (x, y) relative to Sun at (0, 0)
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    this.trailHistory = [];
    this.sectorHistory = []; // Array of { pos, time }
    this.reset();
  }

  setParameters(a, e) {
    const newA = Math.max(0.1, a);
    const newE = Math.min(0.99, Math.max(0, e));

    if (this.a !== newA || this.e !== newE) {
      this.a = newA;
      this.e = newE;
      this.reset();
    }
  }

  reset() {
    // Initialize orbit at perihelion on the positive X-axis
    const rPeri = this.a * (1 - this.e);
    const mu = this.config.PHYSICS.G * this.config.PHYSICS.SUN_MASS;
    const vPeri = Math.sqrt(mu * (2 / rPeri - 1 / this.a));

    this.x = rPeri;
    this.y = 0;
    this.vx = 0;
    this.vy = vPeri; // Perpendicular velocity at perihelion

    this.trailHistory = [];
    this.sectorHistory = [];
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

  getDistance() {
    return Math.hypot(this.x, this.y);
  }

  getSpeed() {
    const vAUperYr = Math.hypot(this.vx, this.vy);
    return (vAUperYr * this.config.PHYSICS.AU_IN_KM) / this.config.PHYSICS.SEC_IN_YEAR;
  }

  getTrueAnomaly() {
    let theta = Math.atan2(this.y, this.x);
    if (theta < 0) theta += 2 * Math.PI;
    return theta;
  }

  // Equations of motion derivative function for RK4
  getDerivatives(x, y, vx, vy) {
    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);
    if (r === 0) return { dx: 0, dy: 0, dvx: 0, dvy: 0 };

    const mu = this.config.PHYSICS.G * this.config.PHYSICS.SUN_MASS;
    const ax = -(mu * x) / (r2 * r);
    const ay = -(mu * y) / (r2 * r);

    return { dx: vx, dy: vy, dvx: ax, dvy: ay };
  }

  // 4th-Order Runge-Kutta Step
  stepRK4(dt) {
    const k1 = this.getDerivatives(this.x, this.y, this.vx, this.vy);

    const k2 = this.getDerivatives(
      this.x + 0.5 * dt * k1.dx,
      this.y + 0.5 * dt * k1.dy,
      this.vx + 0.5 * dt * k1.dvx,
      this.vy + 0.5 * dt * k1.dvy
    );

    const k3 = this.getDerivatives(
      this.x + 0.5 * dt * k2.dx,
      this.y + 0.5 * dt * k2.dy,
      this.vx + 0.5 * dt * k2.dvx,
      this.vy + 0.5 * dt * k2.dvy
    );

    const k4 = this.getDerivatives(
      this.x + dt * k3.dx,
      this.y + dt * k3.dy,
      this.vx + dt * k3.dvx,
      this.vy + dt * k3.dvy
    );

    this.x += (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    this.y += (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
    this.vx += (dt / 6) * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx);
    this.vy += (dt / 6) * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy);
  }

  step(dtYears, maxTrailPts, sweepDurationYears, currentTimeYears) {
    this.stepRK4(dtYears);

    const pos = { x: this.x, y: this.y };

    // 1. Distance-threshold based visual trail recording to guarantee smooth render curves
    const lastPos = this.trailHistory[this.trailHistory.length - 1];
    if (!lastPos || Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) > 0.005) {
      this.trailHistory.push(pos);
      if (this.trailHistory.length > maxTrailPts) {
        this.trailHistory.shift();
      }
    }

    // 2. Continuous time window recording for swept area sector
    this.sectorHistory.push({ pos, time: currentTimeYears });

    const cutoffTime = currentTimeYears - sweepDurationYears;
    while (this.sectorHistory.length > 0 && this.sectorHistory[0].time < cutoffTime) {
      this.sectorHistory.shift();
    }
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }
}

// UI Controller
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
    this.presetSelectMobile = document.getElementById('preset-select-mobile');
    
    this.sliderA = document.getElementById('semi-major-axis');
    this.sliderE = document.getElementById('eccentricity');
    this.sliderSpeed = document.getElementById('sim-speed');
    this.sliderTrail = document.getElementById('trail-length');
    
    this.btnToggleSim = document.getElementById('btn-toggle-sim');
    this.lblStart = document.getElementById('lbl-start');
    this.btnReset = document.getElementById('btn-reset');
    this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    this.btnCloseSidebar = document.getElementById('btn-close-sidebar');
    this.sidebarPanel = document.getElementById('sidebar-panel');

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
    this.chkGrid = document.getElementById('show-grid');
    this.chkSemiMajorAxis = document.getElementById('show-semi-major-axis');

    this.telPeriod = document.getElementById('telemetry-period');
    this.telRatio = document.getElementById('telemetry-ratio');
    this.telSpeed = document.getElementById('telemetry-speed');
    this.telDist = document.getElementById('telemetry-distance');
    this.telemetryPanel = document.getElementById('telemetry-panel');
    this.toggleTelemetryBtn = document.getElementById('btn-toggle-telemetry');
    this.closeTelemetryBtn = document.getElementById('btn-close-telemetry');
    this.sliderSweepTime = document.getElementById('sweep-time');
    this.valSweepTime = document.getElementById('val-sweep-time');
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

    if (this.presetSelect) {
      this.presetSelect.innerHTML = '';
      Object.entries(this.config.PRESETS).forEach(([key, preset]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = preset.name;
        this.presetSelect.appendChild(option);
      });
      this.presetSelect.value = 'custom';
    }

    if (this.presetSelectMobile) {
      this.presetSelectMobile.innerHTML = '';
      Object.entries(this.config.PRESETS).forEach(([key, preset]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = preset.name;
        this.presetSelectMobile.appendChild(option);
      });
      this.presetSelectMobile.value = 'custom';
    }

    if (this.toggleTelemetryBtn && this.telemetryPanel) {
      this.toggleTelemetryBtn.onclick = () => {
        this.telemetryPanel.classList.toggle('translate-y-[120%]');
      };
    }

    if (this.closeTelemetryBtn && this.telemetryPanel) {
      this.closeTelemetryBtn.onclick = () => {
        this.telemetryPanel.classList.add('translate-y-[120%]');
      };
    }

    this.updateLabels();
  }

  attachEvents() {
    const triggerUpdate = () => {
      this.updateLabels();
      this.onUpdate();
    };

    this.sliderA.addEventListener('input', () => {
      if (this.presetSelect) this.presetSelect.value = 'custom';
      if (this.presetSelectMobile) this.presetSelectMobile.value = 'custom';
      triggerUpdate();
    });

    this.sliderE.addEventListener('input', () => {
      if (this.presetSelect) this.presetSelect.value = 'custom';
      if (this.presetSelectMobile) this.presetSelectMobile.value = 'custom';
      triggerUpdate();
    });

    this.sliderSpeed.addEventListener('input', triggerUpdate);
    this.sliderTrail.addEventListener('input', triggerUpdate);

    const handlePresetChange = (val) => {
      const preset = this.config.PRESETS[val];
      if (preset && val !== 'custom') {
        this.sliderA.value = preset.a;
        this.sliderE.value = preset.e;
        if (this.presetSelect) this.presetSelect.value = val;
        if (this.presetSelectMobile) this.presetSelectMobile.value = val;

        if (window.app) {
          window.app.zoomLevel = 1.0;
          window.app.panX = 0;
          window.app.panY = 0;
        }

        triggerUpdate();
      }
    };

    if (this.presetSelect) {
      this.presetSelect.addEventListener('change', (e) => handlePresetChange(e.target.value));
    }
    if (this.presetSelectMobile) {
      this.presetSelectMobile.addEventListener('change', (e) => handlePresetChange(e.target.value));
    }

    this.btnToggleSim.addEventListener('click', () => this.onToggleSim());
    this.btnReset.addEventListener('click', () => this.onReset());

    if (this.btnToggleSidebar) {
      this.btnToggleSidebar.addEventListener('click', () => {
        this.sidebarPanel.classList.toggle('-translate-x-full');
      });
    }

    if (this.btnCloseSidebar) {
      this.btnCloseSidebar.addEventListener('click', () => {
        this.sidebarPanel.classList.add('-translate-x-full');
      });
    }

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

    if (this.sliderSweepTime) {
      this.sliderSweepTime.addEventListener('input', () => {
        this.updateLabels();
        this.onUpdate();
      });
    }

    if (this.chkSemiMajorAxis) {
      this.chkSemiMajorAxis.addEventListener('change', () => this.onUpdate());
    }
  }

  updateLabels() {
    this.valA.textContent = `${parseFloat(this.sliderA.value).toFixed(2)} AU`;
    this.valE.textContent = parseFloat(this.sliderE.value).toFixed(2);
    this.valSpeed.textContent = `${parseFloat(this.sliderSpeed.value).toFixed(1)}x`;
    this.valTrail.textContent = `${this.sliderTrail.value} pts`;
    if (this.sliderSweepTime && this.valSweepTime) {
      this.valSweepTime.textContent = `${parseFloat(this.sliderSweepTime.value).toFixed(2)} yrs`;
    }
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
      sweepTime: this.sliderSweepTime ? parseFloat(this.sliderSweepTime.value) : 0.20,
      showOrbitPath: this.chkOrbitPath.checked,
      showArea: this.chkArea.checked,
      showVectors: this.chkVectors.checked,
      showFoci: this.chkFoci.checked,
      showGrid: this.chkGrid ? this.chkGrid.checked : true,
      showSemiMajorAxis: this.chkSemiMajorAxis ? this.chkSemiMajorAxis.checked : false
    };
  }

  setPlayState(isRunning) {
    if (isRunning) {
      this.lblStart.textContent = 'Pause';
      this.btnToggleSim.firstElementChild.className = 'fa-solid fa-pause';
      this.btnToggleSim.className = 'px-3 py-1.5 rounded-xl font-semibold bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/30 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20';
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

// Main Simulation Application
class SimulationApp {
  constructor() {
    window.app = this;
    this.canvas = document.getElementById('sim-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.engine = new OrbitEngine(CONFIG);

    this.isRunning = true;
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.simTimeYears = 0;

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
    }, { passive: false });

    const startDrag = (x, y) => {
      this.isDragging = true;
      this.dragStart = { x: x - this.panX, y: y - this.panY };
    };

    const moveDrag = (x, y) => {
      if (!this.isDragging) return;
      this.panX = x - this.dragStart.x;
      this.panY = y - this.dragStart.y;
    };

    const endDrag = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1) {
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchend', endDrag);
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
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
      const totalSimDtYears = dt * 0.2 * uiState.speed;
      this.simTimeYears += totalSimDtYears;

      // Fine sub-stepping constraint (max step of ~4.4 hours)
      const maxSubStep = 0.0005; 
      const steps = Math.max(1, Math.ceil(totalSimDtYears / maxSubStep));
      const subDt = totalSimDtYears / steps;

      for (let s = 0; s < steps; s++) {
        const subTime = this.simTimeYears - totalSimDtYears + subDt * (s + 1);
        this.engine.step(subDt, uiState.trailPts, uiState.sweepTime, subTime);
      }
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
    const currentAphelion = Math.max(0.1, this.engine.getAphelion());
    const scale = ((minDim * 0.40) / currentAphelion) * this.zoomLevel;
    const centerX = width / 2 + this.panX;
    const centerY = height / 2 + this.panY;

    const cPx = this.engine.getC() * scale;
    const sunX = centerX - cPx;
    const sunY = centerY;

    if (uiState.showGrid) {
      this.drawPolarGrid(sunX, sunY, scale);
    }

    // 1. Orbit Ellipse Line
    if (uiState.showOrbitPath) {
      this.ctx.beginPath();
      this.ctx.ellipse(
        sunX - cPx, 
        centerY, 
        Math.max(1, this.engine.a * scale), 
        Math.max(1, this.engine.getB() * scale), 
        0, 0, 2 * Math.PI
      );
      this.ctx.strokeStyle = CONFIG.CANVAS.ORBIT_COLOR;
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }

    // 2. Planet Motion Trail Line (Cyan)
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

    // 3. Swept Area Sector (Amber Wedge)
    if (uiState.showArea && this.engine.sectorHistory && this.engine.sectorHistory.length > 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(sunX, sunY); // Start at Sun focus

      for (let i = 0; i < this.engine.sectorHistory.length; i++) {
        const pt = this.engine.sectorHistory[i].pos;
        this.ctx.lineTo(sunX + pt.x * scale, sunY + pt.y * scale);
      }

      this.ctx.closePath(); // Form clean closed sector back to Sun
      this.ctx.fillStyle = CONFIG.CANVAS.SWEEP_COLOR;
      this.ctx.fill();
    }

    // 4. Secondary Focus
    if (uiState.showFoci) {
      this.ctx.fillStyle = CONFIG.CANVAS.FOCUS_COLOR;
      
      this.ctx.beginPath();
      this.ctx.arc(sunX - 2 * cPx, centerY, 5, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    // 5. Sun (Primary Focus)
    this.ctx.fillStyle = CONFIG.CANVAS.SUN_COLOR;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, 12, 0, 2 * Math.PI);
    this.ctx.fill();

    // 6. Planet
    const pos = this.engine.getPosition();
    const planetX = sunX + pos.x * scale;
    const planetY = sunY + pos.y * scale;

    this.ctx.fillStyle = CONFIG.CANVAS.PLANET_COLOR;
    this.ctx.beginPath();
    this.ctx.arc(planetX, planetY, 7, 0, 2 * Math.PI);
    this.ctx.fill();

    // 7. Physical Vectors
    if (uiState.showVectors) {
      // Velocity Vector (Green) scaled from (vx, vy)
      const vScale = 3.5;
      this.drawArrow(
        planetX, 
        planetY, 
        planetX + this.engine.vx * vScale, 
        planetY + this.engine.vy * vScale, 
        CONFIG.CANVAS.VECTOR_VELOCITY
      );

      // Force Vector towards Sun (Red)
      const fScale = 32;
      const dx = sunX - planetX;
      const dy = sunY - planetY;
      const len = Math.hypot(dx, dy) || 1;
      this.drawArrow(
        planetX, 
        planetY, 
        planetX + (dx / len) * fScale, 
        planetY + (dy / len) * fScale, 
        CONFIG.CANVAS.VECTOR_FORCE
      );
    }

    // Render Semi-Major Axis (a) Segment Line and Label
    if (uiState.showSemiMajorAxis) {
      const cPx = this.engine.getC() * scale;
      const aPx = this.engine.a * scale;
      const ellipseCenterX = sunX - cPx;

      this.ctx.save();
      
      // Semi-major axis line passing through the ellipse center across length 'a'
      this.ctx.beginPath();
      this.ctx.moveTo(ellipseCenterX, centerY);
      this.ctx.lineTo(ellipseCenterX + aPx, centerY);
      this.ctx.strokeStyle = '#ec4899'; // Bright Pink Line
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]); // Dashed line style
      this.ctx.stroke();

      // Draw end ticks
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(ellipseCenterX, centerY - 6);
      this.ctx.lineTo(ellipseCenterX, centerY + 6);
      this.ctx.moveTo(ellipseCenterX + aPx, centerY - 6);
      this.ctx.lineTo(ellipseCenterX + aPx, centerY + 6);
      this.ctx.stroke();

      // Label text "a = X.XX AU"
      this.ctx.fillStyle = '#ec4899';
      this.ctx.font = '12px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`a = ${this.engine.a.toFixed(2)} AU`, ellipseCenterX + aPx / 2, centerY - 10);

      this.ctx.restore();
    }
  }

  drawPolarGrid(cx, cy, scale) {
    this.ctx.strokeStyle = CONFIG.CANVAS.GRID_COLOR;
    this.ctx.lineWidth = 1;

    const maxRadiusPx = Math.hypot(
      Math.max(cx, this.canvas.width - cx),
      Math.max(cy, this.canvas.height - cy)
    );

    const stepAu = 1.0;
    const stepPx = stepAu * scale;

    for (let rPx = stepPx; rPx <= maxRadiusPx; rPx += stepPx) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, rPx, 0, 2 * Math.PI);
      this.ctx.stroke();
    }

    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(
        cx + Math.cos(rad) * maxRadiusPx, 
        cy + Math.sin(rad) * maxRadiusPx
      );
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

window.addEventListener('DOMContentLoaded', () => new SimulationApp());