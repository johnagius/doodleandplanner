import { useEffect, useRef } from 'react';

/**
 * Lightweight WebGL hero backdrop: animated, theme-tinted "aurora" blobs drawn
 * in a fragment shader on a full-bleed canvas. No dependencies. Degrades to a
 * CSS gradient (set on the wrapper) when WebGL is unavailable, and pauses for
 * users who prefer reduced motion.
 */
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dark;

// smooth blob field
float blob(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return smoothstep(r, 0.0, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float t = u_time * 0.08;

  vec2 p = uv;
  p.x *= u_res.x / u_res.y;

  // three drifting blobs
  vec2 c1 = vec2(0.35 + 0.18 * sin(t * 1.3), 0.40 + 0.12 * cos(t * 1.1));
  vec2 c2 = vec2(0.72 + 0.14 * cos(t * 0.9), 0.65 + 0.16 * sin(t * 1.4));
  vec2 c3 = vec2(0.55 + 0.20 * sin(t * 0.7 + 2.0), 0.30 + 0.10 * cos(t * 1.7));
  c1.x *= u_res.x / u_res.y; c2.x *= u_res.x / u_res.y; c3.x *= u_res.x / u_res.y;

  float b1 = blob(p, c1, 0.45);
  float b2 = blob(p, c2, 0.50);
  float b3 = blob(p, c3, 0.40);

  // indigo / violet / pink palette
  vec3 indigo = vec3(0.39, 0.40, 0.95);
  vec3 violet = vec3(0.66, 0.33, 0.97);
  vec3 pink   = vec3(0.93, 0.28, 0.60);

  vec3 col = indigo * b1 + violet * b2 + pink * b3;

  // base + tint; soft lavender base in light mode, deep indigo in dark mode
  vec3 base = mix(vec3(0.90, 0.91, 0.99), vec3(0.05, 0.06, 0.11), u_dark);
  float intensity = mix(0.60, 0.65, u_dark);
  col = base + col * intensity;

  // subtle grain to avoid banding
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.02;

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function HeroCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv: HTMLCanvasElement = canvas; // non-null binding for nested closures
    const gl =
      (cv.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext) ||
      (cv.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return; // CSS fallback on the wrapper handles this case.

    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!prog || !vs || !fs) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uDark = gl.getUniformLocation(prog, 'u_dark');

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth * dpr;
      const h = cv.clientHeight * dpr;
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      gl.viewport(0, 0, cv.width, cv.height);
    };

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      resize();
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, prefersReduced ? 0 : (now - start) / 1000);
      gl.uniform1f(uDark, isDark() ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!prefersReduced) raf = requestAnimationFrame(frame);
    };
    frame(start);

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
    };
    cv.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('webglcontextlost', onLost);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden data-testid="hero-canvas" />;
}
