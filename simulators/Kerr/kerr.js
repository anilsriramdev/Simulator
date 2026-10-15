/**
 * Kerr Rotating Black Hole Physics Engine
 * Implements Boyer-Lindquist geodetic motion, Lense-Thirring frame-dragging, 
 * and dynamic spacetime spiral vortex visualization.
 */

const C = 299792458;
const G = 6.67430e-11;
const M_SOLAR = 1.989e30;

const state = {
    running: false,
    massSolar: 10,
    spinA: 0.80,           // Dimensionless spin a* (0 to 0.99)
    particleType: 'massive',
    initialSpeedC: 0.35,
    launchAngleDeg: 90,
    simSpeed: 1.0,
    showErgosphere: true,
    showVectors: true,
    zoom: 1.0,
    panOffset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    particle: null,
    trail: [],
    timeCounter: 0
};

let canvas, ctx;

function getKerrParameters() {
    const M = state.massSolar * M_SOLAR;
    const rM = (G * M) / (C * C); // Geometrical mass scale
    const a = state.spinA * rM;   // Spin length scale
    const rPlus = rM + Math.sqrt(Math.max(0, rM * rM - a * a)); // Outer event horizon
    const rErgo = rM + Math.sqrt(Math.max(0, rM * rM - a * a * 0)); // Outer ergosphere boundary at equator
    return { M, rM, a, rPlus, rErgo };
}

class KerrParticle {
    constructor(r, phi, vr, vphi) {
        this.r = r;
        this.phi = phi;
        this.vr = vr;
        this.vphi = vphi;
    }
    get Cartesian() {
        return {
            x: this.r * Math.cos(this.phi),
            y: this.r * Math.sin(this.phi)
        };
    }
}

function renderKaTeX() {
    if (typeof katex === 'undefined') return;
    document.querySelectorAll('.katex-block').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) katex.render(formula, el, { throwOnError: false, displayMode: true });
    });
    document.querySelectorAll('.katex-inline').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) katex.render(formula, el, { throwOnError: false, displayMode: false });
    });
}

function updateParticleFromSliders() {
    if (!state.particle) return;
    const r = state.particle.r;
    const vTotal = state.initialSpeedC * C;
    const psiRad = (state.launchAngleDeg * Math.PI) / 180;
    
    state.particle.vr = vTotal * Math.cos(psiRad);
    state.particle.vphi = r > 0 ? (vTotal * Math.sin(psiRad)) / r : 0;
    state.trail = [];
}

function loadPreset(presetKey) {
    state.trail = [];
    state.running = false;
    const kp = getKerrParameters();

    const playLbl = document.getElementById('lbl-play');
    if (playLbl) playLbl.innerText = 'Start';

    switch (presetKey) {
        case 'prograde': {
            state.spinA = 0.90;
            state.particleType = 'massive';
            state.launchAngleDeg = 90;
            const rStart = 5.0 * kp.rM;
            // Prograde: co-rotating with positive angular velocity matching the frame-dragging swirl
            const vProg = Math.sqrt((G * kp.M) / rStart) + (state.spinA * kp.rM * C) / Math.pow(rStart, 1.5);
            state.initialSpeedC = vProg / C;
            state.particle = new KerrParticle(rStart, 0, 0, vProg / rStart); // Positive vphi
            state.zoom = 1.1;
            break;
        }
        case 'retrograde': {
            state.spinA = 0.90;
            state.particleType = 'massive';
            state.launchAngleDeg = 90;
            const rStart = 7.5 * kp.rM;
            // Retrograde: counter-rotating against the spin with negative angular velocity
            const vRetro = Math.sqrt((G * kp.M) / rStart) - (state.spinA * kp.rM * C) / Math.pow(rStart, 1.5);
            state.initialSpeedC = Math.abs(vRetro) / C;
            state.particle = new KerrParticle(rStart, 0, 0, -Math.abs(vRetro) / rStart); // Negative vphi
            state.zoom = 0.9;
            break;
        }
        case 'ergosphere-plunge': {
            state.spinA = 0.95;
            state.particleType = 'massive';
            state.launchAngleDeg = 45;
            state.initialSpeedC = 0.35;
            state.particle = new KerrParticle(3.5 * kp.rM, Math.PI / 4, -0.05 * C, 0.3 / kp.rM);
            state.zoom = 1.2;
            break;
        }
        case 'lens-effect': {
            state.spinA = 0.85;
            state.particleType = 'photon';
            state.launchAngleDeg = 0;
            state.initialSpeedC = 1.0;
            const b = 2.5 * kp.rM;
            const startR = 12.0 * kp.rM;
            const vr = -C * Math.sqrt(Math.max(0, 1 - Math.pow(b / startR, 2)));
            const vphi = (C * b) / Math.pow(startR, 2);
            state.particle = new KerrParticle(startR, Math.PI / 3, vr, vphi);
            state.zoom = 0.55;
            break;
        }
    }
    state.panOffset = { x: 0, y: 0 };
    syncControls();
    renderKaTeX();
}

function physicsStep(dt) {
    if (!state.particle) return;
    const kp = getKerrParameters();
    const p = state.particle;

    if (p.r <= kp.rPlus) {
        state.running = false;
        return;
    }

    const derivatives = (r, vr, vphi) => {
        const a = kp.a;
        const denom = Math.pow(r*r + a*a, 2) - a*a * (r*r - 2*kp.rM*r);
        const omega = denom > 0 ? (2 * kp.rM * a * r) / denom : 0;
        
        let ar, aphi;
        if (state.particleType === 'photon') {
            ar = r * vphi * vphi - ((kp.rM * C * C) / Math.max(r * r, kp.rPlus * kp.rPlus)) + (2 * a * omega * C * vphi);
            aphi = r !== 0 ? (-2 * vr * vphi) / r + omega * 0.1 : 0;
        } else {
            const gravitationalPull = (kp.rM * C * C) / Math.max(r * r, kp.rPlus * kp.rPlus);
            ar = r * vphi * vphi - gravitationalPull + (2 * a * omega * C * vphi);
            aphi = r !== 0 ? (-2 * vr * vphi) / r : 0;
        }

        return { vr, vphi, ar, aphi };
    };

    const k1 = derivatives(p.r, p.vr, p.vphi);
    const k2 = derivatives(p.r + 0.5 * dt * k1.vr, p.vr + 0.5 * dt * k1.ar, p.vphi + 0.5 * dt * k1.aphi);
    const k3 = derivatives(p.r + 0.5 * dt * k2.vr, p.vr + 0.5 * dt * k2.ar, p.vphi + 0.5 * dt * k2.aphi);
    const k4 = derivatives(p.r + dt * k3.vr, p.vr + dt * k3.ar, p.vphi + dt * k3.aphi);

    p.r += (dt / 6) * (k1.vr + 2 * k2.vr + 2 * k3.vr + k4.vr);
    p.phi += (dt / 6) * (k1.vphi + 2 * k2.vphi + 2 * k3.vphi + k4.vphi);
    p.vr += (dt / 6) * (k1.ar + 2 * k2.ar + 2 * k3.ar + k4.ar);
    p.vphi += (dt / 6) * (k1.aphi + 2 * k2.aphi + 2 * k3.aphi + k4.aphi);

    const pos = p.Cartesian;
    state.trail.push({ x: pos.x, y: pos.y });
    if (state.trail.length > 2000) state.trail.shift();
}

function render() {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const kp = getKerrParameters();
    const center = { x: canvas.width / 2 + state.panOffset.x, y: canvas.height / 2 + state.panOffset.y };
    const scale = (Math.min(canvas.width, canvas.height) / 25 / kp.rM) * state.zoom;

    // --- Dynamic Rotating Spacetime Spiral Grid (Aligned with Prograde) ---
    ctx.lineWidth = 0.8;
    const swirlTime = state.timeCounter;

    for (let arm = 0; arm < 8; arm++) {
        ctx.beginPath();
        const armAngleOffset = (arm / 8) * Math.PI * 2;
        const steps = 50;
        for (let i = 0; i <= steps; i++) {
            const rVal = 1.8 + (i / steps) * 7.5;
            const rDist = rVal * kp.rM * scale;
            
            // Flipped sign (+) so background grid rotates co-directional with prograde spin
            const twist = armAngleOffset + (swirlTime * state.spinA * 0.8) + (2.5 * state.spinA / (rVal * rVal));
            
            const x = center.x + rDist * Math.cos(twist);
            const y = center.y + rDist * Math.sin(twist) * 0.85;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.stroke();
    }

    // Concentric Reference Rings
    for (let rMult = 2.5; rMult < 9; rMult += 2.0) {
        const radius = rMult * kp.rM * scale;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.12)';
        ctx.stroke();
    }

    // Draw Ergosphere Overlay
    if (state.showErgosphere) {
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, kp.rErgo * scale, kp.rErgo * 0.85 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(236, 72, 153, 0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw Outer Event Horizon
    ctx.beginPath();
    ctx.arc(center.x, center.y, kp.rPlus * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Trajectory Trail
    if (state.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(center.x + state.trail[0].x * scale, center.y - state.trail[0].y * scale);
        for (let i = 1; i < state.trail.length; i++) {
            ctx.lineTo(center.x + state.trail[i].x * scale, center.y - state.trail[i].y * scale);
        }
        ctx.strokeStyle = state.particleType === 'photon' ? '#f59e0b' : '#ec4899';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Particle
    if (state.particle) {
        const pos = state.particle.Cartesian;
        ctx.beginPath();
        ctx.arc(center.x + pos.x * scale, center.y - pos.y * scale, 6, 0, Math.PI * 2);
        ctx.fillStyle = state.particleType === 'photon' ? '#f59e0b' : '#ec4899';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function syncControls() {
    const sliderSimSpeed = document.getElementById('slider-sim-speed');
    if (sliderSimSpeed) {
        sliderSimSpeed.value = state.simSpeed;
        document.getElementById('disp-sim-speed').innerText = `${state.simSpeed.toFixed(1)}x`;
    }

    const sliderSpin = document.getElementById('slider-spin');
    if (sliderSpin) sliderSpin.value = state.spinA;
    document.getElementById('disp-spin').innerText = state.spinA.toFixed(2);

    const sliderMass = document.getElementById('slider-mass');
    if (sliderMass) sliderMass.value = state.massSolar;
    document.getElementById('disp-mass').innerText = `${state.massSolar} M☉`;

    const sliderSpeed = document.getElementById('slider-speed');
    if (sliderSpeed) sliderSpeed.value = state.initialSpeedC;
    document.getElementById('disp-speed').innerText = `${state.initialSpeedC.toFixed(2)} c`;

    const sliderAngle = document.getElementById('slider-angle');
    if (sliderAngle) sliderAngle.value = state.launchAngleDeg;
    document.getElementById('disp-angle').innerText = `${state.launchAngleDeg.toFixed(1)}°`;

    const btnMassive = document.getElementById('btn-type-massive');
    const btnPhoton = document.getElementById('btn-type-photon');
    if (btnMassive && btnPhoton) {
        if (state.particleType === 'massive') {
            btnMassive.className = "py-1.5 rounded-lg bg-pink-600 text-white font-semibold text-xs border border-pink-500/50";
            btnPhoton.className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700";
        } else {
            btnPhoton.className = "py-1.5 rounded-lg bg-pink-600 text-white font-semibold text-xs border border-pink-500/50";
            btnMassive.className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700";
        }
    }

    const kp = getKerrParameters();
    document.getElementById('disp-rplus').innerText = `${(kp.rPlus / 1000).toFixed(1)} km`;
    document.getElementById('disp-rergo').innerText = `${(kp.rErgo / 1000).toFixed(1)} km`;

    if (state.particle) {
        document.getElementById('hud-r').innerText = `${(state.particle.r / kp.rM).toFixed(2)} M`;
        const r = state.particle.r;
        const a = kp.a;
        const denom = Math.pow(r*r + a*a, 2) - a*a * (r*r - 2*kp.rM*r);
        const omega = denom > 0 ? (2 * kp.rM * a * r) / denom : 0;
        document.getElementById('hud-omega').innerText = `${omega.toExponential(2)} rad/s`;

        const isInsideErgo = r <= kp.rErgo;
        const isInsideHorizon = r <= kp.rPlus;
        const statusEl = document.getElementById('hud-ergo-status');
        if (isInsideHorizon) {
            statusEl.innerText = 'Inside Horizon';
            statusEl.className = 'mono text-sm font-bold text-rose-500';
        } else if (isInsideErgo) {
            statusEl.innerText = 'Inside Ergosphere';
            statusEl.className = 'mono text-sm font-bold text-amber-400';
        } else {
            statusEl.innerText = 'Outside';
            statusEl.className = 'mono text-sm font-bold text-sky-400';
        }
    }
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });

    // Canvas Drag & Pan Handlers
    canvas.addEventListener('mousedown', (e) => {
        state.isDragging = true;
        state.dragStart = { x: e.clientX - state.panOffset.x, y: e.clientY - state.panOffset.y };
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging) return;
        state.panOffset.x = e.clientX - state.dragStart.x;
        state.panOffset.y = e.clientY - state.dragStart.y;
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
    });

    // Mouse Wheel Zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        if (e.deltaY < 0) {
            state.zoom *= zoomFactor;
        } else {
            state.zoom /= zoomFactor;
        }
        state.zoom = Math.max(0.2, Math.min(10.0, state.zoom));
    }, { passive: false });

    // UI Zoom Button Handlers
    document.getElementById('btn-zoom-in').onclick = () => {
        state.zoom = Math.min(10.0, state.zoom * 1.2);
    };
    document.getElementById('btn-zoom-out').onclick = () => {
        state.zoom = Math.max(0.2, state.zoom / 1.2);
    };
    document.getElementById('btn-recenter').onclick = () => {
        state.zoom = 1.0;
        state.panOffset = { x: 0, y: 0 };
    };

    document.getElementById('slider-sim-speed').oninput = (e) => {
        state.simSpeed = parseFloat(e.target.value);
        document.getElementById('disp-sim-speed').innerText = `${state.simSpeed.toFixed(1)}x`;
    };

    document.getElementById('slider-spin').oninput = (e) => {
        state.spinA = parseFloat(e.target.value);
        syncControls();
    };
    document.getElementById('slider-mass').oninput = (e) => {
        state.massSolar = parseFloat(e.target.value);
        syncControls();
    };

    document.getElementById('slider-speed').oninput = (e) => {
        state.initialSpeedC = parseFloat(e.target.value);
        document.getElementById('disp-speed').innerText = `${state.initialSpeedC.toFixed(2)} c`;
        updateParticleFromSliders();
    };

    document.getElementById('slider-angle').oninput = (e) => {
        state.launchAngleDeg = parseFloat(e.target.value);
        document.getElementById('disp-angle').innerText = `${state.launchAngleDeg.toFixed(1)}°`;
        updateParticleFromSliders();
    };

    document.getElementById('btn-type-massive').onclick = () => {
        state.particleType = 'massive';
        syncControls();
    };

    document.getElementById('btn-type-photon').onclick = () => {
        state.particleType = 'photon';
        syncControls();
    };

    // Overlay Toggle Listeners
    const btnToggleErgo = document.getElementById('toggle-ergo');
    if (btnToggleErgo) {
        btnToggleErgo.onclick = () => {
            state.showErgosphere = !state.showErgosphere;
            btnToggleErgo.classList.toggle('bg-pink-600/30', state.showErgosphere);
            btnToggleErgo.classList.toggle('bg-slate-800', !state.showErgosphere);
        };
    }

    const btnToggleVectors = document.getElementById('toggle-vectors');
    if (btnToggleVectors) {
        btnToggleVectors.onclick = () => {
            state.showVectors = !state.showVectors;
            btnToggleVectors.classList.toggle('bg-pink-600/30', state.showVectors);
            btnToggleVectors.classList.toggle('bg-slate-800', !state.showVectors);
        };
    }

    document.getElementById('btn-play').onclick = () => {
        state.running = !state.running;
        document.getElementById('lbl-play').innerText = state.running ? 'Pause' : 'Start';
    };
    document.getElementById('btn-reset').onclick = () => loadPreset(document.getElementById('preset-select').value);
    document.getElementById('preset-select').onchange = (e) => loadPreset(e.target.value);

    const mathModal = document.getElementById('math-modal');
    document.getElementById('btn-math-modal').onclick = () => {
        mathModal.classList.remove('hidden');
        renderKaTeX();
    };
    document.getElementById('btn-close-math').onclick = () => mathModal.classList.add('hidden');
}

function animate() {
    if (state.running) {
        const kp = getKerrParameters();
        const dt = (kp.rM / C) * 0.05 * state.simSpeed;
        for (let i = 0; i < 5; i++) {
            physicsStep(dt);
        }
        syncControls();
    }
    state.timeCounter += 0.015 * state.simSpeed;
    render();
    requestAnimationFrame(animate);
}

window.onload = () => {
    canvas = document.getElementById('sim-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    setupEventListeners();
    loadPreset('prograde');
    renderKaTeX();
    animate();
};