// Builds the Calico app icon SVG sources and renders them to assets/ with rsvg-convert.
// Run from anywhere: node design/icons/build-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '../../assets');
const svgDir = join(here, 'svg');
mkdirSync(svgDir, { recursive: true });

const C = { terra: '#C95F37', rust: '#9B3F22', sand: '#E1CEB1', center: '#EFE2CF', paper: '#FFFFFF' };

// Shell petals from assets/icon.svg (same data as src/brand.tsx), in a 32×32 box.
const PETALS = [
  [0, 15.235, 14.317, 13.783, 186.36, 179.4, 'terra', 'M10.86 0c-7.02 7.26002-10.86 16.68002-10.86 27.78 0 13.56003 6.96 27.96002 17.4 36.42001 43.02 32.22 120.24 78.06003 168.96 115.19998-27.72-56.63995-125.94-142.19998-175.5-179.39999z'],
  [0.433, 9.777, 14.276, 19.217, 185.82, 250.14, 'terra', 'M34.91999 0c-20.52 2.34-34.91999 18.89999-34.91999 39.89999 0 7.79999 1.92 15.17999 5.28 20.76 55.86 46.2 150.66 135.47999 180.54001 189.47999-10.20001-65.94-109.86-201.95999-150.90002-250.13998z'],
  [3.439, 5.974, 11.731, 23.039, 152.7, 299.88, 'rust', 'M49.13999 0.23999c-1.61999-0.17999-3.11999-0.23999-4.85999-0.23999-24.48 0-44.28 19.14-44.28 43.08 50.57999 64.56 135.72 196.31999 152.70001 256.8-2.64001-72.11999-66.24001-226.56001-103.56002-299.64001z'],
  [7.68, 3.425, 7.926, 25.611, 103.161, 333.36, 'sand', 'M66.66 4.62c-6.78001-3.24-13.98001-4.62-22.8-4.62-21.24001 0-39.84001 13.68001-43.86 29.46 36.89999 85.43999 93.17999 241.38003 103.13998 303.89999 0.84003-69.59998-23.69998-246.83999-36.47998-328.73999z'],
  [12.815, 1.95, 6.016, 27.086, 78.3, 352.56, 'center', 'M41.03999 0c-18.96001 0-34.92 10.14-41.03999 22.14 12.78 83.64 36.36 252.96001 40.32001 330.41997l0.95999 0c3.42-77.39997 25.86002-250.49997 37.01999-336.47997-8.63998-10.08-22.43999-16.08-37.26-16.08z'],
  [15.935, 3.185, 8.32, 25.851, 108.3, 336.48, 'rust', 'M65.39999 3.24c-8.94 0-17.10001 2.22-22.07998 4.85999-1.86002-3.12-3.95999-6.05999-5.75998-8.09999-11.76004 83.51999-35.82002 253.98-37.56003 336.47998l0.84 0c11.34-79.32001 69.95999-229.13998 107.45999-305.69998-6.05997-16.5-23.04001-27.54-42.9-27.54z'],
  [16.318, 5.979, 12.22, 23.057, 159.06, 300.12, 'terra', 'M114.12 0c-2.57999 0-4.80002 0.17999-6.42002 0.48-39.35998 78.48-99.89999 228.77998-107.69998 299.63996 20.88001-71.33996 110.39999-197.45996 159.06-258.11996-0.29999-24.24001-20.34-42-44.94-42z'],
  [16.761, 9.772, 14.769, 19.268, 192.24, 250.8, 'sand', 'M155.40001 0c-46.92001 56.09998-144 197.22-155.40001 250.79999 34.74-55.62 130.50002-147.24002 187.68001-190.26 3.23999-6.17999 4.56-13.14 4.56-21.17999 0.11999-22.32001-16.20002-38.58002-36.84-39.36z'],
  [17.24, 15.235, 14.751, 13.847, 192.006, 180.24, 'rust', 'M181.08002 0c-58.32001 45.90002-145.92002 126.54001-181.08002 180.24002l4.5 0c52.62-37.56 119.22-79.79999 169.01999-115.26001 11.28-9.29999 18.48001-23.88001 18.48001-37.79999 0.17999-11.10001-3.96002-20.52002-10.91998-27.18002z'],
  [9.728, 26.745, 4.092, 3.214, 53.264, 41.833, 'terra', 'M9.16354 0l-9 35.10001c-0.96001 4.20001 2.45999 7.44 6.23999 6.6l46.85999-10.74002-44.09998-30.95999z'],
  [18.13, 26.773, 4.118, 3.227, 53.6, 41.998, 'terra', 'M44.39996 0l-44.39996 31.19998 47.27997 10.62003c4.14002 1.01999 7.14002-2.52002 6.11999-6.23999l-9-35.58002z'],
];

// The shell spans x 0–32 and y 1.95–30 in its box; its visual centre is (16, 16).
function shell({ width, cx, cy, mono }) {
  const s = width / 32;
  const petals = PETALS.map(([x, y, w, h, vw, vh, fill, d]) => {
    const t = `translate(${x} ${y}) scale(${w / vw} ${h / vh})`;
    return `<path transform="${t}" d="${d}" fill="${mono ?? C[fill]}"/>`;
  }).join('');
  return `<g transform="translate(${cx - 16 * s} ${cy - 16 * s}) scale(${s})">${petals}</g>`;
}

function svg(size, body, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${body}</svg>`;
}

const icons = {
  // iOS / store icon: full square, the OS applies the mask. Shell ~62% wide, nudged up for optical balance.
  icon: { size: 1024, svg: svg(1024, shell({ width: 640, cx: 512, cy: 500 }), C.paper) },
  // Android adaptive foreground: transparent, shell inside the 66dp-of-108dp safe circle.
  'android-icon-foreground': { size: 1024, svg: svg(1024, shell({ width: 480, cx: 512, cy: 504 })) },
  'android-icon-background': { size: 1024, svg: svg(1024, '', C.paper) },
  // Themed (monochrome) icon: one colour, the launcher tints it.
  'android-icon-monochrome': { size: 1024, svg: svg(1024, shell({ width: 480, cx: 512, cy: 504, mono: '#000000' })) },
  // Splash: the shell alone on transparent; app.json sets the white background and display width.
  'splash-icon': { size: 1024, svg: svg(1024, shell({ width: 960, cx: 512, cy: 512 })) },
  favicon: { size: 48, svg: svg(48, shell({ width: 46, cx: 24, cy: 24 })) },
};

for (const [name, { size, svg: text }] of Object.entries(icons)) {
  const src = join(svgDir, `${name}.svg`);
  writeFileSync(src, text);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', join(assets, `${name}.png`), src]);
  console.log(`${name}.png ${size}×${size}`);
}
