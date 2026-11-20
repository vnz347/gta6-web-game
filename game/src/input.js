// Solmar: keyboard and mouse state. One object, read by the player, the
// vehicle and the menu code; edge-triggered keys (pressed this frame) are
// cleared at the end of each frame by main.js.

export function createInput() {
  const input = {
    keys: new Set(), // codes held down right now
    pressed: new Set(), // codes pressed since the last frame
    mouseDown: false,
    mousePressed: false,
    mouseX: 0,
    mouseY: 0,
    wheel: 0, // mouse wheel delta since the last frame
    anyKey: false, // any key pressed since the last frame
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') event.preventDefault();
    if (!event.repeat) {
      input.pressed.add(event.code);
      input.anyKey = true;
    }
    input.keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.mouseDown = true;
      input.mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouseDown = false;
  });
  window.addEventListener('mousemove', (event) => {
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
  });
  window.addEventListener('wheel', (event) => {
    input.wheel += event.deltaY;
  }, { passive: true });

  return input;
}

/** True while the key is held. */
export function down(input, code) {
  return input.keys.has(code);
}

/** True only on the frame the key went down. */
export function pressed(input, code) {
  return input.pressed.has(code);
}

/** -1/0/1 steering from A/D or the arrow keys. */
export function steerAxis(input) {
  const left = down(input, 'KeyA') || down(input, 'ArrowLeft');
  const right = down(input, 'KeyD') || down(input, 'ArrowRight');
  return (right ? 1 : 0) - (left ? 1 : 0);
}

/** -1/0/1 throttle from W/S or the arrow keys. */
export function throttleAxis(input) {
  const fwd = down(input, 'KeyW') || down(input, 'ArrowUp');
  const back = down(input, 'KeyS') || down(input, 'ArrowDown');
  return (fwd ? 1 : 0) - (back ? 1 : 0);
}

/** Clear the per-frame edges; main.js calls this once per frame. */
export function endFrame(input) {
  input.pressed.clear();
  input.mousePressed = false;
  input.wheel = 0;
  input.anyKey = false;
}
