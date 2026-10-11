// The band of light that turns round the Home balance card and round the logo
// on the lock and welcome screens (`edge-turn` in Popup.scss).
//
// A CSS animation starts when its element is drawn, so every time a screen was
// opened again the light began from the top: it jumped after a send, after a
// tab change, after unlocking. Here its position comes from the clock instead.
// An element put in phase starts where the light would be had it never
// stopped, so the card and the ring agree with each other and with themselves
// across any number of remounts.
//
// Checked in utils/pillar-mode-test.js.

// One turn, the duration `edge-turn` is given in the stylesheet.
const period = 12000;
// The ring round the logo: its two lights repeat every 36 s (`ring-green`,
// `ring-blue`), three turns each.
const ringPeriod = 36000;

const phaseAt = (now, length = period) => ((now % length) + length) % length;

// Ref callbacks: `<section className="balance-card" ref={inPhase}>`.
const inPhase = (element) => {
  if (element) element.style.animationDelay = `${-phaseAt(performance.now())}ms`;
};

const ringInPhase = (element) => {
  if (element) element.style.animationDelay = `${-phaseAt(performance.now(), ringPeriod)}ms`;
};

// How far ahead of the clock the light is, `progress` (0 to 1) of the way
// through one extra turn. It eases out of the clock's pace and back into it,
// so the extra turn has no start or stop to see, and ends a whole turn on:
// in phase again.
const extraTurn = (progress) => {
  const p = Math.min(1, Math.max(0, progress));
  return period * (1 - Math.cos(Math.PI * p)) / 2;
};

const lights = ['edge-turn', 'ring-green', 'ring-blue'];

const turning = (element) =>
  (element?.getAnimations?.() || []).filter((animation) => lights.includes(animation.animationName));

// One extra turn in `duration` ms, from wherever the lights are. Every light
// on the element is moved on by the same time, so two lights keep the gap
// they had. (12 s of the ring's 36 s is one turn at its average pace.)
const spinOnce = (element, duration) => {
  const animations = turning(element);
  if (!animations.length || typeof requestAnimationFrame !== 'function') return;
  const started = performance.now();
  const from = animations.map((animation) => Number(animation.currentTime) || 0);
  const step = (now) => {
    const elapsed = now - started;
    const ahead = elapsed + extraTurn(elapsed / duration);
    animations.forEach((animation, index) => { animation.currentTime = from[index] + ahead; });
    if (elapsed < duration && element.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

export { period, ringPeriod, phaseAt, inPhase, ringInPhase, extraTurn, spinOnce };
