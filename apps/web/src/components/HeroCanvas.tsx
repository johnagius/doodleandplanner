import { useEffect, useRef } from 'react';

/**
 * Interactive WebGL hero: a domain-warped fractal-noise flow field with an
 * iridescent palette, film grain and a vignette. The flow bends toward the
 * pointer (eased), giving a tactile, studio-grade backdrop. No dependencies.
 * Degrades to a CSS gradient when WebGL is unavailable; pauses motion for
 * users who prefer reduced motion (still renders one static frame).
 */
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dark;
uniform vec2 u_mouse;     // 0..1, eased pointer
uniform float u_active;   // 0..1 pointer presence
uniform float u_calm;     // 0..1 ambient/calm backdrop mode

// hash / value noise --------------------------------------------------------
vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
        dot(hash2(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
        dot(hash2(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x),
    u.y);
}
// fractal brownian motion ---------------------------------------------------
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++){
    v += a * noise(p);
    p = rot * p;
    a *= 0.5;
  }
  return v;
}

// iridescent palette (Inigo Quilez cosine palette)
vec3 palette(float t){
  vec3 a = vec3(0.50, 0.45, 0.55);
  vec3 b = vec3(0.45, 0.40, 0.50);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.10, 0.33, 0.67); // indigo -> violet -> pink sweep
  return a + b * cos(6.28318 * (c * t + d));
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;               // aspect-correct
  float t = u_time * 0.06;

  // pointer attraction: pull the field toward the cursor
  vec2 m = u_mouse;
  m.x *= u_res.x / u_res.y;
  vec2 toM = m - p;
  float md = length(toM);
  vec2 pull = toM * (0.18 * u_active) / (md * md + 0.15);

  // domain warping: noise of noise of noise
  vec2 q = vec2(fbm(p * 1.5 + vec2(0.0, t)),
                fbm(p * 1.5 + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p * 1.5 + 3.0 * q + vec2(1.7, 9.2) + pull + t * 0.5),
                fbm(p * 1.5 + 3.0 * q + vec2(8.3, 2.8) - pull));
  float f = fbm(p * 1.5 + 3.5 * r);

  // map the warped field through the iridescent palette
  float hue = f + 0.25 * length(r) + 0.15 * sin(t);
  vec3 col = palette(hue);

  // depth shading from the warp magnitude
  col *= 0.65 + 0.6 * f;
  col = mix(col, palette(hue + 0.15), clamp(length(q), 0.0, 1.0) * 0.5);

  // theme base + intensity (calmer & lighter in light mode for legibility)
  vec3 base = mix(vec3(0.95, 0.96, 1.0), vec3(0.03, 0.04, 0.08), u_dark);
  float strength = mix(0.34, 0.82, u_dark) * mix(1.0, 0.7, u_calm);
  col = base + col * strength;

  // soft glow around the pointer
  col += palette(hue + 0.3) * (0.12 * u_active) * smoothstep(0.5, 0.0, md);

  // vignette
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  col *= 0.85 + 0.15 * vig;

  // film grain (subtler in light mode)
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
  col += (g - 0.5) * mix(0.012, 0.028, u_dark) * (1.0 - 0.6 * u_calm);

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

export function HeroCanvas({
  className,
  interactive = true,
  calm = false,
}: {
  className?: string;
  /** Attach pointer interaction (default true). Off for ambient backdrops. */
  interactive?: boolean;
  /** Calmer, lower-contrast palette for use behind content (default false). */
  calm?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv: HTMLCanvasElement = canvas;
    const gl =
      (cv.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext) ||
      (cv.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return;

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
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uActive = gl.getUniformLocation(prog, 'u_active');
    const uCalm = gl.getUniformLocation(prog, 'u_calm');

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Pointer state (target) + eased state (rendered).
    const target = { x: 0.5, y: 0.5, active: 0 };
    const eased = { x: 0.5, y: 0.5, active: 0 };

    const onMove = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      target.x = (e.clientX - rect.left) / rect.width;
      target.y = 1 - (e.clientY - rect.top) / rect.height; // flip Y for GL
      target.active = 1;
    };
    const onLeave = () => {
      target.active = 0;
    };
    const host = cv.parentElement ?? cv;
    if (interactive) {
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }

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
    const render = (tSeconds: number) => {
      // ease pointer toward target
      eased.x += (target.x - eased.x) * 0.08;
      eased.y += (target.y - eased.y) * 0.08;
      eased.active += (target.active - eased.active) * 0.06;
      resize();
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, tSeconds);
      gl.uniform1f(uDark, isDark() ? 1 : 0);
      gl.uniform2f(uMouse, eased.x, eased.y);
      gl.uniform1f(uActive, eased.active);
      gl.uniform1f(uCalm, calm ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      render((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };

    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    if (prefersReduced) {
      render(0); // one static frame — but keep it correct as things change:
      // redraw on container resize (and first layout) and on theme toggle.
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => render(0));
        ro.observe(cv);
      }
      mo = new MutationObserver(() => render(0));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } else {
      frame(start);
    }

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
    };
    cv.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      cv.removeEventListener('webglcontextlost', onLost);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      // Release GPU resources — browsers cap live WebGL contexts, and this hero
      // mounts/unmounts on every Home↔Room navigation.
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [interactive, calm]);

  return <canvas ref={ref} className={className} aria-hidden data-testid="hero-canvas" />;
}
