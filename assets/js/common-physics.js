// GLOBAL PHYSICS CONSTANTS
const G = 6.67430e-11;      // Gravitational constant N m^2 kg^-2
const AU = 1.496e11;         // Astronomical Unit in meters
const M_SUN = 1.989e30;      // Solar mass in kg
const M_EARTH = 5.972e24;    // Earth mass in kg
const DAY_SEC = 86400;

// SCIENTIFIC NOTATION FORMATTER
function formatSci(val, unit = '') {
  if (!isFinite(val) || isNaN(val)) return `0.00 ${unit}`;
  if (Math.abs(val) === 0) return `0.00 ${unit}`;
  
  if (Math.abs(val) >= 1e6 || Math.abs(val) < 1e-3) {
    let exp = Math.floor(Math.log10(Math.abs(val)));
    let mantissa = val / Math.pow(10, exp);
    return `${mantissa.toFixed(2)} × 10${superscript(exp)} ${unit}`;
  }
  return `${val.toFixed(2)} ${unit}`;
}

function superscript(num) {
  const map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(num).split('').map(c => map[c] || c).join('');
}

// KATEX AUTO-RENDER HELPER
function renderMath() {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
}