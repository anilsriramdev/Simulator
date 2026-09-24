/**
 * Newtonian Physics & Celestial Mechanics Engine
 */

// Standard SI Physical Constants
const REAL_G = 6.67430e-11; // N m^2 / kg^2
const AU = 1.495978707e11;  // Astronomical Unit in meters
const M_SUN = 1.989e30;     // Solar Mass in kg
const M_EARTH = 5.972e24;   // Earth Mass in kg
const DAY_SEC = 86400;      // Seconds per day

// Simulation State
const state = {
    running: false,
    timeScale: 1.0,         // Time speed multiplier
    gFactor: 1.0,           // Multiplier for G
    trailMaxLength: 500,    // Points in trajectory tail
    collisionMode: 'merge', // 'merge', 'bounce', or 'ghost'
    showGrid: true,
    showTrails: true,
    showVectors: true,
    elapsedSeconds: 0,
    zoom: 1.0,              // AU visible scale
    panOffset: { x: 0, y: 0 },
    selectedBodyIndex: 1,    // Selected body for inspector & telemetry
    bodies: [],
    isDragging: false,
    dragTarget: null,       
    dragType: null,         // 'body' or 'pan'
    lastMousePos: { x: 0, y: 0 }
};

// Canvas Context
let canvas, ctx;

/**
 * CelestialBody Entity Class
 */
class CelestialBody {
    constructor(name, mass, x, y, vx, vy, color, radius, isFixed = false) {
        this.name = name;
        this.mass = mass;      // kg
        this.x = x;            // meters
        this.y = y;            // meters
        this.vx = vx;          // m/s
        this.vy = vy;          // m/s
        this.ax = 0;           // m/s^2
        this.ay = 0;           // m/s^2
        this.color = color;
        this.radius = radius;  // visual render pixels
        this.isFixed = isFixed;
        this.trail = [];
    }

    getSpeedKmS() {
        return Math.sqrt(this.vx * this.vx + this.vy * this.vy) / 1000;
    }

    getKineticEnergy() {
        const v2 = this.vx * this.vx + this.vy * this.vy;
        return 0.5 * this.mass * v2;
    }
}

/**
 * Preset Configurations
 */
function loadPreset(presetKey) {
    state.bodies = [];
    state.elapsedSeconds = 0;

    if (presetKey === 'sun-earth') {
        state.bodies.push(new CelestialBody('Sun', M_SUN, 0, 0, 0, 0, '#f59e0b', 18, true));
        state.bodies.push(new CelestialBody('Earth', M_EARTH, 1.0 * AU, 0, 0, 29780, '#38bdf8', 8, false));
        state.zoom = 1.25;
        state.selectedBodyIndex = 1;
    } 
    else if (presetKey === 'elliptical') {
        state.bodies.push(new CelestialBody('Sun', M_SUN, 0, 0, 0, 0, '#f59e0b', 18, true));
        state.bodies.push(new CelestialBody('Planet X', M_EARTH, 1.4 * AU, 0, 0, 20000, '#e879f9', 7, false));
        state.zoom = 1.6;
        state.selectedBodyIndex = 1;
    }
    else if (presetKey === 'comet') {
        state.bodies.push(new CelestialBody('Sun', M_SUN, 0, 0, 0, 0, '#f59e0b', 18, true));
        state.bodies.push(new CelestialBody('Comet Halley', 1e16, 2.4 * AU, 0, 0, 11500, '#a7f3d0', 5, false));
        state.zoom = 2.6;
        state.selectedBodyIndex = 1;
    }
    else if (presetKey === 'escape') {
        state.bodies.push(new CelestialBody('Star', M_SUN, 0, 0, 0, 0, '#f59e0b', 18, true));
        state.bodies.push(new CelestialBody('Probe', 1000, 1.0 * AU, 0, 0, 42500, '#f43f5e', 6, false));
        state.zoom = 2.5;
        state.selectedBodyIndex = 1;
    }
    else if (presetKey === 'binary') {
        const dist = 0.7 * AU;
        const v = Math.sqrt((REAL_G * M_SUN) / (4 * dist));
        state.bodies.push(new CelestialBody('Star Alpha', M_SUN, -dist, 0, 0, -v, '#f97316', 14, false));
        state.bodies.push(new CelestialBody('Star Beta', M_SUN, dist, 0, 0, v, '#38bdf8', 14, false));
        state.zoom = 1.5;
        state.selectedBodyIndex = 0;
    }
    else if (presetKey === 'earth-moon') {
        const mMoon = 7.342e22;
        const distMoon = 384400000; // 384,400 km
        const vMoon = 1022; // m/s
        state.bodies.push(new CelestialBody('Earth', M_EARTH, 0, 0, 0, 0, '#38bdf8', 14, true));
        state.bodies.push(new CelestialBody('Moon', mMoon, distMoon, 0, 0, vMoon, '#cbd5e1', 6, false));
        state.zoom = 0.006;
        state.selectedBodyIndex = 1;
    }
    else if (presetKey === 'collision-test') {
        state.bodies.push(new CelestialBody('Sun', M_SUN, 0, 0, 0, 0, '#f59e0b', 18, true));
        state.bodies.push(new CelestialBody('Planet Alpha', M_EARTH * 2, 1.0 * AU, 0, 0, 25000, '#38bdf8', 8, false));
        state.bodies.push(new CelestialBody('Planet Beta', M_EARTH * 2, 1.2 * AU, 0, 0, 20000, '#f43f5e', 8, false));
        state.zoom = 1.5;
        state.selectedBodyIndex = 1;
    }

    state.panOffset = { x: 0, y: 0 };
    updateBodyTabsUI();
    updateInspectorUI();
    updateHUD();
    renderKaTeX();
}

/**
 * Pairwise Accelerations Calculation
 */
function computeAccelerations() {
    const numBodies = state.bodies.length;
    const effectiveG = REAL_G * state.gFactor;

    for (let i = 0; i < numBodies; i++) {
        state.bodies[i].ax = 0;
        state.bodies[i].ay = 0;
    }

    for (let i = 0; i < numBodies; i++) {
        for (let j = i + 1; j < numBodies; j++) {
            const b1 = state.bodies[i];
            const b2 = state.bodies[j];

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            
            // Gravitational Softening to avoid division by zero or infinite acceleration spikes
            const softening = state.collisionMode === 'ghost' ? 1e9 : 1e6;
            const distSq = dx * dx + dy * dy + softening;
            const dist = Math.sqrt(distSq);

            const forceMag = (effectiveG * b1.mass * b2.mass) / distSq;

            const fx = forceMag * (dx / dist);
            const fy = forceMag * (dy / dist);

            if (!b1.isFixed) {
                b1.ax += fx / b1.mass;
                b1.ay += fy / b1.mass;
            }
            if (!b2.isFixed) {
                b2.ax -= fx / b2.mass;
                b2.ay -= fy / b2.mass;
            }
        }
    }
}

/**
 * Handle Physical Planet Collisions
 */
function handleCollisions() {
    if (state.collisionMode === 'ghost') return;

    const scale = (canvas.width / 2) / (state.zoom * AU);

    for (let i = 0; i < state.bodies.length; i++) {
        for (let j = i + 1; j < state.bodies.length; j++) {
            const b1 = state.bodies[i];
            const b2 = state.bodies[j];

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const distMeters = Math.sqrt(dx * dx + dy * dy);

            // Threshold physical / visual radius contact distance
            const visualRadiusMeters = (b1.radius + b2.radius) / scale;
            const collisionDist = Math.max(visualRadiusMeters, 1e8);

            if (distMeters < collisionDist) {
                if (state.collisionMode === 'merge') {
                    // Inelastic Collision: Combine into single mass (Conservation of Momentum)
                    const primary = b1.mass >= b2.mass ? b1 : b2;
                    const secondary = b1.mass >= b2.mass ? b2 : b1;

                    const totalMass = primary.mass + secondary.mass;
                    primary.vx = (primary.mass * primary.vx + secondary.mass * secondary.vx) / totalMass;
                    primary.vy = (primary.mass * primary.vy + secondary.mass * secondary.vy) / totalMass;
                    primary.mass = totalMass;
                    primary.radius = Math.min(30, primary.radius + 2);

                    // Remove secondary body
                    const removeIdx = state.bodies.indexOf(secondary);
                    if (removeIdx > -1) {
                        state.bodies.splice(removeIdx, 1);
                    }
                    if (state.selectedBodyIndex >= state.bodies.length) {
                        state.selectedBodyIndex = 0;
                    }
                    updateBodyTabsUI();
                    updateInspectorUI();
                    return; // Exit loop after array mutation
                }
                else if (state.collisionMode === 'bounce') {
                    // 2D Elastic Impulsive Bounce Response
                    const nx = dx / distMeters;
                    const ny = dy / distMeters;

                    const kx = b1.vx - b2.vx;
                    const ky = b1.vy - b2.vy;
                    const p = 2 * (nx * kx + ny * ky) / (b1.mass + b2.mass);

                    if (!b1.isFixed) {
                        b1.vx -= p * b2.mass * nx;
                        b1.vy -= p * b2.mass * ny;
                    }
                    if (!b2.isFixed) {
                        b2.vx += p * b1.mass * nx;
                        b2.vy += p * b1.mass * ny;
                    }
                }
            }
        }
    }
}

/**
 * Physics Timestep Execution
 */
function physicsStep(dt) {
    const numBodies = state.bodies.length;

    // Step 1: Update positions
    for (let i = 0; i < numBodies; i++) {
        const b = state.bodies[i];
        if (b.isFixed) continue;

        b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
        b.y += b.vy * dt + 0.5 * b.ay * dt * dt;

        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > state.trailMaxLength) {
            b.trail.shift();
        }
    }

    const oldAx = state.bodies.map(b => b.ax);
    const oldAy = state.bodies.map(b => b.ay);

    // Step 2: Compute updated accelerations & collisions
    computeAccelerations();
    handleCollisions();

    // Step 3: Update velocities
    for (let i = 0; i < state.bodies.length; i++) {
        const b = state.bodies[i];
        if (b.isFixed) continue;

        b.vx += 0.5 * ((oldAx[i] || 0) + b.ax) * dt;
        b.vy += 0.5 * ((oldAy[i] || 0) + b.ay) * dt;
    }

    state.elapsedSeconds += dt;
}

/**
 * Coordinates Conversion
 */
function worldToScreen(wx, wy) {
    const scale = (canvas.width / 2) / (state.zoom * AU);
    const sx = canvas.width / 2 + (wx * scale) + state.panOffset.x;
    const sy = canvas.height / 2 - (wy * scale) + state.panOffset.y;
    return { x: sx, y: sy };
}

function screenToWorld(sx, sy) {
    const scale = (canvas.width / 2) / (state.zoom * AU);
    const wx = (sx - canvas.width / 2 - state.panOffset.x) / scale;
    const wy = -(sy - canvas.height / 2 - state.panOffset.y) / scale;
    return { x: wx, y: wy };
}

/**
 * Main Render Frame
 */
function render() {
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.showGrid) drawGrid();
    if (state.showTrails) drawTrails();

    // Render Bodies
    for (let i = 0; i < state.bodies.length; i++) {
        const b = state.bodies[i];
        const pos = worldToScreen(b.x, b.y);

        // Highlight active inspected body
        if (i === state.selectedBodyIndex) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, b.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Celestial Body Glow
        const glow = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, b.radius * 2.5);
        glow.addColorStop(0, b.color);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, b.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Core Sphere
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text Label
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, pos.x, pos.y + b.radius + 14);

        // Velocity & Force Vectors
        if (state.showVectors) {
            drawBodyVectors(b, pos);
        }
    }

    // Distance Line indicator between central body and selected body
    if (state.bodies.length > 1) {
        const refIdx = state.selectedBodyIndex === 0 ? 1 : 0;
        if (state.bodies[refIdx]) {
            drawDistanceRuler(state.bodies[refIdx], state.bodies[state.selectedBodyIndex]);
        }
    }
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    const gridStep = 50;
    const startX = state.panOffset.x % gridStep;
    const startY = state.panOffset.y % gridStep;

    ctx.beginPath();
    for (let x = startX; x < canvas.width; x += gridStep) {
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
    }
    for (let y = startY; y < canvas.height; y += gridStep) {
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // World Axis Crosshair
    const center = worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.beginPath();
    ctx.moveTo(center.x, 0); ctx.lineTo(center.x, canvas.height);
    ctx.moveTo(0, center.y); ctx.lineTo(canvas.width, center.y);
    ctx.stroke();
}

function drawTrails() {
    for (let i = 0; i < state.bodies.length; i++) {
        const b = state.bodies[i];
        if (b.trail.length < 2) continue;

        ctx.beginPath();
        const first = worldToScreen(b.trail[0].x, b.trail[0].y);
        ctx.moveTo(first.x, first.y);

        for (let t = 1; t < b.trail.length; t++) {
            const pt = worldToScreen(b.trail[t].x, b.trail[t].y);
            ctx.lineTo(pt.x, pt.y);
        }

        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

function drawBodyVectors(b, pos) {
    // Velocity Vector (Green)
    const vScale = 0.002;
    const vxEnd = pos.x + b.vx * vScale;
    const vyEnd = pos.y - b.vy * vScale;
    drawArrow(pos.x, pos.y, vxEnd, vyEnd, '#10b981', 'v');

    // Force Vector (Amber)
    const aScale = 5000;
    const axEnd = pos.x + b.ax * aScale;
    const ayEnd = pos.y - b.ay * aScale;
    if (Math.abs(b.ax) + Math.abs(b.ay) > 1e-6) {
        drawArrow(pos.x, pos.y, axEnd, ayEnd, '#f59e0b', 'Fg');
    }
}

function drawArrow(fromX, fromY, toX, toY, color, label) {
    const headlen = 7;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.fill();

    ctx.font = '10px JetBrains Mono';
    ctx.fillText(label, toX + 6, toY + 2);
}

function drawDistanceRuler(b1, b2) {
    const p1 = worldToScreen(b1.x, b1.y);
    const p2 = worldToScreen(b2.x, b2.y);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dist = Math.sqrt((b2.x - b1.x) ** 2 + (b2.y - b1.y) ** 2);
    const distAu = (dist / AU).toFixed(3);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(midX - 25, midY - 9, 50, 16);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.strokeRect(midX - 25, midY - 9, 50, 16);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`${distAu} AU`, midX, midY + 3);
}

/**
 * Update Dynamic HUD Telemetry
 * Handles relative reference body calculation so Sun or central bodies never yield NaN or Infinity
 */
function updateHUD() {
    // Elapsed Time
    const days = Math.floor(state.elapsedSeconds / DAY_SEC);
    const hours = Math.floor((state.elapsedSeconds % DAY_SEC) / 3600);
    document.getElementById('hud-time').innerText = `${days.toString().padStart(3, '0')} Days, ${hours.toString().padStart(2, '0')} Hrs`;

    if (state.bodies.length === 0) return;

    // Target body
    const targetIdx = Math.min(state.selectedBodyIndex, state.bodies.length - 1);
    const targetBody = state.bodies[targetIdx];

    // Reference body: If Sun (body 0) is selected, measure relative to body 1. Otherwise measure relative to body 0.
    let refIdx = 0;
    if (targetIdx === 0 && state.bodies.length > 1) {
        refIdx = 1;
    }
    const refBody = state.bodies[refIdx];

    document.getElementById('hud-target-label').innerHTML = `<i class="fa-solid fa-crosshairs"></i> Telemetry for: <span class="text-white">${targetBody.name}</span> (Relative to ${refBody.name})`;

    // Calculate relative distance r
    const dx = targetBody.x - refBody.x;
    const dy = targetBody.y - refBody.y;
    const distMeters = Math.sqrt(dx * dx + dy * dy);
    const distAu = distMeters / AU;

    // Prevent division by zero
    const effectiveG = REAL_G * state.gFactor;
    
    let force = 0;
    let pe = 0;
    if (distMeters > 0) {
        force = (effectiveG * targetBody.mass * refBody.mass) / (distMeters * distMeters);
        pe = -(effectiveG * targetBody.mass * refBody.mass) / distMeters;
    }

    const ke = targetBody.getKineticEnergy();
    const totalE = ke + pe;

    // Display in HUD safely
    document.getElementById('hud-force').innerText = formatScientific(force) + ' N';
    document.getElementById('hud-dist').innerText = `${distAu.toFixed(3)} AU`;
    document.getElementById('hud-dist-km').innerText = `${(distMeters / 1e9).toFixed(2)} Million km`;
    document.getElementById('hud-ke').innerText = formatScientific(ke) + ' J';
    document.getElementById('hud-pe').innerText = formatScientific(pe) + ' J';
    document.getElementById('hud-te').innerText = formatScientific(totalE) + ' J';
    document.getElementById('disp-zoom').innerText = `${state.zoom.toFixed(2)} AU`;
}

/**
 * Robust Scientific Notation Formatter with NaN / Infinity Guards
 */
function formatScientific(val) {
    if (!isFinite(val) || isNaN(val) || Math.abs(val) === 0) {
        return '0.00';
    }
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const mantissa = val / Math.pow(10, exp);
    return `${mantissa.toFixed(2)} × 10${toSuperscript(exp)}`;
}

function toSuperscript(num) {
    const map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return num.toString().split('').map(c => map[c] || c).join('');
}

/**
 * Render KaTeX Equations Across HTML
 */
function renderKaTeX() {
    if (typeof katex === 'undefined') return;

    document.querySelectorAll('.katex-formula').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) {
            katex.render(formula, el, { throwOnError: false, displayMode: false });
        }
    });

    document.querySelectorAll('.katex-block').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) {
            katex.render(formula, el, { throwOnError: false, displayMode: true });
        }
    });

    document.querySelectorAll('.katex-inline').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) {
            katex.render(formula, el, { throwOnError: false, displayMode: false });
        }
    });
}

/**
 * UI Inspector Synchronizer
 */
function updateBodyTabsUI() {
    const container = document.getElementById('body-tabs-container');
    container.innerHTML = '';

    state.bodies.forEach((b, idx) => {
        const tab = document.createElement('button');
        const isSelected = idx === state.selectedBodyIndex;
        tab.className = `py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
            isSelected ? 'bg-indigo-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
        }`;
        tab.innerHTML = `<span class="w-2 h-2 rounded-full" style="background-color: ${b.color}"></span> ${b.name}`;
        tab.onclick = () => {
            state.selectedBodyIndex = idx;
            updateBodyTabsUI();
            updateInspectorUI();
            updateHUD();
        };
        container.appendChild(tab);
    });

    document.getElementById('body-selector-count').innerText = `${state.bodies.length} Bodies`;
}

function updateInspectorUI() {
    const b = state.bodies[state.selectedBodyIndex];
    if (!b) return;

    document.getElementById('inp-body-name').value = b.name;
    document.getElementById('inp-body-color').value = b.color;
    document.getElementById('disp-mass').innerText = formatScientific(b.mass);
    document.getElementById('slider-mass').value = Math.log10(b.mass);

    document.getElementById('disp-vel-mag').innerText = `${b.getSpeedKmS().toFixed(2)} km/s`;
    document.getElementById('inp-vx').value = (b.vx / 1000).toFixed(2);
    document.getElementById('inp-vy').value = (b.vy / 1000).toFixed(2);

    document.getElementById('inp-px').value = (b.x / AU).toFixed(2);
    document.getElementById('inp-py').value = (b.y / AU).toFixed(2);
    document.getElementById('chk-fixed').checked = b.isFixed;
}

/**
 * Setup Event Handlers
 */
function setupEventListeners() {
    window.addEventListener('resize', resizeCanvas);

    // Simulation Play/Pause & Reset
    const btnPlay = document.getElementById('btn-play');
    btnPlay.onclick = () => {
        state.running = !state.running;
        btnPlay.className = state.running
            ? 'bg-amber-600 hover:bg-amber-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm';
        btnPlay.innerHTML = state.running
            ? '<i class="fa-solid fa-pause"></i> <span>Pause</span>'
            : '<i class="fa-solid fa-play"></i> <span>Start</span>';
    };

    document.getElementById('btn-step').onclick = () => {
        state.running = false;
        physicsStep(DAY_SEC * 0.5);
        updateHUD();
        render();
    };

    document.getElementById('btn-reset').onclick = () => {
        const presetKey = document.getElementById('preset-select').value;
        loadPreset(presetKey);
    };

    document.getElementById('preset-select').onchange = (e) => {
        loadPreset(e.target.value);
    };

    // Display Toggle Buttons
    document.getElementById('toggle-grid').onclick = (e) => {
        state.showGrid = !state.showGrid;
        e.currentTarget.classList.toggle('opacity-50', !state.showGrid);
    };
    document.getElementById('toggle-trails').onclick = (e) => {
        state.showTrails = !state.showTrails;
        e.currentTarget.classList.toggle('opacity-50', !state.showTrails);
    };
    document.getElementById('toggle-vectors').onclick = (e) => {
        state.showVectors = !state.showVectors;
        e.currentTarget.classList.toggle('opacity-50', !state.showVectors);
    };

    // Collision Mode Selector
    const colSelect = document.getElementById('select-collision-mode');
    colSelect.onchange = (e) => {
        state.collisionMode = e.target.value;
        const labelMap = { 'merge': 'Inelastic Merge', 'bounce': 'Elastic Bounce', 'ghost': 'Ghost Pass-Through' };
        document.getElementById('lbl-collision-mode').innerText = labelMap[state.collisionMode];
    };

    // Inspector Controls
    document.getElementById('inp-body-name').oninput = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].name = e.target.value;
            updateBodyTabsUI();
            updateHUD();
        }
    };
    document.getElementById('inp-body-color').oninput = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].color = e.target.value;
            updateBodyTabsUI();
        }
    };
    document.getElementById('slider-mass').oninput = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            const mass = Math.pow(10, parseFloat(e.target.value));
            state.bodies[state.selectedBodyIndex].mass = mass;
            document.getElementById('disp-mass').innerText = formatScientific(mass);
            updateHUD();
        }
    };
    document.getElementById('inp-vx').onchange = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].vx = parseFloat(e.target.value) * 1000;
            updateInspectorUI();
        }
    };
    document.getElementById('inp-vy').onchange = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].vy = parseFloat(e.target.value) * 1000;
            updateInspectorUI();
        }
    };
    document.getElementById('inp-px').onchange = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].x = parseFloat(e.target.value) * AU;
            updateHUD();
        }
    };
    document.getElementById('inp-py').onchange = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].y = parseFloat(e.target.value) * AU;
            updateHUD();
        }
    };
    document.getElementById('chk-fixed').onchange = (e) => {
        if (state.bodies[state.selectedBodyIndex]) {
            state.bodies[state.selectedBodyIndex].isFixed = e.target.checked;
        }
    };

    // Global Sliders
    document.getElementById('slider-time-warp').oninput = (e) => {
        state.timeScale = parseFloat(e.target.value);
        document.getElementById('disp-time-warp').innerText = `${state.timeScale.toFixed(1)}x`;
    };
    document.getElementById('slider-trail-length').oninput = (e) => {
        state.trailMaxLength = parseInt(e.target.value);
        document.getElementById('disp-trail-length').innerText = `${state.trailMaxLength} pts`;
    };
    document.getElementById('slider-g-factor').oninput = (e) => {
        state.gFactor = parseFloat(e.target.value);
        document.getElementById('disp-g-factor').innerText = `${state.gFactor.toFixed(1)}x G₀`;
    };

    // Zoom Handlers
    document.getElementById('btn-zoom-in').onclick = () => { state.zoom = Math.max(0.001, state.zoom * 0.8); updateHUD(); };
    document.getElementById('btn-zoom-out').onclick = () => { state.zoom = state.zoom * 1.25; updateHUD(); };
    document.getElementById('btn-recenter').onclick = () => { state.panOffset = { x: 0, y: 0 }; };

    // Canvas Mouse Interaction (Panning & Dragging)
    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        for (let i = 0; i < state.bodies.length; i++) {
            const b = state.bodies[i];
            const pos = worldToScreen(b.x, b.y);
            const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);

            if (dist <= b.radius + 6) {
                state.selectedBodyIndex = i;
                state.isDragging = true;
                state.dragTarget = b;
                state.dragType = 'body';
                updateBodyTabsUI();
                updateInspectorUI();
                updateHUD();
                return;
            }
        }

        state.isDragging = true;
        state.dragType = 'pan';
        state.lastMousePos = { x: e.clientX, y: e.clientY };
    };

    canvas.onmousemove = (e) => {
        if (!state.isDragging) return;

        if (state.dragType === 'pan') {
            const dx = e.clientX - state.lastMousePos.x;
            const dy = e.clientY - state.lastMousePos.y;
            state.panOffset.x += dx;
            state.panOffset.y += dy;
            state.lastMousePos = { x: e.clientX, y: e.clientY };
        } else if (state.dragType === 'body' && state.dragTarget) {
            const rect = canvas.getBoundingClientRect();
            const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            state.dragTarget.x = worldPos.x;
            state.dragTarget.y = worldPos.y;
            state.dragTarget.trail = [];
            updateInspectorUI();
            updateHUD();
        }
    };

    window.onmouseup = () => {
        state.isDragging = false;
        state.dragTarget = null;
    };

    canvas.onwheel = (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        state.zoom = Math.max(0.001, state.zoom * zoomFactor);
        updateHUD();
    };

    // Modal Handlers
    const quizModal = document.getElementById('quiz-modal');
    document.getElementById('btn-quiz-modal').onclick = () => {
        quizModal.classList.remove('hidden');
        renderKaTeX();
    };
    document.getElementById('btn-close-quiz').onclick = () => quizModal.classList.add('hidden');

    // Interactive Velocity Calculator
    const calcR = document.getElementById('calc-r');
    const calcM = document.getElementById('calc-m');
    const updateCalcResults = () => {
        const r = parseFloat(calcR.value) * AU;
        const m = parseFloat(calcM.value) * M_SUN;
        const v = Math.sqrt((REAL_G * m) / r) / 1000;
        const vesc = Math.sqrt((2 * REAL_G * m) / r) / 1000;

        document.getElementById('calc-result-v').innerText = `${v.toFixed(2)} km/s`;
        document.getElementById('calc-result-vesc').innerText = `${vesc.toFixed(2)} km/s`;
    };
    calcR.oninput = updateCalcResults;
    calcM.oninput = updateCalcResults;

    document.getElementById('btn-apply-calc').onclick = () => {
        const rAu = parseFloat(calcR.value);
        const v = Math.sqrt((REAL_G * (parseFloat(calcM.value) * M_SUN)) / (rAu * AU));
        
        if (state.bodies.length > 1) {
            state.bodies[1].x = rAu * AU;
            state.bodies[1].y = 0;
            state.bodies[1].vx = 0;
            state.bodies[1].vy = v;
            state.bodies[1].trail = [];
        }
        
        quizModal.classList.add('hidden');
        updateInspectorUI();
        updateHUD();
    };
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

/**
 * Main Animation Loop
 */
function animate() {
    if (state.running) {
        const subSteps = 8;
        const dt = (DAY_SEC * 0.25 * state.timeScale) / subSteps;
        for (let i = 0; i < subSteps; i++) {
            physicsStep(dt);
        }
        updateHUD();
    }

    render();
    requestAnimationFrame(animate);
}

// Window OnLoad Initializer
window.onload = () => {
    canvas = document.getElementById('sim-canvas');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    setupEventListeners();
    loadPreset('sun-earth');
    animate();
};