#!/usr/bin/env node
// Prints the generated keyframes for Popup.scss: the light on the Home balance
// card's edge, and the two lights on the ring round the logo.
//
//   node tools/pillar/edge-turn-keyframes.js
//
// CSS has no sine in an animation, so each curve is written out as short
// straight steps. utils/pillar-mode-test.js recomputes them from the numbers
// here and checks the stylesheet carries them exactly.
//
// The card (`edge-turn`, one turn in 12 s):
//   angle(p) = 360·p + swing·sin(4π·p)
// It runs between about 0.4 and 1.6 times its average pace and never
// backwards, and ends a turn at the pace it began, so the loop has no seam.
//
// The ring (`ring-green` and `ring-blue`, three turns each in 36 s). The two
// lights start half a turn apart and lean opposite ways:
//   green(p) = 1080·p − lean·sin(2π·p)
//   blue(p)  = 1080·p + 180 + lean·sin(2π·p)
// so the gap between them swings from 180° down to 30° one way, back through
// 180°, and down to 30° the other way: the blue light runs the green one
// down, falls back, and is run down in its turn. Each keeps moving forward
// throughout, between about 0.55 and 1.45 times the average pace.
const steps = 48;
const swing = 17;
const angle = (p) => 360 * p + swing * Math.sin(4 * Math.PI * p);

const ring = { steps: 72, turns: 3, seconds: 36, lean: 75 };
const green = (p) => 360 * ring.turns * p - ring.lean * Math.sin(2 * Math.PI * p);
const blue = (p) => 360 * ring.turns * p + 180 + ring.lean * Math.sin(2 * Math.PI * p);

const keyframes = (name, property, curve, count, from) => {
  const lines = [`@keyframes ${name} {`];
  for (let step = from; step <= count; step += 1) {
    const percent = Number(((step / count) * 100).toFixed(4));
    lines.push(`  ${percent}% { ${property}: ${Number(curve(step / count).toFixed(2))}deg; }`);
  }
  lines.push('}');
  return lines.join('\n');
};

// The card's property starts at its registered 0deg, so its first step is
// left out; the ring's are written from 0% because blue does not start at 0.
const css = keyframes('edge-turn', '--edge-angle', angle, steps, 1);
const ringCss = `${keyframes('ring-green', '--ring-green-at', green, ring.steps, 0)}\n\n${keyframes('ring-blue', '--ring-blue-at', blue, ring.steps, 0)}`;

if (require.main === module) console.log(`${css}\n\n${ringCss}`);
module.exports = { steps, swing, angle, css, ring, green, blue, ringCss };
