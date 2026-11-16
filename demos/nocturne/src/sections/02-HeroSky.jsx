import { useEffect, useRef } from "react";
import "./02-HeroSky.css";

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
uniform vec4 uMet;   // start xy, direction xy (screen space, height units)
uniform vec3 uMetB;  // progress (-1 = none), travel length, tail length
out vec4 outColor;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hs(vec2 c, float s) {
  uvec2 u = uvec2(ivec2(c) + ivec2(32768));
  uint h = pcg(u.x + pcg(u.y + pcg(uint(s))));
  return float(h) / 4294967295.0;
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hs(i, 90.), hs(i + vec2(1.0, 0.0), 90.), f.x),
             mix(hs(i + vec2(0.0, 1.0), 90.), hs(i + vec2(1.0), 90.), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.02 + 7.3;
    a *= 0.5;
  }
  return s;
}

vec3 stars(vec2 q, float scale, float prob, float seed, float size, float halo, float t, float calm, int R) {
  vec2 g = q * scale;
  vec2 id = floor(g);
  vec2 f = g - id;
  vec3 col = vec3(0.0);
  for (int j = -R; j <= R; j++) {
    for (int i = -R; i <= R; i++) {
      vec2 o2 = vec2(float(i), float(j));
      vec2 c = id + o2;
      if (hs(c, seed) > prob * calm) continue;
      float jr = R == 0 ? 0.9 : 0.6;
      vec2 pos = o2 + vec2(hs(c, seed + 1.), hs(c, seed + 2.)) * jr + (1.0 - jr) * 0.5;
      float d = length(f - pos) / scale;
      float m = hs(c, seed + 3.);
      float b = mix(0.22, 1.0, m * m * m);
      float ph = hs(c, seed + 4.) * 6.2831;
      float sp = 0.5 + hs(c, seed + 5.) * 1.5;
      float tint = hs(c, seed + 6.);
      float tw = 1.0 + 0.22 * sin(t * sp + ph) + 0.1 * sin(t * sp * 2.7 + ph * 3.1);
      vec3 base = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.76), tint * tint);
      vec3 shift = 0.14 * vec3(sin(t * sp * 1.3 + ph), sin(t * sp * 1.1 + ph + 2.0), sin(t * sp * 0.9 + ph + 4.0));
      float core = exp(-(d * d) / (size * size));
      float hl = halo * exp(-d / (size * 4.5)) * 0.35;
      col += clamp(base + shift, 0.0, 1.5) * (core + hl) * b * tw;
    }
  }
  return col;
}

float sk(float u) { return sin(u + 0.75 * sin(u)); }
float ridge(float x, int i) {
  if (i == 0) return 0.275 + 0.040 * sk(x * 5.2 + 1.0) + 0.014 * sin(x * 11.0 + 2.0);
  if (i == 1) return 0.205 + 0.050 * sk(x * 6.6 + 4.0) + 0.016 * sin(x * 13.0 + 0.7);
  if (i == 2) return 0.135 + 0.052 * sk(x * 5.0 + 2.2) + 0.014 * sin(x * 15.0 + 3.1);
  return 0.068 + 0.040 * sk(x * 7.4 + 5.4) + 0.010 * sin(x * 17.0 + 1.9);
}

vec3 horizon(float y) {
  vec3 top = vec3(0.020, 0.016, 0.047);
  vec3 glow = vec3(0.169, 0.129, 0.314);
  return mix(top, glow * 0.42, pow(1.0 - clamp(y / 0.9, 0.0, 1.0), 3.0));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  float asp = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * asp, uv.y);
  float px = 1.0 / uRes.y;
  float t = uTime;

  float cx = mix(0.5, 0.36, smoothstep(0.8, 1.4, asp));
  vec2 e = vec2((uv.x - cx) / 0.4, (uv.y - 0.5) / 0.2);
  float calm = 1.0 - 0.8 * exp(-dot(e, e));

  vec3 col = horizon(uv.y);
  vec2 mc = vec2(mix(0.80 * asp, 0.045 * asp, smoothstep(0.8, 1.3, asp)), mix(0.355, 0.36, smoothstep(0.8, 1.3, asp)));
  col += vec3(0.17, 0.15, 0.34) * 0.10 * exp(-length((q - mc) * vec2(0.8, 1.3)) * 3.2);

  // the whole sky wheels slowly around a point above the top left
  vec2 P = vec2(-0.2, 1.3);
  float a = t * 0.0008;
  vec2 d0 = q - P;
  vec2 qr = vec2(cos(a) * d0.x + sin(a) * d0.y, -sin(a) * d0.x + cos(a) * d0.y) + P;
  float hf = smoothstep(0.2, 0.55, uv.y);

  // dust band
  vec2 w = qr - vec2(0.9, 0.55);
  float dist = dot(w, vec2(-0.62, 0.78));
  float dens = exp(-dist * dist / (2.0 * 0.11 * 0.11));
  if (dens > 0.02) {
    float n = fbm(qr * 4.0 + 3.0);
    float rift = smoothstep(0.35, 0.7, fbm(qr * 7.0 + 11.0));
    float dust = dens * (0.35 + 0.9 * n) * (1.0 - 0.5 * rift);
    col += vec3(0.42, 0.5, 0.82) * 0.085 * dust * hf * (0.5 + 0.5 * calm);
  }

  // stars at three depths, plus a fine speckle inside the band
  vec3 s = stars(qr, 150.0, 0.22 * (1.0 + 2.0 * dens), 1.0, max(0.00055, 0.7 * px), 0.0, t, calm, 0) * 0.55;
  s += stars(qr, 62.0, 0.30, 11.0, max(0.0007, 0.8 * px), 0.0, t, calm, 0) * 0.7;
  s += stars(qr, 30.0, 0.22, 21.0, max(0.0011, 0.9 * px), 0.6, t, calm, 1) * 0.95;
  s += stars(qr, 8.5, 0.24, 31.0, max(0.0018, 1.1 * px), 1.0, t, calm, 1) * 1.3;
  col += s * hf * (0.55 + 0.45 * calm);

  // thin crescent moon, low on the left
  float mr = 0.03;
  vec2 pm = q - mc;
  float dA = length(pm) - mr;
  float dB = length(pm - vec2(0.27, 0.08) * mr) - mr;
  float cres = smoothstep(px * 1.2, -px * 1.2, dA) * smoothstep(-px * 1.2, px * 1.2, dB);
  col += vec3(0.58, 0.66, 0.9) * (exp(-length(pm) / (mr * 3.0)) * 0.05 + exp(-length(pm) / (mr * 10.0)) * 0.025);
  col += vec3(0.5, 0.56, 0.78) * 0.018 * smoothstep(px, -px, dA);
  col = mix(col, vec3(0.93, 0.95, 1.0), cres * 0.95);

  // meteor
  if (uMetB.x >= 0.0) {
    float k = uMetB.x;
    vec2 dv = uMet.zw;
    vec2 head = uMet.xy + dv * uMetB.y * k;
    vec2 tailp = uMet.xy + dv * max(0.0, uMetB.y * k - uMetB.z);
    vec2 ab = head - tailp;
    float L = max(length(ab), 1e-4);
    float u = clamp(dot(q - tailp, ab) / (L * L), 0.0, 1.0);
    float dd = length(q - tailp - ab * u);
    float wd = px * (0.5 + 1.1 * u);
    float m = exp(-dd * dd / (wd * wd)) * u * u * (1.0 - k) * smoothstep(0.0, 0.08, k);
    col += vec3(0.86, 0.92, 1.0) * m * 1.1;
  }

  // dunes: far and soft to near and dark, each ridge catching the moon
  vec3 dune = vec3(0.165, 0.137, 0.259);
  vec3 deep = vec3(0.102, 0.082, 0.188);
  vec3 ground = vec3(0.027, 0.024, 0.059);
  vec3 rc = vec3(0.66, 0.74, 0.92) * 0.8;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float par = 0.0015 * (fi + 1.0);
    float h = ridge(q.x - uPtr.x * par, i) + uPtr.y * par * 0.5;
    float h2 = ridge(q.x - uPtr.x * par + 0.004, i) + uPtr.y * par * 0.5;
    float slope = (h2 - h) / 0.004;
    float dd = q.y - h;
    float inside = smoothstep(px * 1.2, -px * 1.2, dd);
    float depth = max(-dd, 0.0);
    float lit = clamp(0.45 + slope * 1.6, 0.1, 1.0);
    vec3 body;
    float rs;
    if (i == 0) { body = mix(horizon(h), dune * 0.7, 0.65); rs = 0.35; }
    else if (i == 1) { body = dune * 0.5; rs = 0.55; }
    else if (i == 2) { body = deep * 0.55; rs = 0.75; }
    else { body = ground; rs = 0.5; }
    body = mix(body, body * 0.55, smoothstep(0.0, 0.18, depth));
    if (i == 3) body = mix(body, ground, smoothstep(0.0, 0.1, depth));
    float rimw = px * (1.4 + fi * 0.3);
    float rim = smoothstep(rimw * 2.5, 0.0, depth);
    vec3 lc = body + rc * rs * rim * lit + rc * 0.05 * exp(-depth / 0.03) * lit;
    col = mix(col, lc, inside);
  }

  col += (hs(floor(fc), 77.0) - 0.5) / 255.0 * 1.5;
  outColor = vec4(col, 1.0);
}`;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("sky shader:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export default function HeroSky() {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    const U = {};
    ["uRes", "uTime", "uPtr", "uMet", "uMetB"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rng = mulberry32(0x9e3779b1);
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    const met = { on: false, start: 0, dur: 1.1, x: 0, y: 0, dx: 0, dy: 0, trav: 0.3, tail: 0.14, next: 5 };
    let t = reduce.matches ? 30 : 0;
    let last = 0;
    let raf = 0;
    let visible = true;
    let size = [1, 1];

    const draw = () => {
      const k = met.on ? (t - met.start) / met.dur : -1;
      gl.uniform2f(U.uRes, size[0], size[1]);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uPtr, ptr.x, ptr.y);
      gl.uniform4f(U.uMet, met.x, met.y, met.dx, met.dy);
      gl.uniform3f(U.uMetB, k, met.trav, met.tail);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(root.clientWidth * dpr));
      const h = Math.max(1, Math.round(root.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      size = [w, h];
      gl.viewport(0, 0, w, h);
      if (!raf) draw();
    };

    const tick = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      t += dt;
      ptr.x += (ptr.tx - ptr.x) * 0.04;
      ptr.y += (ptr.ty - ptr.y) * 0.04;
      if (met.on && t - met.start > met.dur) met.on = false;
      if (!met.on && t > met.next) {
        const asp = size[0] / size[1];
        const ang = 0.25 + rng() * 0.35;
        const dir = rng() < 0.5 ? -1 : 1;
        met.on = true;
        met.start = t;
        met.dur = 0.9 + rng() * 0.4;
        met.x = asp * (0.3 + rng() * 0.5);
        met.y = 0.62 + rng() * 0.28;
        met.dx = dir * Math.cos(ang);
        met.dy = -Math.sin(ang);
        met.trav = 0.26 + rng() * 0.1;
        met.tail = 0.12 + rng() * 0.05;
        met.next = t + 12 + rng() * 8;
      }
      draw();
      if (!canvas.classList.contains("sky__canvas--live")) canvas.classList.add("sky__canvas--live");
      raf = requestAnimationFrame(tick);
    };

    const update = () => {
      if (reduce.matches) {
        cancelAnimationFrame(raf);
        raf = 0;
        t = 30;
        met.on = false;
        draw();
        canvas.classList.add("sky__canvas--live");
      } else if (visible && !document.hidden && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (ev) => {
      ptr.tx = (ev.clientX / window.innerWidth) * 2 - 1;
      ptr.ty = 1 - (ev.clientY / window.innerHeight) * 2;
    };
    const onLost = (ev) => {
      ev.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.classList.remove("sky__canvas--live");
    };

    const ro = new ResizeObserver(resize);
    ro.observe(root);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (!visible) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else update();
    });
    io.observe(root);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", update);
    reduce.addEventListener("change", update);
    canvas.addEventListener("webglcontextlost", onLost);
    resize();
    update();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", update);
      reduce.removeEventListener("change", update);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
  }, []);

  return (
    <section id="sky" className="sky" ref={rootRef} aria-hidden="true" data-sky="webgl2">
      <canvas ref={canvasRef} className="sky__canvas" />
    </section>
  );
}
