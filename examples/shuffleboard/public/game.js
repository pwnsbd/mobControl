import { PhoneController } from '/__phone/controller.js';

const lane = document.querySelector('#lane');
const drawing = lane.getContext('2d');
const play = document.querySelector('#play');
const status = document.querySelector('#status');
const score = document.querySelector('#score');
const connection = document.querySelector('#connection');
const connect = document.querySelector('#connect');
const qr = document.querySelector('#qr');
const radius = 15;
const board = { left: 24, right: lane.width - 24, top: 10, bottom: lane.height - 10, pushLine: 425 };
const zones = [
  { top: board.top, bottom: 130, points: 3 },
  { top: 130, bottom: 205, points: 2 },
  { top: 205, bottom: 280, points: 1 }
];
const start = { x: lane.width / 2, y: 520 };
const puck = { ...start, vx: 0, vy: 0 };
let state = 'ready';
let stroke = null;
let moving = false;
let phoneInUse = false;
let pointer = null;

const pad = new PhoneController({
  orientation: 'portrait',
  controls: [
    { id: 'lane', type: 'drag', label: 'Push upward' },
    { id: 'play-pause', type: 'button', label: 'Play/Pause', shape: 'rounded-rect', x: 0.5, y: 0.14 }
  ]
});

connect.addEventListener('click', () => {
  qr.hidden = false;
  connection.textContent = pad.reachability.ok ? 'Scan to use your phone.' : pad.reachability.message;
  pad.mountQR(qr);
});
pad.on('pair', () => {
  qr.hidden = true;
  connection.textContent = 'Phone connected. Tap Play/Pause to play.';
});
pad.on('unpair', phoneInterrupted);
pad.on('suspend', phoneInterrupted);
pad.on('resume', () => {
  connection.textContent = 'Phone available. Tap Play/Pause when ready.';
});
pad.on('press', ({ id }) => {
  if (id === 'play-pause' && pad.connected && pad.watching) {
    phoneInUse = true;
    playPause();
  }
});
pad.on('dragstart', ({ id, position }) => {
  if (id === 'lane' && beginStroke('phone', position)) phoneInUse = true;
});
pad.on('dragmove', ({ id, position, velocity }) => {
  if (id === 'lane') push('phone', position, velocity);
});
pad.on('dragend', ({ id }) => { if (id === 'lane') endStroke('phone'); });
pad.on('dragcancel', ({ id }) => { if (id === 'lane') cancelStroke('phone'); });

play.addEventListener('click', () => {
  phoneInUse = false;
  playPause();
});

function phoneInterrupted() {
  cancelStroke('phone');
  if (phoneInUse && state === 'playing') {
    playPause();
    status.textContent = 'Phone input paused. Resume when you are ready.';
  }
  connection.textContent = 'Phone unavailable. Reopen the controller or scan again.';
}

function playPause() {
  if (state === 'playing') {
    if (stroke) cancelStroke(stroke.source);
    state = 'paused';
    play.textContent = 'Resume';
    status.textContent = 'Paused.';
    return;
  }
  if (state === 'ready' || state === 'finished') {
    resetPuck();
    score.value = '—';
  }
  state = 'playing';
  play.textContent = 'Pause';
  status.textContent = moving ? 'The puck is gliding.' : 'Line up the puck, then push it across the dashed line.';
}

function resetPuck() {
  Object.assign(puck, start, { vx: 0, vy: 0 });
  moving = false;
}

function beginStroke(source, position) {
  if (state !== 'playing' || stroke || moving) return false;
  stroke = { source, position, origin: { x: puck.x, y: puck.y }, peak: 0 };
  return true;
}

function push(source, position, velocity) {
  if (state !== 'playing' || stroke?.source !== source) return;
  const dx = position.x - stroke.position.x;
  const dy = position.y - stroke.position.y;
  stroke.position = position;
  puck.x = clamp(puck.x + dx * lane.width, board.left + radius, board.right - radius);
  puck.y = clamp(puck.y + dy * lane.height, board.pushLine, board.bottom - radius);

  // A pull-back repositions the puck and clears the previous push.
  if (dy > 0) {
    stroke.peak = 0;
    puck.vx = 0;
    puck.vy = 0;
  } else if (dy < 0 && velocity.y < 0) {
    const forward = -velocity.y;
    const speed = Math.min(1100, forward * 100);
    if (speed >= stroke.peak) {
      stroke.peak = speed;
      puck.vy = -speed;
      puck.vx = clamp(velocity.x / forward, -0.6, 0.6) * speed;
    }
  }

  if (puck.y === board.pushLine && puck.vy < 0) endStroke(source);
  else status.textContent = 'Line up the puck, then push across the dashed line.';
}

function endStroke(source) {
  if (stroke?.source !== source) return;
  stroke = null;
  moving = puck.vy < 0;
  status.textContent = moving ? 'The puck is gliding.' : 'Puck lined up. Push forward when ready.';
}

function cancelStroke(source) {
  if (stroke?.source !== source) return;
  Object.assign(puck, stroke.origin, { vx: 0, vy: 0 });
  stroke = null;
  moving = false;
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A desktop player can use the board as a touch surface too.
const boardPosition = (event, box) => ({
  x: (event.clientX - box.left) / box.width,
  y: (event.clientY - box.top) / box.height
});
lane.addEventListener('pointerdown', (event) => {
  if (!beginStroke('board', boardPosition(event, lane.getBoundingClientRect()))) return;
  phoneInUse = false;
  pointer = event;
  lane.setPointerCapture(event.pointerId);
});
lane.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer?.pointerId) return;
  const seconds = (event.timeStamp - pointer.timeStamp) / 1000;
  if (seconds > 0) {
    const box = lane.getBoundingClientRect();
    const scale = Math.min(box.width, box.height) * seconds;
    push('board', boardPosition(event, box), {
      x: (event.clientX - pointer.clientX) / scale,
      y: (event.clientY - pointer.clientY) / scale
    });
  }
  pointer = event;
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  lane.addEventListener(eventName, (event) => {
    if (event.pointerId !== pointer?.pointerId) return;
    pointer = null;
    if (event.type === 'pointerup') endStroke('board');
    else cancelStroke('board');
  });
}

function update(seconds) {
  if (state !== 'playing' || !moving || stroke) return;
  puck.x += puck.vx * seconds;
  puck.y += puck.vy * seconds;
  if (puck.x < board.left || puck.x > board.right || puck.y < board.top) {
    finish(0, puck.y < board.top ? 'Too far. The puck slid off the end.' : 'Gutter. Try a straighter push.');
    return;
  }
  const speed = Math.hypot(puck.vx, puck.vy);
  const remaining = speed ? Math.max(0, 1 - 730 * seconds / speed) : 0;
  puck.vx *= remaining;
  puck.vy *= remaining;
  if (!remaining) {
    const trailingEdge = puck.y + radius;
    const points = zones.find(({ top, bottom }) => trailingEdge >= top && trailingEdge < bottom)?.points ?? 0;
    finish(points, points ? `Scored ${points}.` : 'Short of the scoring zones.');
  }
}

function finish(points, message) {
  state = 'finished';
  stroke = null;
  score.value = String(points);
  play.textContent = 'Play again';
  status.textContent = message;
}

function draw() {
  drawing.fillStyle = '#171717';
  drawing.fillRect(0, 0, lane.width, lane.height);
  drawing.fillStyle = '#303030';
  drawing.fillRect(board.left, board.top, board.right - board.left, board.bottom - board.top);
  drawing.font = 'bold 24px system-ui';
  drawing.textAlign = 'center';
  for (const { top, bottom, points } of zones) {
    drawing.fillStyle = points === 2 ? '#444' : '#383838';
    drawing.fillRect(board.left, top, board.right - board.left, bottom - top);
    drawing.strokeStyle = '#888';
    drawing.strokeRect(board.left, top, board.right - board.left, bottom - top);
    drawing.fillStyle = '#eee';
    drawing.fillText(points, start.x, (top + bottom) / 2 + 8);
  }
  drawing.save();
  drawing.setLineDash([8, 6]);
  drawing.strokeStyle = '#aaa';
  drawing.beginPath();
  drawing.moveTo(board.left, board.pushLine);
  drawing.lineTo(board.right, board.pushLine);
  drawing.stroke();
  drawing.restore();
  drawing.fillStyle = '#aaa';
  drawing.font = '12px system-ui';
  drawing.fillText('PUSH LINE', start.x, board.pushLine + 20);

  const finish = drawing.createRadialGradient(puck.x - 4, puck.y - 5, 2, puck.x, puck.y, radius);
  finish.addColorStop(0, '#f5f5f5');
  finish.addColorStop(1, '#8e8e8e');
  drawing.fillStyle = finish;
  drawing.beginPath();
  drawing.arc(puck.x, puck.y, radius, 0, 2 * Math.PI);
  drawing.fill();
  drawing.strokeStyle = '#fff';
  drawing.stroke();
}

let lastFrame = 0;
function frame(time) {
  if (lastFrame) update(Math.min((time - lastFrame) / 1000, 0.03));
  lastFrame = time;
  draw();
  requestAnimationFrame(frame);
}
draw();
requestAnimationFrame(frame);
