import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { colors } from "@/theme";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Illustration #1 — Sejm column (compass / order)
export function IllustrationCompass({ size = 220 }: { size?: number }) {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 16000, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const ringProps = useAnimatedProps(() => ({
    rotation: rotation.value,
    originX: 110,
    originY: 110,
  }));
  const pulseProps = useAnimatedProps(() => ({
    opacity: 0.15 + pulse.value * 0.35,
  }));

  return (
    <View style={[styles.illust, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        <Defs>
          <SvgLinearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fbf7ed" />
            <Stop offset="1" stopColor="#ede4d0" />
          </SvgLinearGradient>
          <SvgLinearGradient id="column" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#8a2a1f" />
            <Stop offset="1" stopColor="#5e1e16" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="110" cy="110" r="105" fill="url(#paper)" />
        <AnimatedG animatedProps={ringProps}>
          <Circle cx="110" cy="110" r="92" stroke={colors.border} strokeWidth="1" strokeDasharray="3 6" fill="none" />
          <Circle cx="110" cy="18" r="3" fill={colors.accent} />
          <Circle cx="202" cy="110" r="3" fill={colors.accent} opacity={0.6} />
          <Circle cx="110" cy="202" r="3" fill={colors.accent} opacity={0.6} />
          <Circle cx="18" cy="110" r="3" fill={colors.accent} opacity={0.6} />
        </AnimatedG>
        <AnimatedCircle cx="110" cy="110" r="70" fill={colors.accent} animatedProps={pulseProps} />
        <Rect x="74" y="158" width="72" height="12" rx="2" fill="#3a3530" />
        <Rect x="86" y="62" width="48" height="100" fill="url(#column)" />
        <Rect x="78" y="54" width="64" height="12" rx="2" fill="#3a3530" />
        <Path d="M70 54 L150 54 L110 26 Z" fill="#3a3530" />
        <Rect x="96" y="68" width="2" height="86" fill="#fbf7ed" opacity={0.25} />
        <Rect x="108" y="68" width="2" height="86" fill="#fbf7ed" opacity={0.25} />
        <Rect x="120" y="68" width="2" height="86" fill="#fbf7ed" opacity={0.25} />
      </Svg>
    </View>
  );
}

// Illustration #2 — Document with impact mark
export function IllustrationDoc({ size = 220 }: { size?: number }) {
  const stamp = useSharedValue(0);
  const lineProgress = useSharedValue(0);

  useEffect(() => {
    stamp.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.out(Easing.back(2)) }),
          withTiming(1, { duration: 1800 }),
          withTiming(0, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
    lineProgress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const stampProps = useAnimatedProps(() => ({
    opacity: stamp.value,
    rotation: -12 + (1 - stamp.value) * 8,
    scale: 0.85 + stamp.value * 0.15,
    originX: 150,
    originY: 150,
  }));
  const lineAProps = useAnimatedProps(() => ({ opacity: 0.3 + lineProgress.value * 0.5 }));
  const lineBProps = useAnimatedProps(() => ({ opacity: 0.3 + (1 - lineProgress.value) * 0.5 }));

  return (
    <View style={[styles.illust, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        <Defs>
          <SvgLinearGradient id="docBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#f7e8c8" />
            <Stop offset="1" stopColor="#e8cfa0" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="110" cy="110" r="105" fill="#fbf7ed" />
        <Rect x="62" y="44" width="100" height="132" rx="6" fill="#e8e1d2" transform="rotate(-6 110 110)" />
        <Rect x="56" y="40" width="108" height="138" rx="6" fill="url(#docBg)" />
        <Rect x="56" y="40" width="108" height="14" rx="6" fill={colors.accent} />
        <Rect x="56" y="40" width="108" height="14" fill={colors.accent} />
        <Rect x="68" y="62" width="62" height="6" rx="2" fill="#3a3530" opacity={0.85} />
        <Rect x="68" y="74" width="84" height="3" rx="1.5" fill="#3a3530" opacity={0.45} />
        <AnimatedRect x="68" y="90" width="84" height="3" rx="1.5" fill="#3a3530" animatedProps={lineAProps} />
        <AnimatedRect x="68" y="100" width="72" height="3" rx="1.5" fill="#3a3530" animatedProps={lineBProps} />
        <AnimatedRect x="68" y="110" width="80" height="3" rx="1.5" fill="#3a3530" animatedProps={lineAProps} />
        <AnimatedRect x="68" y="120" width="60" height="3" rx="1.5" fill="#3a3530" animatedProps={lineBProps} />
        <AnimatedRect x="68" y="130" width="78" height="3" rx="1.5" fill="#3a3530" animatedProps={lineAProps} />
        <AnimatedRect x="68" y="140" width="50" height="3" rx="1.5" fill="#3a3530" animatedProps={lineBProps} />
        <AnimatedG animatedProps={stampProps}>
          <Circle cx="150" cy="150" r="28" fill="none" stroke={colors.accent} strokeWidth="3" />
          <Circle cx="150" cy="150" r="22" fill="none" stroke={colors.accent} strokeWidth="1.5" />
          <Path d="M138 152 L146 160 L162 142" stroke={colors.accent} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </AnimatedG>
      </Svg>
    </View>
  );
}

// Illustration #3 — Pin on map (location)
export function IllustrationPin({ size = 220 }: { size?: number }) {
  const drop = useSharedValue(0);
  const ripple = useSharedValue(0);

  useEffect(() => {
    drop.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.bounce) }),
        withTiming(1, { duration: 1500 }),
        withTiming(0, { duration: 300 }),
      ),
      -1,
      false,
    );
    ripple.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const pinProps = useAnimatedProps(() => ({
    y: -60 + drop.value * 60,
  }));
  const rippleProps = useAnimatedProps(() => ({
    opacity: 1 - ripple.value,
    r: 14 * (0.6 + ripple.value * 1.4),
  }));

  return (
    <View style={[styles.illust, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        <Circle cx="110" cy="110" r="105" fill="#fbf7ed" />
        <G opacity={0.35}>
          <Path d="M30 80 L190 80" stroke={colors.border} strokeWidth="1" />
          <Path d="M30 110 L190 110" stroke={colors.border} strokeWidth="1" />
          <Path d="M30 140 L190 140" stroke={colors.border} strokeWidth="1" />
          <Path d="M30 170 L190 170" stroke={colors.border} strokeWidth="1" />
          <Path d="M60 50 L60 200" stroke={colors.border} strokeWidth="1" />
          <Path d="M110 50 L110 200" stroke={colors.border} strokeWidth="1" />
          <Path d="M160 50 L160 200" stroke={colors.border} strokeWidth="1" />
        </G>
        <Path
          d="M50 90 Q70 70 100 80 Q140 75 160 100 Q170 130 150 155 Q120 175 90 165 Q55 155 50 130 Z"
          fill={colors.muted}
          opacity={0.7}
          stroke={colors.border}
          strokeWidth="1"
        />
        <AnimatedCircle cx="110" cy="148" r="14" fill={colors.accent} animatedProps={rippleProps} />
        <AnimatedG animatedProps={pinProps}>
          <Path
            d="M110 88 C 92 88 80 100 80 116 C 80 136 110 158 110 158 C 110 158 140 136 140 116 C 140 100 128 88 110 88 Z"
            fill={colors.accent}
          />
          <Circle cx="110" cy="114" r="9" fill="#fbf7ed" />
        </AnimatedG>
      </Svg>
    </View>
  );
}

// Illustration #4 — Topics rings (selection)
export function IllustrationTopics({ size = 220 }: { size?: number }) {
  const angle = useSharedValue(0);

  useEffect(() => {
    angle.value = withRepeat(
      withTiming(360, { duration: 22000, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const ringAProps = useAnimatedProps(() => ({
    rotation: angle.value,
    originX: 110,
    originY: 110,
  }));
  const ringBProps = useAnimatedProps(() => ({
    rotation: -angle.value,
    originX: 110,
    originY: 110,
  }));

  const dots = [
    { color: "#8a2a1f", angle: 0 },
    { color: "#3d6b3d", angle: 60 },
    { color: "#c08030", angle: 120 },
    { color: "#3a3530", angle: 180 },
    { color: "#5060a0", angle: 240 },
    { color: "#8a2a1f", angle: 300 },
  ];

  return (
    <View style={[styles.illust, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        <Circle cx="110" cy="110" r="105" fill="#fbf7ed" />
        <Circle cx="110" cy="110" r="48" fill={colors.accent} opacity={0.08} />
        <Circle cx="110" cy="110" r="48" fill="none" stroke={colors.accent} strokeWidth="1.5" />
        <AnimatedG animatedProps={ringAProps}>
          {dots.map((d, i) => {
            const rad = (d.angle * Math.PI) / 180;
            const x = 110 + Math.cos(rad) * 74;
            const y = 110 + Math.sin(rad) * 74;
            return <Circle key={i} cx={x} cy={y} r="10" fill={d.color} />;
          })}
        </AnimatedG>
        <AnimatedG animatedProps={ringBProps}>
          {dots.map((d, i) => {
            const rad = ((d.angle + 30) * Math.PI) / 180;
            const x = 110 + Math.cos(rad) * 94;
            const y = 110 + Math.sin(rad) * 94;
            return <Circle key={i} cx={x} cy={y} r="5" fill={d.color} opacity={0.6} />;
          })}
        </AnimatedG>
        <Path d="M104 110 L110 116 L118 104" stroke={colors.accent} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  illust: { alignItems: "center", justifyContent: "center" },
});
