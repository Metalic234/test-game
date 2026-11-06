import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

function resize() {
  const pad = 0;
  const availW = window.innerWidth - pad;
  const availH = window.innerHeight - pad;
  let scale = Math.min(availW / 480, availH / 270);
  if (scale >= 1) scale = Math.floor(scale);
  canvas.style.width = `${Math.round(480 * scale)}px`;
  canvas.style.height = `${Math.round(270 * scale)}px`;
}

window.addEventListener('resize', resize);
resize();
game.start();

// exposed for debugging and for curious players who like to poke at the world
window.__game = game;

// Keep the keyboard focused on the page (some embeds swallow keys otherwise).
window.addEventListener('click', () => window.focus());
