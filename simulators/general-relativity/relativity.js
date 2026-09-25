/**
 * General Relativity & Schwarzschild Geodesics Engine
 * Dynamic Physics Architecture
 */

// Universal Physical Constants
const C = 299792458;          // Speed of light in m/s
const G = 6.67430e-11;        // Gravitational constant in m^3 kg^-1 s^-2
const M_SOLAR = 1.989e30;     // Solar mass in kg

const state = {
    running: false,
    alpha: 1.0,              // GR correction multiplier (1.0 = GR, 0.0 = Newtonian)
    massSolar: 10,           // Black hole mass in solar masses (M☉)
    particleType: 'massive', // 'massive' or 'photon'
    initialSpeedC: 0.18,     // Speed relative to c
    trailMaxLength: 3000,    // Path trajectory history
    showGrid: true,
    showHorizons: true,
    zoom: 1.0,
    panOffset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    particle: null,
    trail: [],
    // Dynamic Orbit & Precession Analytics
    lastPeriapsisPhi: null,
    precessionShiftDeg: 0.0,
    totalPrecessionDeg: 0.0
};

let canvas, ctx;

/**
 * Dynamically compute Schwarzschild Critical Radii from active mass
 */
function getSchwarzschildRadii() {
    const M = state.massSolar * M_SOLAR;
    const rs = (2 * G * M) / (C * C); // Event horizon radius (2GM / c^2)
    return {
        M: M,
        rs: rs,
        rPhoton: 1.5 * rs,            // Photon sphere boundary
        rISCO: 3.0 * rs,              // Innermost Stable Circular Orbit
        bCrit: (Math.sqrt(27) / 2) * rs // Critical impact parameter for light capture
    };
}

/**
 * Dynamic Relativistic Particle Entity
 */
class RelativisticParticle {
    constructor(r, phi, vr, vphi) {
        this.r = r;       // Radial position (m)
        this.phi = phi;   // Azimuthal angle (rad)
        this.vr = vr;     // Radial velocity (m/s)
        this.vphi = vphi; // Angular velocity (rad/s)
    }

    get Cartesian() {
        return {
            x: this.r * Math.cos(this.phi),
            y: this.r * Math.sin(this.phi)
        };
    }
}

/**
 * Dynamically switch particle type
 */
function setParticleType(type) {
    state.particleType = type;
    loadPreset(type === 'photon' ? 'light-bending' : 'precession');
}

/**
 * Dynamic Preset Loader & Critical Boundaries Calculator
 */
function loadPreset(presetKey) {
    state.trail = [];
    state.running = false;
    state.lastPeriapsisPhi = null;
    state.precessionShiftDeg = 0.0;
    state.totalPrecessionDeg = 0.0;

    const playLbl = document.getElementById('lbl-play');
    if (playLbl) playLbl.innerText = 'Start';

    const radii = getSchwarzschildRadii();
    const rs = radii.rs;

    switch (presetKey) {
        case 'precession': {
            state.particleType = 'massive';
            state.alpha = 1.0;
            state.massSolar = 10;
            
            const startR = 7.5 * rs;
            const vCirc = Math.sqrt((G * radii.M) / startR);
            const vBound = vCirc * 0.82;
            
            state.initialSpeedC = vBound / C;
            state.particle = new RelativisticParticle(startR, 0, -0.01 * C, vBound / startR);
            state.zoom = 1.0;

            const a = startR;
            const e = 0.25;
            const theoreticalShiftRad = (6 * Math.PI * G * radii.M) / (a * (1 - e * e) * C * C) * state.alpha;
            state.precessionShiftDeg = theoreticalShiftRad * (180 / Math.PI);
            break;
        }
        case 'photon-sphere': {
            state.particleType = 'photon';
            state.alpha = 1.0;
            state.massSolar = 10;
            state.initialSpeedC = 1.0;
            
            // Aim precisely at critical impact parameter b_crit
            const startR = 12.0 * rs;
            const impactParameter = radii.bCrit * 1.001; 
            const vr = -C * Math.sqrt(Math.max(0, 1 - Math.pow(impactParameter / startR, 2)));
            const vphi = (C * impactParameter) / Math.pow(startR, 2);
            
            state.particle = new RelativisticParticle(startR, Math.PI / 4, vr, vphi);
            state.zoom = 0.55;
            break;
        }
        case 'isco': {
            state.particleType = 'massive';
            state.alpha = 1.0;
            state.massSolar = 10;
            
            const vISCO = Math.sqrt((G * radii.M) / radii.rISCO);
            state.initialSpeedC = vISCO / C;
            state.particle = new RelativisticParticle(radii.rISCO * 1.005, 0, 0, vISCO / radii.rISCO);
            state.zoom = 1.8;
            break;
        }
        case 'light-bending': {
            state.particleType = 'photon';
            state.alpha = 1.0;
            state.massSolar = 10;
            state.initialSpeedC = 1.0;
            
            const startR = 12.0 * rs;
            const impactParameter = radii.bCrit * 1.8;
            const vr = -C * Math.sqrt(Math.max(0, 1 - Math.pow(impactParameter / startR, 2)));
            const vphi = (C * impactParameter) / Math.pow(startR, 2);
            
            state.particle = new RelativisticParticle(startR, Math.PI / 3, vr, vphi);
            state.zoom = 0.55;
            break;
        }
        case 'black-hole-plunge': {
            state.particleType = 'massive';
            state.alpha = 1.0;
            state.massSolar = 10;
            
            const startR = 5.0 * rs;
            const vEsc = Math.sqrt((2 * G * radii.M) / startR);
            const vPlunge = vEsc * 0.4;
            
            state.initialSpeedC = vPlunge / C;
            state.particle = new RelativisticParticle(startR, 0, -vPlunge * 0.3, (vPlunge * 0.7) / startR);
            state.zoom = 1.2;
            break;
        }
    }

    state.panOffset = { x: 0, y: 0 };
    syncControlsWithState();
    updateUI();
    renderKaTeX();
}

/**
 * Numerical Integration (RK4 Solver with Velocity-Crossing Periapsis Detector)
 */
function physicsStep(dt) {
    if (!state.particle) return;

    const radii = getSchwarzschildRadii();
    const GM = G * radii.M;
    const p = state.particle;

    // Check if particle crosses event horizon
    if (p.r <= radii.rs) {
        state.running = false;
        return;
    }

    // Dynamic Geodesic Equations of Motion
    const derivatives = (r, vr, vphi) => {
        const L = r * r * vphi;
        let ar = 0;
        
        if (state.particleType === 'photon') {
            // Photon Geodesic: d^2r/d\tau^2 = r*(vphi^2) - (3*GM*L^2)/(c^2 * r^4) * alpha
            const grTerm = (3 * GM * L * L) / (C * C * Math.pow(r, 4)) * state.alpha;
            ar = r * vphi * vphi - grTerm;
        } else {
            // Massive Particle Geodesic with GR Precession Term
            const grTerm = (3 * GM * L * L) / (C * C * Math.pow(r, 4)) * state.alpha;
            ar = r * vphi * vphi - (GM / (r * r)) + grTerm;
        }

        const aphi = (-2 * vr * vphi) / r;
        return { vr, vphi, ar, aphi };
    };

    const oldVr = p.vr;

    // RK4 Integration
    const k1 = derivatives(p.r, p.vr, p.vphi);
    const k2 = derivatives(p.r + 0.5 * dt * k1.vr, p.vr + 0.5 * dt * k1.ar, p.vphi + 0.5 * dt * k1.aphi);
    const k3 = derivatives(p.r + 0.5 * dt * k2.vr, p.vr + 0.5 * dt * k2.ar, p.vphi + 0.5 * dt * k2.aphi);
    const k4 = derivatives(p.r + dt * k3.vr, p.vr + dt * k3.ar, p.vphi + dt * k3.aphi);

    p.r += (dt / 6) * (k1.vr + 2 * k2.vr + 2 * k3.vr + k4.vr);
    p.phi += (dt / 6) * (k1.vphi + 2 * k2.vphi + 2 * k3.vphi + k4.vphi);
    p.vr += (dt / 6) * (k1.ar + 2 * k2.ar + 2 * k3.ar + k4.ar);
    p.vphi += (dt / 6) * (k1.aphi + 2 * k2.aphi + 2 * k3.aphi + k4.aphi);

    // Dynamic Periapsis Detector (vr switches from negative to positive)
    if (oldVr < 0 && p.vr >= 0 && state.particleType === 'massive') {
        const currentPhi = p.phi;
        if (state.lastPeriapsisPhi !== null) {
            const phiPassed = currentPhi - state.lastPeriapsisPhi;
            const shiftRad = phiPassed - (2 * Math.PI);
            state.precessionShiftDeg = (shiftRad * (180 / Math.PI)) % 360;
            state.totalPrecessionDeg += state.precessionShiftDeg;
        }
        state.lastPeriapsisPhi = currentPhi;
    }

    const pos = p.Cartesian;
    state.trail.push({ x: pos.x, y: pos.y, r: p.r });
    if (state.trail.length > state.trailMaxLength) {
        state.trail.shift();
    }
}

/**
 * Synchronize UI inputs dynamically with state
 */
function syncControlsWithState() {
    const sliderAlpha = document.getElementById('slider-alpha');
    if (sliderAlpha) {
        sliderAlpha.value = state.alpha;
        document.getElementById('disp-alpha').innerText = state.alpha.toFixed(2);
    }

    const sliderMass = document.getElementById('slider-mass');
    if (sliderMass) {
        sliderMass.value = state.massSolar;
        document.getElementById('disp-mass').innerText = `${state.massSolar} M☉`;
    }

    const sliderSpeed = document.getElementById('slider-speed');
    if (sliderSpeed) {
        sliderSpeed.value = state.initialSpeedC;
        document.getElementById('disp-speed').innerText = `${state.initialSpeedC.toFixed(3)} c`;
    }

    const btnMassive = document.getElementById('btn-type-massive');
    const btnPhoton = document.getElementById('btn-type-photon');
    if (btnMassive && btnPhoton) {
        if (state.particleType === 'massive') {
            btnMassive.className = "py-1.5 rounded-lg bg-purple-600 text-white font-semibold text-xs border border-purple-500/50";
            btnPhoton.className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700";
        } else {
            btnPhoton.className = "py-1.5 rounded-lg bg-amber-600 text-white font-semibold text-xs border border-amber-500/50";
            btnMassive.className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700";
        }
    }
}

/**
 * Recalculate particle angular velocity dynamically from slider speed input
 */
function updateParticleSpeed() {
    if (!state.particle) return;
    const speed = state.initialSpeedC * C;
    state.particle.vphi = speed / state.particle.r;
    state.trail = [];
    state.lastPeriapsisPhi = null;
    state.precessionShiftDeg = 0.0;
}

/**
 * Coordinate System Transformations
 */
function worldToScreen(wx, wy) {
    const radii = getSchwarzschildRadii();
    const baseRadius = Math.min(canvas.width, canvas.height) / 22;
    const scale = (baseRadius / radii.rs) * state.zoom;
    const sx = canvas.width / 2 + wx * scale + state.panOffset.x;
    const sy = canvas.height / 2 - wy * scale + state.panOffset.y;
    return { x: sx, y: sy };
}

/**
 * Canvas Render Loop
 */
function render() {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const radii = getSchwarzschildRadii();
    const center = worldToScreen(0, 0);

    if (state.showGrid) drawSpacetimeGrid(center, radii);
    if (state.showHorizons) drawCriticalHorizons(center, radii);

    // Dynamic Trail Rendering
    if (state.trail.length > 1) {
        ctx.beginPath();
        const start = worldToScreen(state.trail[0].x, state.trail[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < state.trail.length; i++) {
            const pt = worldToScreen(state.trail[i].x, state.trail[i].y);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = state.particleType === 'photon' ? '#f59e0b' : '#c084fc';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Dynamic Particle Renderer
    if (state.particle) {
        const pos = state.particle.Cartesian;
        const pScreen = worldToScreen(pos.x, pos.y);

        ctx.beginPath();
        ctx.arc(pScreen.x, pScreen.y, state.particleType === 'photon' ? 4 : 6, 0, Math.PI * 2);
        ctx.fillStyle = state.particleType === 'photon' ? '#f59e0b' : '#a855f7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function drawCriticalHorizons(center, radii) {
    const baseRadius = Math.min(canvas.width, canvas.height) / 22;
    const scale = (baseRadius / radii.rs) * state.zoom;

    // ISCO Boundary (3.0 r_s)
    ctx.beginPath();
    ctx.arc(center.x, center.y, radii.rISCO * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    // Photon Sphere Boundary (1.5 r_s)
    ctx.beginPath();
    ctx.arc(center.x, center.y, radii.rPhoton * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Event Horizon Boundary (1.0 r_s)
    ctx.beginPath();
    ctx.arc(center.x, center.y, radii.rs * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawSpacetimeGrid(center, radii) {
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.12)';
    ctx.lineWidth = 1;

    const baseRadius = Math.min(canvas.width, canvas.height) / 22;
    const scale = (baseRadius / radii.rs) * state.zoom;
    const ringSpacing = radii.rs * scale * 2;

    if (ringSpacing < 10) return;

    const maxDimension = Math.hypot(canvas.width, canvas.height);
    const totalRings = Math.min(Math.ceil(maxDimension / ringSpacing), 30);

    for (let rFactor = 1; rFactor <= totalRings; rFactor++) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, rFactor * ringSpacing, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Single Unified Dynamic Telemetry Dashboard Updater
 */
function updateUI() {
    const radii = getSchwarzschildRadii();

    // Critical Boundaries dynamically calculated in km from active Mass
    const elRs = document.getElementById('disp-rs');
    const elRPhoton = document.getElementById('disp-rphoton');
    const elRISCO = document.getElementById('disp-risco');

    if (elRs) elRs.innerText = `${(radii.rs / 1000).toFixed(1)} km`;
    if (elRPhoton) elRPhoton.innerText = `${(radii.rPhoton / 1000).toFixed(1)} km`;
    if (elRISCO) elRISCO.innerText = `${(radii.rISCO / 1000).toFixed(1)} km`;

    if (state.particle) {
        const rRatio = state.particle.r / radii.rs;
        
        // Radial Distance Telemetry
        const elHudR = document.querySelectorAll('#hud-r-rs');
        elHudR.forEach(el => el.innerText = `${rRatio.toFixed(2)} rₛ`);

        // Time Dilation
        const elHudDilation = document.querySelectorAll('#hud-time-dilation');
        const dilation = rRatio > 1.0 ? (1 / Math.sqrt(1 - 1 / rRatio)).toFixed(2) : '∞';
        elHudDilation.forEach(el => el.innerText = `${dilation}x slower`);

        // Effective Potential
        const elHudVeff = document.querySelectorAll('#hud-veff, #hud-potential');
        const L = state.particle.r * state.particle.vphi;
        const veff = -(G * radii.M / state.particle.r) + (L * L) / (2 * Math.pow(state.particle.r, 2)) - (G * radii.M * L * L) / (C * C * Math.pow(state.particle.r, 3));
        elHudVeff.forEach(el => el.innerText = `${(veff / (C * C)).toFixed(2)} c²`);

        // Real-time Precession Shift
        const elHudPrecession = document.querySelectorAll('#hud-precession');
        elHudPrecession.forEach(el => el.innerText = `${state.precessionShiftDeg.toFixed(1)}° / orbit`);
    }
}

function renderKaTeX() {
    if (typeof katex === 'undefined') return;
    document.querySelectorAll('.katex-block').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) katex.render(formula, el, { throwOnError: false, displayMode: true });
    });
}

/**
 * Initialize Event Listeners
 */
function setupEventListeners() {
    window.addEventListener('resize', () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });

    document.getElementById('btn-type-massive').onclick = () => setParticleType('massive');
    document.getElementById('btn-type-photon').onclick = () => setParticleType('photon');

    document.getElementById('btn-zoom-in').onclick = () => state.zoom = Math.min(state.zoom * 1.25, 10.0);
    document.getElementById('btn-zoom-out').onclick = () => state.zoom = Math.max(state.zoom / 1.25, 0.1);
    document.getElementById('btn-recenter').onclick = () => {
        state.zoom = 1.0;
        state.panOffset = { x: 0, y: 0 };
    };

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        state.zoom = e.deltaY < 0 ? Math.min(state.zoom * 1.1, 10.0) : Math.max(state.zoom / 1.1, 0.1);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        state.isDragging = true;
        state.dragStart = { x: e.clientX - state.panOffset.x, y: e.clientY - state.panOffset.y };
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging) return;
        state.panOffset.x = e.clientX - state.dragStart.x;
        state.panOffset.y = e.clientY - state.dragStart.y;
    });

    window.addEventListener('mouseup', () => state.isDragging = false);

    document.getElementById('btn-play').onclick = () => {
        state.running = !state.running;
        document.getElementById('lbl-play').innerText = state.running ? 'Pause' : 'Start';
    };

    document.getElementById('btn-reset').onclick = () => {
        loadPreset(document.getElementById('preset-select').value);
    };

    document.getElementById('preset-select').onchange = (e) => {
        loadPreset(e.target.value);
    };

    document.getElementById('slider-alpha').oninput = (e) => {
        state.alpha = parseFloat(e.target.value);
        document.getElementById('disp-alpha').innerText = state.alpha.toFixed(2);
    };

    document.getElementById('slider-speed').oninput = (e) => {
        state.initialSpeedC = parseFloat(e.target.value);
        document.getElementById('disp-speed').innerText = `${state.initialSpeedC.toFixed(3)} c`;
        updateParticleSpeed();
    };

    document.getElementById('slider-mass').oninput = (e) => {
        state.massSolar = parseFloat(e.target.value);
        document.getElementById('disp-mass').innerText = `${state.massSolar} M☉`;
        updateUI();
    };

    document.getElementById('slider-trail-len').oninput = (e) => {
        state.trailMaxLength = parseInt(e.target.value);
        document.getElementById('disp-trail-len').innerText = `${state.trailMaxLength} pts`;
    };

    document.getElementById('toggle-grid').onclick = () => state.showGrid = !state.showGrid;
    document.getElementById('toggle-horizons').onclick = () => state.showHorizons = !state.showHorizons;

    const mathModal = document.getElementById('math-modal');
    document.getElementById('btn-math-modal').onclick = () => {
        mathModal.classList.remove('hidden');
        renderKaTeX();
    };
    document.getElementById('btn-close-math').onclick = () => mathModal.classList.add('hidden');
}

/**
 * Dynamic Main Loop
 */
function animate() {
    if (state.running) {
        const radii = getSchwarzschildRadii();
        const dt = (radii.rs / C) * 0.15;
        for (let i = 0; i < 10; i++) {
            physicsStep(dt);
        }
        updateUI();
    }
    render();
    requestAnimationFrame(animate);
}

window.onload = () => {
    canvas = document.getElementById('sim-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    setupEventListeners();
    loadPreset('precession');
    animate();
};