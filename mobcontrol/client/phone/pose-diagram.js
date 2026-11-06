// A drawing of how to hold the phone. A picture beats a sentence here, and a
// wrong grip is the single most likely reason the controls feel wrong.
//
// Pure: takes a mount, returns SVG markup. No document access.

const CANVAS = { width: 170, height: 104 };
const LANDSCAPE = { width: 104, height: 58 };
const PORTRAIT = { width: 58, height: 92 };
const INSET = 4;
const NOSE = 11;

/**
 * @param {{nose:'left'|'right'|'away'|'near'}} mount
 * @param {{arrow?:boolean}} [options] draw the "tilt to your right" hint
 */
export function render(mount, { arrow = false } = {}) {
  const sideways = mount.nose === 'left' || mount.nose === 'right';
  const { width, height } = sideways ? LANDSCAPE : PORTRAIT;
  const x = (CANVAS.width - width) / 2;
  const y = (CANVAS.height - height) / 2 - 4;
  const strip = noseStrip(mount.nose, { x, y, width, height });

  return `
    <defs>
      <linearGradient id="poseScreen" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#1D3B34"/>
        <stop offset="100%" stop-color="#102220"/>
      </linearGradient>
    </defs>
    <rect class="body" x="${x}" y="${y}" width="${width}" height="${height}" rx="11"/>
    <rect class="screen" x="${x + INSET}" y="${y + INSET}"
          width="${width - INSET * 2}" height="${height - INSET * 2}" rx="7"/>
    <rect class="nose" x="${strip.x}" y="${strip.y}"
          width="${strip.width}" height="${strip.height}" rx="4"/>
    ${arrow ? tiltArrow(x + width, y + height / 2) : ''}
    <text class="label" x="${CANVAS.width / 2}" y="${CANVAS.height - 4}">
      ${arrow ? 'TILT RIGHT EDGE DOWN' : 'NOSE &#183; SCREEN UP'}
    </text>`;
}

function noseStrip(side, { x, y, width, height }) {
  const along = { width: width - INSET * 2, height: NOSE };
  const across = { width: NOSE, height: height - INSET * 2 };
  switch (side) {
    case 'left': return { x: x + INSET, y: y + INSET, ...across };
    case 'right': return { x: x + width - INSET - NOSE, y: y + INSET, ...across };
    case 'away': return { x: x + INSET, y: y + INSET, ...along };
    default: return { x: x + INSET, y: y + height - INSET - NOSE, ...along };
  }
}

/** A curved arrow sweeping down on the right-hand side. */
function tiltArrow(x, y) {
  const sx = x + 9, sy = y - 16, ex = x + 17, ey = y + 14;
  return `
    <path class="arrow" d="M ${sx} ${sy} Q ${ex + 9} ${y} ${ex} ${ey}"/>
    <path class="arrow-head" d="M ${ex} ${ey + 5} l -5 -8 l 10 0 z"/>`;
}
