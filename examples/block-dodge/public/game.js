const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const timeLabel = document.querySelector('#time');
const scoreLabel = document.querySelector('#score');
const overlay = document.querySelector('#overlay');
const message = document.querySelector('#message');
const detail = document.querySelector('#detail');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const announcement = document.querySelector('#announcement');
const connectPhoneButton = document.querySelector('#connect-phone');
const usePhoneButton = document.querySelector('#use-phone');
const keyboardButton = document.querySelector('#use-keyboard');
const phoneStatus = document.querySelector('#phone-status');
const qr = document.querySelector('#qr');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const DURATION = 30;
const player = { x: WIDTH / 2 - 22, y: HEIGHT - 66, w: 44, h: 24, speed: 390 };
let blocks = [];
let keys = new Set();
let state = 'ready';
let elapsed = 0;
let score = 0;
let spawnClock = 0;
let previousFrame = 0;
let animationFrame;
let pad;
let steeringMode = 'keyboard';
let recoveringPhone = false;
let phoneX = 0;
const phoneReady = () => Boolean(pad?.connected && pad.watching);

function setState(next) {
  state = next;
  const visible = next === 'ready' || next === 'paused' || next === 'won' || next === 'lost';
  overlay.hidden = !visible;
  pauseButton.disabled = next !== 'playing';
  keyboardButton.hidden = next !== 'paused' || !recoveringPhone;
  if (next !== 'playing') keys.clear();
  if (next === 'ready') {
    message.textContent = 'Ready?';
    detail.textContent = 'Use the left and right arrow keys to dodge the falling blocks. Survive for 30 seconds.';
    startButton.textContent = 'Start game';
  } else if (next === 'paused') {
    message.textContent = 'Paused';
    detail.textContent = `You have ${Math.max(0, DURATION - elapsed).toFixed(1)} seconds left. Resume when you are ready.`;
    if (recoveringPhone) {
      message.textContent = 'Phone connection paused this round';
      startButton.textContent = phoneReady() ? 'Resume with phone' : 'Reconnect phone';
    } else {
      startButton.textContent = 'Resume';
    }
  } else if (next === 'won') {
    message.textContent = 'You made it!';
    detail.textContent = `You dodged ${score} ${score === 1 ? 'block' : 'blocks'}. Ready for another round?`;
    startButton.textContent = 'Play again';
  } else if (next === 'lost') {
    message.textContent = 'Ouch!';
    detail.textContent = `A block got you after ${elapsed.toFixed(1)} seconds. Give it another try?`;
    startButton.textContent = 'Try again';
  }
}

function resetGame() {
  elapsed = 0;
  score = 0;
  spawnClock = 0;
  blocks = [];
  player.x = WIDTH / 2 - player.w / 2;
  updateLabels();
  setState('playing');
  announcement.textContent = 'Game started.';
}

function togglePause() {
  if (state === 'playing') {
    phoneX = 0;
    setState('paused');
    announcement.textContent = 'Game paused.';
  } else if (state === 'paused' && !recoveringPhone) {
    setState('playing');
    announcement.textContent = 'Game resumed.';
  }
}

function updateLabels() {
  timeLabel.textContent = Math.max(0, DURATION - elapsed).toFixed(1);
  scoreLabel.textContent = String(score);
}

function spawnBlock() {
  const size = 24 + Math.random() * 25;
  blocks.push({ x: Math.random() * (WIDTH - size), y: -size, w: size, h: size, speed: 155 + Math.random() * 100 + elapsed * 2.2 });
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update(dt) {
  const keyboardX = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  player.x += (steeringMode === 'phone' ? phoneX : keyboardX) * player.speed * dt;
  player.x = Math.max(12, Math.min(WIDTH - player.w - 12, player.x));

  elapsed = Math.min(DURATION, elapsed + dt);
  spawnClock += dt;
  const spawnEvery = Math.max(0.34, 0.82 - elapsed * 0.012);
  while (spawnClock >= spawnEvery) {
    spawnClock -= spawnEvery;
    spawnBlock();
  }

  for (const block of blocks) {
    block.y += block.speed * dt;
    if (overlaps(player, block)) {
      elapsed = Math.min(DURATION, elapsed);
      updateLabels();
      setState('lost');
      announcement.textContent = 'You were hit by a block.';
      return;
    }
  }
  const before = blocks.length;
  blocks = blocks.filter(block => block.y < HEIGHT);
  score += before - blocks.length;
  updateLabels();
  if (elapsed >= DURATION) {
    setState('won');
    announcement.textContent = `You won, dodging ${score} blocks.`;
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#1c2a3c';
  ctx.lineWidth = 1;
  for (let x = 40; x < WIDTH; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }
  for (let y = 40; y < HEIGHT; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  ctx.fillStyle = '#f89b56';
  for (const block of blocks) {
    ctx.fillRect(block.x, block.y, block.w, block.h);
    ctx.fillStyle = '#ffc08e'; ctx.fillRect(block.x + 5, block.y + 5, Math.max(0, block.w - 10), 3); ctx.fillStyle = '#f89b56';
  }
  ctx.fillStyle = '#62e6bc';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = '#c0ffeb';
  ctx.fillRect(player.x + 7, player.y + 6, player.w - 14, 4);
}

function frame(timestamp) {
  const dt = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0;
  previousFrame = timestamp;
  if (state === 'playing') update(dt);
  draw();
  animationFrame = requestAnimationFrame(frame);
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    if (state === 'playing' && steeringMode === 'keyboard') keys.add(event.key);
  }
});
document.addEventListener('keyup', event => keys.delete(event.key));
window.addEventListener('blur', () => keys.clear());
startButton.addEventListener('click', () => {
  if (recoveringPhone) {
    if (phoneReady()) usePhoneSteering();
    else showPairing();
  } else if (state === 'paused') togglePause();
  else resetGame();
});
pauseButton.addEventListener('click', togglePause);

connectPhoneButton.addEventListener('click', showPairing);
async function showPairing() {
  if (connectPhoneButton.disabled) return;
  connectPhoneButton.disabled = true;
  try {
    if (!pad) {
      const { PhoneController } = await import('/__phone/controller.js');
      pad = new PhoneController({
        controls: [
          { id: 'move', type: 'stick', label: 'Move', side: 'left' },
          { id: 'play-pause', type: 'button', label: 'Play/Pause', shape: 'rounded-rect',
            x: 0.5, y: 0.14 }
        ],
        orientation: 'landscape'
      });
      pad.on('input', () => {
        if (state === 'playing' && steeringMode === 'phone' && phoneReady()) phoneX = pad.stick.move.x;
      });
      pad.on('press', ({ id }) => {
        if (id !== 'play-pause' || steeringMode !== 'phone' || !phoneReady()) return;
        if (recoveringPhone) usePhoneSteering();
        else if (state === 'playing' || state === 'paused') togglePause();
        else resetGame();
      });
      pad.on('pair', phoneReturned);
      pad.on('resume', phoneReturned);
      pad.on('unpair', phoneInterrupted);
      pad.on('suspend', phoneInterrupted);
    }
    if (phoneReady()) return phoneReturned();
    qr.hidden = false;
    phoneStatus.textContent = recoveringPhone
      ? 'Open the controller on your phone again, or scan to reconnect.'
      : 'Scan to pair. Keyboard steering stays active until you choose the phone.';
    if (!pad.reachability.ok) phoneStatus.textContent += ` ${pad.reachability.message}`;
    await pad.mountQR(qr);
  } catch {
    phoneStatus.textContent = 'Phone controls could not load. Keep playing with the keyboard.';
    qr.hidden = true;
  } finally {
    connectPhoneButton.disabled = false;
  }
}

function phoneInterrupted() {
  phoneX = 0;
  usePhoneButton.hidden = true;
  if (steeringMode === 'phone' && (state === 'playing' || state === 'paused')) {
    recoveringPhone = true;
    setState('paused');
    phoneStatus.textContent = 'Reconnect the phone or continue with the keyboard.';
  } else {
    steeringMode = 'keyboard';
    phoneStatus.textContent = 'Phone unavailable. Keyboard steering is ready.';
  }
}

function phoneReturned() {
  if (!phoneReady()) return;
  qr.hidden = true;
  usePhoneButton.hidden = recoveringPhone || steeringMode === 'phone';
  if (recoveringPhone) setState('paused');
  phoneStatus.textContent = recoveringPhone
    ? 'Phone connected. Choose how to resume.'
    : steeringMode === 'phone' ? 'Phone steering is active.' : 'Phone connected. Choose Use phone steering when ready.';
}

function usePhoneSteering() {
  if (!phoneReady()) return;
  steeringMode = 'phone';
  recoveringPhone = false;
  phoneX = 0;
  keys.clear();
  usePhoneButton.hidden = true;
  if (state === 'paused') setState('playing');
  phoneStatus.textContent = 'Phone steering is active.';
  announcement.textContent = 'Phone steering selected.';
}

usePhoneButton.addEventListener('click', usePhoneSteering);
keyboardButton.addEventListener('click', () => {
  steeringMode = 'keyboard';
  recoveringPhone = false;
  phoneX = 0;
  keys.clear();
  qr.hidden = true;
  usePhoneButton.hidden = !phoneReady();
  if (state === 'paused') setState('playing');
  phoneStatus.textContent = 'Keyboard steering is active.';
});

setState('ready');
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(frame);
