import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HABIT_COMPLETE_COLORS = [
  "#3d9a5b",
  "#5bc47a",
  "#9ae6b4",
  "#f7f9ff",
  "#86efac",
] as const;

type Particle = {
  id: number;
  color: string;
  dx: number;
  dy: number;
  size: number;
  rotate: number;
};

type Burst = {
  id: number;
  x: number;
  y: number;
  particles: Particle[];
};

let nextBurstId = 1;
let nextParticleId = 1;

type Listener = (burst: Burst) => void;
const listeners = new Set<Listener>();

function emitBurst(burst: Burst) {
  for (const listener of listeners) listener(burst);
}

/**
 * Burst confetti from a point in window coordinates (checkbox / day square).
 * Decorative only — never throws into the habit write path.
 */
export function fireHabitCompleteConfetti(origin: {
  x: number;
  y: number;
}): void {
  try {
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return;
    const particles: Particle[] = [];
    for (let i = 0; i < 28; i += 1) {
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.4;
      const speed = 48 + Math.random() * 90;
      particles.push({
        id: nextParticleId++,
        color:
          HABIT_COMPLETE_COLORS[
            Math.floor(Math.random() * HABIT_COMPLETE_COLORS.length)
          ]!,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 40,
        size: 4 + Math.random() * 4,
        rotate: Math.random() * 360,
      });
    }
    emitBurst({
      id: nextBurstId++,
      x: origin.x,
      y: origin.y,
      particles,
    });
  } catch {
    // Confetti is decorative — never block habit completion.
  }
}

function ConfettiParticle({
  particle,
  onDone,
}: {
  particle: Particle;
  onDone: () => void;
}) {
  const progress = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const notifyDone = useCallback(() => {
    onDoneRef.current();
  }, []);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: 780, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(notifyDone)();
      },
    );
  }, [notifyDone, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const gravity = 160 * t * t;
    return {
      opacity: 1 - t,
      transform: [
        { translateX: particle.dx * t },
        { translateY: particle.dy * t + gravity },
        { rotate: `${particle.rotate + t * 180}deg` },
        { scale: 1 - t * 0.35 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: particle.size,
          height: particle.size * 0.7,
          backgroundColor: particle.color,
          borderRadius: 1,
        },
        style,
      ]}
    />
  );
}

function ConfettiBurstView({
  burst,
  onDone,
}: {
  burst: Burst;
  onDone: (id: number) => void;
}) {
  const remaining = useRef(burst.particles.length);
  const finishOne = useCallback(() => {
    remaining.current -= 1;
    if (remaining.current <= 0) onDone(burst.id);
  }, [burst.id, onDone]);

  return (
    <View
      pointerEvents="none"
      style={[styles.burstOrigin, { left: burst.x, top: burst.y }]}
    >
      {burst.particles.map((particle) => (
        <ConfettiParticle
          key={particle.id}
          particle={particle}
          onDone={finishOne}
        />
      ))}
    </View>
  );
}

/** Mount once near the app root / habits shell so bursts can paint above lists. */
export function HabitConfettiHost() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    const listener: Listener = (burst) => {
      setBursts((current) => [...current, burst]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }, []);

  if (bursts.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      {bursts.map((burst) => (
        <ConfettiBurstView key={burst.id} burst={burst} onDone={removeBurst} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: 10000,
    elevation: 10000,
  },
  burstOrigin: {
    position: "absolute",
    width: 1,
    height: 1,
  },
  particle: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
