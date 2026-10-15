/**
 * Quantum Wave Packet & Double-Slit Engine (TDSE FDTD Solver)
 * Dynamic Physics Architecture
 */

const NX = 160; // Grid width
const NY = 160; // Grid height

const state = {
    running: false,
    simSpeed: 2.0,
    momentumKx: 4.5,
    potentialV0: 3.0,
    drawTool: 'wall',      // 'wall' or 'eraser'
    viewMode: 'prob',      // 'prob' or 'phase'
    isDrawing: false,
    norm: 1.0,
    expX: 0,
    transmission: 0,
    reflection: 100,
    uncertainty: 0.5
};

// Wavefunction grids and Potential grid V
let psiReal = new Float32Array(NX * NY);
let psiImag = new Float32Array(NX * NY);
let V = new Float32Array(NX * NY);

let canvas, ctx;

/**
 * Initialize grids and presets properly with solid barrier widths
 */
function loadPreset(presetKey) {
    state.running = false;
    const playLbl = document.getElementById('lbl-play');
    if (playLbl) playLbl.innerText = 'Start';

    // Clear grids
    psiReal.fill(0);
    psiImag.fill(0);
    V.fill(0);

    const cx = Math.floor(NX * 0.25);
    const cy = Math.floor(NY * 0.5);
    const sigma = 9.0;
    const kx = state.momentumKx;

    // Initialize Gaussian Wave Packet
    let normSum = 0;
    for (let x = 0; x < NX; x++) {
        for (let y = 0; y < NY; y++) {
            const idx = x + y * NX;
            const dx = x - cx;
            const dy = y - cy;
            const envelope = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            psiReal[idx] = envelope * Math.cos(kx * dx);
            psiImag[idx] = envelope * Math.sin(kx * dx);
            normSum += psiReal[idx] * psiReal[idx] + psiImag[idx] * psiImag[idx];
        }
    }

    // Normalize wavefunction
    const normFactor = Math.sqrt(normSum);
    for (let i = 0; i < NX * NY; i++) {
        psiReal[i] /= (normFactor || 1);
        psiImag[i] /= (normFactor || 1);
    }

    // Build Preset Potentials with solid 3-pixel thickness barriers
    const startX = Math.floor(NX * 0.55);
    const barrierWidth = 3;
    const potVal = state.potentialV0 * 5.0;

    switch (presetKey) {
        case 'double-slit': {
            for (let bx = 0; bx < barrierWidth; bx++) {
                const x = startX + bx;
                for (let y = 0; y < NY; y++) {
                    // Slits located at specific vertical intervals
                    const isSlit1 = (y >= Math.floor(NY * 0.36) && y <= Math.floor(NY * 0.42));
                    const isSlit2 = (y >= Math.floor(NY * 0.58) && y <= Math.floor(NY * 0.64));
                    if (!isSlit1 && !isSlit2) {
                        V[x + y * NX] = potVal;
                    }
                }
            }
            break;
        }
        case 'barrier': {
            for (let bx = 0; bx < barrierWidth; bx++) {
                const x = startX + bx;
                for (let y = Math.floor(NY * 0.25); y < Math.floor(NY * 0.75); y++) {
                    V[x + y * NX] = potVal;
                }
            }
            break;
        }
        case 'step': {
            for (let x = startX; x < NX; x++) {
                for (let y = 0; y < NY; y++) {
                    V[x + y * NX] = potVal * 0.7;
                }
            }
            break;
        }
        case 'corral': {
            for (let x = Math.floor(NX * 0.3); x < Math.floor(NX * 0.7); x++) {
                for (let b = 0; b < 2; b++) {
                    V[x + (Math.floor(NY * 0.25) + b) * NX] = potVal;
                    V[x + (Math.floor(NY * 0.75) + b) * NX] = potVal;
                }
            }
            for (let y = Math.floor(NY * 0.25); y <= Math.floor(NY * 0.75); y++) {
                for (let b = 0; b < 2; b++) {
                    V[(Math.floor(NX * 0.3) + b) + y * NX] = potVal;
                    V[(Math.floor(NX * 0.7) + b) + y * NX] = potVal;
                }
            }
            break;
        }
        case 'free':
            // No potential barrier
            break;
    }
}

/**
 * FDTD Time Step Solver for TDSE
 */
function physicsStep() {
    const dt = 0.20;
    const c1 = 0.5;

    // Update Imaginary part from Real part
    for (let x = 1; x < NX - 1; x++) {
        for (let y = 1; y < NY - 1; y++) {
            const idx = x + y * NX;
            const laplacianReal = psiReal[idx + 1] + psiReal[idx - 1] + psiReal[idx + NX] + psiReal[idx - NX] - 4 * psiReal[idx];
            psiImag[idx] += dt * (-c1 * laplacianReal + V[idx] * psiReal[idx]);
        }
    }

    // Update Real part from Imaginary part
    for (let x = 1; x < NX - 1; x++) {
        for (let y = 1; y < NY - 1; y++) {
            const idx = x + y * NX;
            const laplacianImag = psiImag[idx + 1] + psiImag[idx - 1] + psiImag[idx + NX] + psiImag[idx - NX] - 4 * psiImag[idx];
            psiReal[idx] -= dt * (-c1 * laplacianImag + V[idx] * psiImag[idx]);
        }
    }

    // Compute Norm and Telemetry
    let totalNorm = 0;
    let sumX = 0;
    let transmittedSum = 0;
    let reflectedSum = 0;
    const barrierX = Math.floor(NX * 0.55);

    for (let x = 0; x < NX; x++) {
        for (let y = 0; y < NY; y++) {
            const idx = x + y * NX;
            const prob = psiReal[idx] * psiReal[idx] + psiImag[idx] * psiImag[idx];
            totalNorm += prob;
            sumX += x * prob;

            if (x > barrierX) transmittedSum += prob;
            else reflectedSum += prob;
        }
    }

    state.norm = totalNorm;
    state.expX = (sumX / (totalNorm || 1)) / NX * 10 - 5;
    state.transmission = (transmittedSum / (totalNorm || 1)) * 100;
    state.reflection = (reflectedSum / (totalNorm || 1)) * 100;
}

/**
 * Render Grid to Canvas
 */
function render() {
    if (!canvas || !ctx) return;
    const imgData = ctx.createImageData(NX, NY);
    const data = imgData.data;

    for (let x = 0; x < NX; x++) {
        for (let y = 0; y < NY; y++) {
            const idx = x + y * NX;
            const pIdx = (x + y * NX) * 4;

            if (V[idx] > 0.1) {
                // Potential Wall (Amber/Gold)
                data[pIdx] = 245;
                data[pIdx + 1] = 158;
                data[pIdx + 2] = 11;
                data[pIdx + 3] = 255;
            } else {
                const r = psiReal[idx];
                const i = psiImag[idx];
                const prob = r * r + i * i;

                if (state.viewMode === 'prob') {
                    const intensity = Math.min(255, Math.floor(prob * 700));
                    data[pIdx] = Math.floor(intensity * 0.2);
                    data[pIdx + 1] = Math.floor(intensity * 0.8);
                    data[pIdx + 2] = intensity;
                    data[pIdx + 3] = 255;
                } else {
                    const phase = Math.atan2(i, r);
                    const normPhase = (phase + Math.PI) / (2 * Math.PI);
                    data[pIdx] = Math.floor(255 * Math.sin(normPhase * Math.PI));
                    data[pIdx + 1] = Math.floor(255 * Math.cos(normPhase * Math.PI));
                    data[pIdx + 2] = 200;
                    data[pIdx + 3] = Math.min(255, Math.floor(prob * 900));
                }
            }
        }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = NX;
    tempCanvas.height = NY;
    tempCanvas.getContext('2d').putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
}

function updateUI() {
    const elNorm = document.getElementById('disp-norm');
    if (elNorm) elNorm.innerText = state.norm.toFixed(4);

    const elExpX = document.getElementById('hud-exp-x');
    if (elExpX) elExpX.innerText = `${state.expX.toFixed(2)} nm`;

    const elTrans = document.getElementById('hud-transmission');
    if (elTrans) elTrans.innerText = `${state.transmission.toFixed(1)}%`;

    const elRefl = document.getElementById('hud-reflection');
    if (elRefl) elRefl.innerText = `${state.reflection.toFixed(1)}%`;
}

/**
 * Handle user drawing/erasing potentials on canvas
 */
function handleCanvasDraw(e) {
    if (!state.isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    if (clientX === undefined) return;

    const x = Math.floor(((clientX - rect.left) / rect.width) * NX);
    const y = Math.floor(((clientY - rect.top) / rect.height) * NY);

    const brushSize = 3;
    const potVal = state.potentialV0 * 5.0;
    for (let dx = -brushSize; dx <= brushSize; dx++) {
        for (let dy = -brushSize; dy <= brushSize; dy++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < NX && ny >= 0 && ny < NY) {
                const idx = nx + ny * NX;
                V[idx] = (state.drawTool === 'wall') ? potVal : 0;
            }
        }
    }
}

/**
 * Setup Event Listeners for controls and synchronization between top & mobile selectors
 */
function setupEventListeners() {
    window.addEventListener('resize', () => {
        if (!canvas) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });

    canvas.addEventListener('pointerdown', (e) => {
        state.isDrawing = true;
        handleCanvasDraw(e);
    });
    canvas.addEventListener('pointermove', handleCanvasDraw);
    window.addEventListener('pointerup', () => state.isDrawing = false);

    document.getElementById('btn-play').onclick = () => {
        state.running = !state.running;
        document.getElementById('lbl-play').innerText = state.running ? 'Pause' : 'Start';
    };

    document.getElementById('btn-reset').onclick = () => {
        const desktopSelect = document.getElementById('preset-select');
        loadPreset(desktopSelect ? desktopSelect.value : 'double-slit');
    };

    // Preset selection synchronization
    const handlePresetChange = (val) => {
        const desktopSelect = document.getElementById('preset-select');
        const mobileSelect = document.getElementById('preset-select-mobile');
        if (desktopSelect) desktopSelect.value = val;
        if (mobileSelect) mobileSelect.value = val;
        loadPreset(val);
    };

    const presetSelect = document.getElementById('preset-select');
    const presetSelectMobile = document.getElementById('preset-select-mobile');
    if (presetSelect) presetSelect.onchange = (e) => handlePresetChange(e.target.value);
    if (presetSelectMobile) presetSelectMobile.onchange = (e) => handlePresetChange(e.target.value);

    // Sliders
    document.getElementById('slider-sim-speed').oninput = (e) => {
        state.simSpeed = parseFloat(e.target.value);
        document.getElementById('disp-sim-speed').innerText = `${state.simSpeed.toFixed(1)}x`;
    };

    document.getElementById('slider-momentum').oninput = (e) => {
        state.momentumKx = parseFloat(e.target.value);
        document.getElementById('disp-momentum').innerText = state.momentumKx.toFixed(2);
        const currentPreset = document.getElementById('preset-select').value;
        loadPreset(currentPreset);
    };

    document.getElementById('slider-potential').oninput = (e) => {
        state.potentialV0 = parseFloat(e.target.value);
        document.getElementById('disp-potential').innerText = `${state.potentialV0.toFixed(2)} eV`;
        const currentPreset = document.getElementById('preset-select').value;
        if (currentPreset !== 'free') loadPreset(currentPreset);
    };

    // Draw tools
    document.getElementById('btn-tool-wall').onclick = () => {
        state.drawTool = 'wall';
        document.getElementById('btn-tool-wall').className = "py-1.5 rounded-lg bg-sky-600 text-white font-semibold text-xs border border-sky-500/50 flex items-center justify-center gap-1.5 cursor-pointer";
        document.getElementById('btn-tool-eraser').className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer";
    };

    document.getElementById('btn-tool-eraser').onclick = () => {
        state.drawTool = 'eraser';
        document.getElementById('btn-tool-eraser').className = "py-1.5 rounded-lg bg-sky-600 text-white font-semibold text-xs border border-sky-500/50 flex items-center justify-center gap-1.5 cursor-pointer";
        document.getElementById('btn-tool-wall').className = "py-1.5 rounded-lg bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer";
    };

    document.getElementById('btn-clear-potentials').onclick = () => {
        V.fill(0);
    };

    // View modes
    document.getElementById('btn-view-prob').onclick = () => {
        state.viewMode = 'prob';
        document.getElementById('btn-view-prob').className = "py-1.5 rounded-lg font-semibold bg-sky-600 text-white border border-sky-500/40 cursor-pointer";
        document.getElementById('btn-view-phase').className = "py-1.5 rounded-lg font-semibold bg-slate-800 text-slate-400 border border-slate-700 cursor-pointer";
    };

    document.getElementById('btn-view-phase').onclick = () => {
        state.viewMode = 'phase';
        document.getElementById('btn-view-phase').className = "py-1.5 rounded-lg font-semibold bg-sky-600 text-white border border-sky-500/40 cursor-pointer";
        document.getElementById('btn-view-prob').className = "py-1.5 rounded-lg font-semibold bg-slate-800 text-slate-400 border border-slate-700 cursor-pointer";
    };

    // Modals
    const mathModal = document.getElementById('math-modal');
    document.getElementById('btn-math-modal').onclick = () => {
        mathModal.classList.remove('hidden');
        renderKaTeX();
    };
    document.getElementById('btn-close-math').onclick = () => mathModal.classList.add('hidden');

    const seoModal = document.getElementById('modal-seo-guide');
    document.getElementById('btn-open-seo').onclick = () => {
        seoModal.classList.remove('hidden');
        renderKaTeX();
    };
    document.getElementById('btn-close-seo').onclick = () => seoModal.classList.add('hidden');

    // Sidebar & Telemetry toggles for mobile
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const sidebarPanel = document.getElementById('sidebar-panel');
    if (btnToggleSidebar) btnToggleSidebar.onclick = () => sidebarPanel.classList.toggle('-translate-x-full');
    if (btnCloseSidebar) btnCloseSidebar.onclick = () => sidebarPanel.classList.add('-translate-x-full');

    const telemetryPanel = document.getElementById('telemetry-panel');
    const toggleTelemetryBtn = document.getElementById('btn-toggle-telemetry');
    const closeTelemetryBtn = document.getElementById('btn-close-telemetry');
    if (toggleTelemetryBtn) toggleTelemetryBtn.onclick = () => telemetryPanel.classList.toggle('translate-y-[120%]');
    if (closeTelemetryBtn) closeTelemetryBtn.onclick = () => telemetryPanel.classList.add('translate-y-[120%]');
}

function renderKaTeX() {
    if (typeof katex === 'undefined') return;
    document.querySelectorAll('.katex-block').forEach(el => {
        const formula = el.getAttribute('data-formula');
        if (formula) katex.render(formula, el, { throwOnError: false, displayMode: true });
    });
}

/**
 * Main Animation Loop
 */
function animate() {
    if (state.running) {
        const steps = Math.floor(state.simSpeed * 4);
        for (let i = 0; i < steps; i++) {
            physicsStep();
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
    loadPreset('double-slit');
    animate();
};