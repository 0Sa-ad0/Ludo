/**
 * The player colours must stay tellable apart — for normal vision AND for the
 * most common colour blindness (deuteranopia). Measured in OKLab, where
 * distance tracks how different two colours actually look.
 *
 * REGRESSION: Neon Yellow and Acid Green measured 0.05 apart for a
 * colour-blind player (near-identical), and Pink/Orange 0.16 for everyone.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/lib/constants.ts'), 'utf8');
const block = src.slice(src.indexOf('PLAYER_COLORS: PlayerColor[] = ['), src.indexOf('];', src.indexOf('PLAYER_COLORS')));
const palette = [...block.matchAll(/name:\s*'([^']+)',\s*hex:\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => [m[1], m[2]]);

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function oklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// Machado et al. 2009, deuteranopia at full severity, in linear RGB.
function deutan(rgb) {
  const [r, g, b] = rgb.map(toLin);
  return [0.367322 * r + 0.860646 * g - 0.227968 * b,
          0.280085 * r + 0.672501 * g + 0.047413 * b,
         -0.011820 * r + 0.042940 * g + 0.968881 * b]
    .map((c) => Math.min(1, Math.max(0, c)))
    .map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const pairs = [];
for (let i = 0; i < palette.length; i++) {
  for (let j = i + 1; j < palette.length; j++) pairs.push([palette[i], palette[j]]);
}

test('the palette was actually parsed', () => {
  expect(palette).toHaveLength(6);
});

test.each(pairs.map(([a, b]) => [a[0], b[0], a[1], b[1]]))(
  '%s vs %s look clearly different', (_n1, _n2, h1, h2) => {
    expect(dist(oklab(hexRgb(h1)), oklab(hexRgb(h2)))).toBeGreaterThanOrEqual(0.19);
    expect(dist(oklab(deutan(hexRgb(h1))), oklab(deutan(hexRgb(h2))))).toBeGreaterThanOrEqual(0.14);
  },
);
