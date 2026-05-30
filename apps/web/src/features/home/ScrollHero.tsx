import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { lazy, Suspense, useRef } from 'react';
import { HeroCanvas } from '../../components/HeroCanvas.js';

const Hero3D = lazy(() => import('../../components/Hero3D.js'));

/**
 * The landing hero with scroll-linked motion: as the page scrolls past the
 * hero, the copy drifts up and fades while the 3D/flow backdrop scales and
 * dims — a cinematic parallax. Honours prefers-reduced-motion.
 */
export function ScrollHero() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Copy lifts + fades; backdrop scales up slightly and dims.
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.18]);
  const bgOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

  const motionEnabled = !reduced;

  return (
    <section className="hero" ref={ref}>
      <motion.div
        className="hero-bg-layer"
        style={motionEnabled ? { scale: bgScale, opacity: bgOpacity } : undefined}
      >
        <HeroCanvas className="hero-canvas" />
        <Suspense fallback={null}>
          <Hero3D className="hero-3d-layer" />
        </Suspense>
      </motion.div>
      <motion.div
        className="hero-inner"
        style={motionEnabled ? { y: copyY, opacity: copyOpacity } : undefined}
      >
        <span className="hero-eyebrow">Plans, polls &amp; doodles — together</span>
        <h1 className="hero-title">
          Plan it together,
          <br />
          doodle along the way
        </h1>
        <p className="hero-sub">
          Spin up a room, invite friends, and let smart Google Calendar suggestions find a time that
          actually works — then sketch ideas, split the costs, and lock the plan in.
        </p>
        <div className="hero-chips">
          <span className="chip">🗳️ Scheduling polls</span>
          <span className="chip">📅 Calendar-aware</span>
          <span className="chip">🎨 Shared doodle</span>
          <span className="chip">💰 Cost split</span>
        </div>
      </motion.div>
    </section>
  );
}
