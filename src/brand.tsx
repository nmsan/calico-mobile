import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { colors, fonts } from './theme';

// Petals of the shell mark from assets/icon.svg. Each petal was a nested <svg> with its own
// box and viewBox; here that becomes a transform so react-native-svg draws it with plain groups.
type Petal = { x: number; y: number; w: number; h: number; vb: [number, number, number, number]; fill: string; d: string };

const CENTER = '#EFE2CF'; // the cream petal, slightly deepened so it reads on a light background

const PETALS: Petal[] = [
  { x: 0, y: 15.235, w: 14.317, h: 13.783, vb: [0, 0, 186.36, 179.4], fill: colors.terra, d: 'M10.86 0c-7.02 7.26002-10.86 16.68002-10.86 27.78 0 13.56003 6.96 27.96002 17.4 36.42001 43.02 32.22 120.24 78.06003 168.96 115.19998-27.72-56.63995-125.94-142.19998-175.5-179.39999z' },
  { x: 0.433, y: 9.777, w: 14.276, h: 19.217, vb: [0, 0, 185.82, 250.14], fill: colors.terra, d: 'M34.91999 0c-20.52 2.34-34.91999 18.89999-34.91999 39.89999 0 7.79999 1.92 15.17999 5.28 20.76 55.86 46.2 150.66 135.47999 180.54001 189.47999-10.20001-65.94-109.86-201.95999-150.90002-250.13998z' },
  { x: 3.439, y: 5.974, w: 11.731, h: 23.039, vb: [0, 0, 152.7, 299.88], fill: colors.rust, d: 'M49.13999 0.23999c-1.61999-0.17999-3.11999-0.23999-4.85999-0.23999-24.48 0-44.28 19.14-44.28 43.08 50.57999 64.56 135.72 196.31999 152.70001 256.8-2.64001-72.11999-66.24001-226.56001-103.56002-299.64001z' },
  { x: 7.68, y: 3.425, w: 7.926, h: 25.611, vb: [0, 0, 103.161, 333.36], fill: colors.sand, d: 'M66.66 4.62c-6.78001-3.24-13.98001-4.62-22.8-4.62-21.24001 0-39.84001 13.68001-43.86 29.46 36.89999 85.43999 93.17999 241.38003 103.13998 303.89999 0.84003-69.59998-23.69998-246.83999-36.47998-328.73999z' },
  { x: 12.815, y: 1.95, w: 6.016, h: 27.086, vb: [0, 0, 78.3, 352.56], fill: CENTER, d: 'M41.03999 0c-18.96001 0-34.92 10.14-41.03999 22.14 12.78 83.64 36.36 252.96001 40.32001 330.41997l0.95999 0c3.42-77.39997 25.86002-250.49997 37.01999-336.47997-8.63998-10.08-22.43999-16.08-37.26-16.08z' },
  { x: 15.935, y: 3.185, w: 8.32, h: 25.851, vb: [0, 0, 108.3, 336.48], fill: colors.rust, d: 'M65.39999 3.24c-8.94 0-17.10001 2.22-22.07998 4.85999-1.86002-3.12-3.95999-6.05999-5.75998-8.09999-11.76004 83.51999-35.82002 253.98-37.56003 336.47998l0.84 0c11.34-79.32001 69.95999-229.13998 107.45999-305.69998-6.05997-16.5-23.04001-27.54-42.9-27.54z' },
  { x: 16.318, y: 5.979, w: 12.22, h: 23.057, vb: [0, 0, 159.06, 300.12], fill: colors.terra, d: 'M114.12 0c-2.57999 0-4.80002 0.17999-6.42002 0.48-39.35998 78.48-99.89999 228.77998-107.69998 299.63996 20.88001-71.33996 110.39999-197.45996 159.06-258.11996-0.29999-24.24001-20.34-42-44.94-42z' },
  { x: 16.761, y: 9.772, w: 14.769, h: 19.268, vb: [0, 0, 192.24, 250.8], fill: colors.sand, d: 'M155.40001 0c-46.92001 56.09998-144 197.22-155.40001 250.79999 34.74-55.62 130.50002-147.24002 187.68001-190.26 3.23999-6.17999 4.56-13.14 4.56-21.17999 0.11999-22.32001-16.20002-38.58002-36.84-39.36z' },
  { x: 17.24, y: 15.235, w: 14.751, h: 13.847, vb: [0, 0, 192.006, 180.24], fill: colors.rust, d: 'M181.08002 0c-58.32001 45.90002-145.92002 126.54001-181.08002 180.24002l4.5 0c52.62-37.56 119.22-79.79999 169.01999-115.26001 11.28-9.29999 18.48001-23.88001 18.48001-37.79999 0.17999-11.10001-3.96002-20.52002-10.91998-27.18002z' },
  { x: 9.728, y: 26.745, w: 4.092, h: 3.214, vb: [0, 0, 53.264, 41.833], fill: colors.terra, d: 'M9.16354 0l-9 35.10001c-0.96001 4.20001 2.45999 7.44 6.23999 6.6l46.85999-10.74002-44.09998-30.95999z' },
  { x: 18.13, y: 26.773, w: 4.118, h: 3.227, vb: [0, 0, 53.6, 41.998], fill: colors.terra, d: 'M44.39996 0l-44.39996 31.19998 47.27997 10.62003c4.14002 1.01999 7.14002-2.52002 6.11999-6.23999l-9-35.58002z' },
];

/** The Calico shell mark. `size` is the width; the mark is drawn in a 32×32 box. */
export function ShellMark({ size = 64, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View style={style} accessibilityRole="image" accessibilityLabel="Calico">
      <Svg width={size} height={size} viewBox="0 1.5 32 29">
        {PETALS.map((p, i) => (
          <G
            key={i}
            transform={`translate(${p.x} ${p.y}) scale(${p.w / p.vb[2]} ${p.h / p.vb[3]}) translate(${-p.vb[0]} ${-p.vb[1]})`}
          >
            <Path d={p.d} fill={p.fill} />
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** Shell + CALICO wordmark + rule + tagline, as on the brand artwork. */
export function BrandLockup({ markSize = 96, onLongPress }: { markSize?: number; onLongPress?: () => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <ShellMark size={markSize} />
      <Text
        onLongPress={onLongPress}
        suppressHighlighting
        style={{ fontFamily: fonts.serif, fontSize: 40, letterSpacing: 5, color: colors.ink, marginTop: 14 }}
      >
        CALICO
      </Text>
      <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: colors.ink, marginTop: 10 }} />
      <Text style={{ fontSize: 11, letterSpacing: 3.5, color: colors.ink2, marginTop: 12, fontWeight: '500' }}>SIMPLE · EVERYDAY</Text>
    </View>
  );
}
