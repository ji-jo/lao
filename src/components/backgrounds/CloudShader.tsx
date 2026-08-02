import { useEffect, useRef } from 'react';

export type Cloud = {
  color: string;
  shadowColor: string;
  skyTop: string;
  skyBottom: string;
  coverage: number;
  density: number;
  brightness: number;
  detail: number;
  variation: number;
  warpAmount: number;
  warpScale: number;
  stretch: number;
  phase: number;
  speed: number;
  x: number;
  y: number;
  scale: number;
  angle: number;
};

export const defaultCloud: Cloud = {
  color: '#FFFFFF',
  shadowColor: '#FFFFFF',
  skyTop: '#9ECDDE',
  skyBottom: '#648EBC',
  coverage: 86,
  density: 53,
  brightness: 75,
  detail: 100,
  variation: 63,
  warpAmount: 53,
  warpScale: 29,
  stretch: 0,
  phase: 0,
  speed: 1.5,
  x: 50,
  y: 42,
  scale: 135,
  angle: 0,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const degToRad = (d: number) => (d * Math.PI) / 180;

function parseHex(hex: string): [number, number, number] {
  let h = (hex || '#000000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h.slice(0, 6) || '000000', 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

let _colorCtx: CanvasRenderingContext2D | null = null;
function colorRGB(str: string): [number, number, number] {
  if (typeof document === 'undefined') {
    const [r, g, b] = parseHex(str);
    return [r / 255, g / 255, b / 255];
  }
  if (!_colorCtx) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _colorCtx = c.getContext('2d');
  }
  if (!_colorCtx) {
    const [r, g, b] = parseHex(str);
    return [r / 255, g / 255, b / 255];
  }
  _colorCtx.fillStyle = '#000000';
  _colorCtx.fillStyle = str || '#000000';
  _colorCtx.fillRect(0, 0, 1, 1);
  const d = _colorCtx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

const CLOUD_VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes; uniform float uTime;
  uniform vec3 uCloudColor, uShadowColor, uSkyTop, uSkyBottom;
  uniform float uCoverage, uDensity, uBrightness, uDetail, uVariation, uWarpAmount, uWarpScale, uStretch, uPhase;
  uniform vec2 uPos; uniform float uScale, uAngle;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p, int oct){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 8; i++){
          if (i >= oct) break;
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
      }
      return v;
  }
  void main() {
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      float asp = uRes.x / uRes.y;
      vec2 c = (uv - 0.5) * vec2(asp, 1.0);

      c -= (uPos - 0.5) * vec2(asp, 1.0);
      float ang = -uAngle;
      mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      c = rot * c;
      c /= max(0.05, uScale);
      c.y *= mix(1.0, 2.6, clamp(uStretch, 0.0, 1.0));

      vec2 p = c * (2.0 + uWarpScale * 3.0);
      float t = uTime * 0.05 + uPhase;
      int oct = int(clamp(2.0 + uDetail * 6.0, 2.0, 8.0));

      vec2 warp = (vec2(fbm(p + t, oct), fbm(p - t + 5.2, oct)) - 0.5) * uWarpAmount * 2.0;
      float n = fbm(p + warp + vec2(t * 0.6, 0.0), oct);
      float variTex = noise(p * 4.0 + t * 1.3);
      n = mix(n, n * 0.5 + variTex * 0.5, clamp(uVariation, 0.0, 1.0));

      float cov = mix(-0.4, 0.6, clamp(uCoverage, 0.0, 1.0));
      float dens = mix(1.0, 6.0, clamp(uDensity, 0.0, 1.0));
      float cloud = smoothstep(cov, cov + 1.0 / dens, n);

      float nShadow = fbm(p + warp + vec2(t * 0.6, 0.06), oct);
      float cloudShadow = smoothstep(cov, cov + 1.0 / dens, nShadow);
      float shade = clamp(cloud - cloudShadow * 0.6, 0.0, 1.0);

      vec3 sky = mix(uSkyBottom, uSkyTop, clamp(uv.y, 0.0, 1.0));
      vec3 cloudCol = mix(uShadowColor, uCloudColor, shade);
      vec3 col = mix(sky, cloudCol, cloud);
      col *= mix(0.6, 1.4, clamp(uBrightness, 0.0, 1.0));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

interface CloudShaderProps {
  cloud?: Partial<Cloud>;
  className?: string;
}

export default function CloudShader({ cloud, className }: CloudShaderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cloudRef = useRef<Cloud>({ ...defaultCloud, ...cloud });
  cloudRef.current = { ...defaultCloud, ...cloud };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = (canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    }) || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    if (!gl) {
      canvas.style.display = 'none';
      wrap.style.background = `linear-gradient(180deg, ${cloudRef.current.skyTop}, ${cloudRef.current.skyBottom})`;
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, CLOUD_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, CLOUD_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.style.display = 'none';
      wrap.style.background = `linear-gradient(180deg, ${cloudRef.current.skyTop}, ${cloudRef.current.skyBottom})`;
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = U('uRes'), uTime = U('uTime');
    const uCloudColor = U('uCloudColor'), uShadowColor = U('uShadowColor'), uSkyTop = U('uSkyTop'), uSkyBottom = U('uSkyBottom');
    const uCoverage = U('uCoverage'), uDensity = U('uDensity'), uBrightness = U('uBrightness'), uDetail = U('uDetail');
    const uVariation = U('uVariation'), uWarpAmount = U('uWarpAmount'), uWarpScale = U('uWarpScale'), uStretch = U('uStretch'), uPhase = U('uPhase');
    const uPos = U('uPos'), uScale = U('uScale'), uAngle = U('uAngle');

    const resize = () => {
      const w = Math.max(2, Math.round(canvas.clientWidth * 0.5));
      const h = Math.max(2, Math.round(canvas.clientHeight * 0.5));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize, { passive: true });

    const render = (t: number) => {
      resize();
      const cl = cloudRef.current;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t * (cl.speed ?? 1));
      gl.uniform3fv(uCloudColor, colorRGB(cl.color));
      gl.uniform3fv(uShadowColor, colorRGB(cl.shadowColor));
      gl.uniform3fv(uSkyTop, colorRGB(cl.skyTop));
      gl.uniform3fv(uSkyBottom, colorRGB(cl.skyBottom));
      gl.uniform1f(uCoverage, clamp01(cl.coverage / 100));
      gl.uniform1f(uDensity, clamp01(cl.density / 100));
      gl.uniform1f(uBrightness, clamp01(cl.brightness / 100));
      gl.uniform1f(uDetail, clamp01(cl.detail / 100));
      gl.uniform1f(uVariation, clamp01(cl.variation / 100));
      gl.uniform1f(uWarpAmount, Math.max(0, cl.warpAmount / 100));
      gl.uniform1f(uWarpScale, Math.max(0, cl.warpScale / 100));
      gl.uniform1f(uStretch, clamp01(cl.stretch / 100));
      gl.uniform1f(uPhase, (cl.phase / 100) * Math.PI * 2);
      gl.uniform2f(uPos, cl.x / 100, cl.y / 100);
      gl.uniform1f(uScale, Math.max(0.05, cl.scale / 100));
      gl.uniform1f(uAngle, degToRad(cl.angle));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Always paint one frame synchronously (never blank on a background tab or static export).
    render(0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      return () => {
        window.removeEventListener('resize', resize);
        gl.deleteProgram(prog);
        gl.deleteBuffer(buf);
      };
    }

    let paused = false;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { paused = !e.isIntersecting || document.hidden; }),
      { threshold: 0 }
    );
    observer.observe(wrap);
    const onVis = () => {
      const rect = wrap.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < window.innerHeight;
      paused = document.hidden || !inView;
    };
    document.addEventListener('visibilitychange', onVis);

    let raf = 0;
    let dead = false;
    const start = performance.now();
    const loop = () => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      if (paused) return;
      render((performance.now() - start) / 1000);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`absolute inset-0 w-full h-full overflow-hidden ${className ?? ''}`} aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-full block" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
