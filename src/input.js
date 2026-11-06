// Keyboard input mapped to game actions, with edge-triggered presses.

const MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  Space: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyE: 'interact',
  Enter: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
  KeyR: 'restart',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyJ: 'dash',
  KeyX: 'shard',
  KeyC: 'laser',
};

const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export class Input {
  constructor(target = window) {
    this.downSet = new Set();
    this.pressedSet = new Set();
    this.anyPress = false;
    this.anyPressAt = 0;

    target.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code)) e.preventDefault();
      const action = MAP[e.code];
      this.anyPress = true;
      this.anyPressAt = performance.now();
      if (!action) return;
      if (!e.repeat) this.pressedSet.add(action);
      this.downSet.add(action);
    });

    target.addEventListener('keyup', (e) => {
      const action = MAP[e.code];
      if (action) this.downSet.delete(action);
    });

    window.addEventListener('blur', () => {
      this.downSet.clear();
    });
  }

  down(action) {
    return this.downSet.has(action);
  }

  pressed(action) {
    return this.pressedSet.has(action);
  }

  consume(action) {
    const had = this.pressedSet.has(action);
    this.pressedSet.delete(action);
    return had;
  }

  consumeAny() {
    const had = this.anyPress;
    this.anyPress = false;
    return had;
  }

  endFrame() {
    this.pressedSet.clear();
    this.anyPress = false;
  }
}
