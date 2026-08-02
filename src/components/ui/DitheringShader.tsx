import { useEffect, useRef } from 'react';

interface DitheringShaderProps {
  colorBack?: string;
  colorFront?: string;
  shape?: 'sphere' | 'box' | 'torus';
  type?: 'ordered' | 'random';
  pxSize?: number;
  speed?: number;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
    : [0, 0, 0];
}

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colorBack;
uniform vec3 u_colorFront;
uniform float u_pxSize;
uniform int u_shape;  // 0=sphere, 1=box, 2=torus
uniform int u_type;   // 0=ordered, 1=random

float bayer2(vec2 p) {
  p = floor(p);
  return fract(dot(p, vec2(0.5, p.y * 0.75)));
}
float bayer4(vec2 p)  { return bayer2(p * 0.5) * 0.25 + bayer2(p); }
float bayer8(vec2 p)  { return bayer4(p * 0.5) * 0.25 + bayer2(p); }
float bayer16(vec2 p) { return bayer8(p * 0.5) * 0.25 + bayer2(p); }

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// SDF shapes
float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float map(vec3 p) {
  if (u_shape == 1) return sdBox(p, vec3(0.55));
  if (u_shape == 2) return sdTorus(p, vec2(0.55, 0.22));
  return sdSphere(p, 0.7);
}

vec3 calcNormal(vec3 p) {
  float e = 0.001;
  return normalize(vec3(
    map(p + vec3(e,0,0)) - map(p - vec3(e,0,0)),
    map(p + vec3(0,e,0)) - map(p - vec3(0,e,0)),
    map(p + vec3(0,0,e)) - map(p - vec3(0,0,e))
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

  // Rotate camera slowly
  float t = u_time * 0.4;
  vec3 ro = vec3(sin(t) * 1.8, 0.4, cos(t) * 1.8);
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0,1,0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // Raymarch
  float dist = 0.0;
  float brightness = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * dist;
    float d = map(p);
    if (d < 0.001) {
      vec3 n = calcNormal(p);
      vec3 light = normalize(vec3(1.5, 2.0, 1.0));
      float diff = max(dot(n, light), 0.0);
      float amb = 0.15;
      brightness = amb + diff * 0.85;
      break;
    }
    dist += d;
    if (dist > 10.0) break;
  }

  // Dithering
  vec2 ditherCoord = gl_FragCoord.xy / u_pxSize;
  float threshold;
  if (u_type == 1) {
    threshold = rand(floor(ditherCoord) + u_time * 0.01);
  } else {
    threshold = bayer16(ditherCoord);
  }

  float dithered = step(threshold, brightness);
  vec3 col = mix(u_colorBack, u_colorFront, dithered);

  gl_FragColor = vec4(col, 1.0);
}`;

function createShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export function DitheringShader({
  colorBack = '#0E0E0E',
  colorFront = '#6B97FF',
  shape = 'sphere',
  type = 'ordered',
  pxSize = 3,
  speed = 1,
  className = '',
}: DitheringShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs!);
    gl.attachShader(prog, fs!);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(prog, 'u_resolution');
    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uBack  = gl.getUniformLocation(prog, 'u_colorBack');
    const uFront = gl.getUniformLocation(prog, 'u_colorFront');
    const uPx    = gl.getUniformLocation(prog, 'u_pxSize');
    const uShape = gl.getUniformLocation(prog, 'u_shape');
    const uType  = gl.getUniformLocation(prog, 'u_type');

    const shapeMap = { sphere: 0, box: 1, torus: 2 };
    const typeMap  = { ordered: 0, random: 1 };
    const rgbBack  = hexToRgb(colorBack);
    const rgbFront = hexToRgb(colorFront);

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let start = performance.now();

    const render = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform3fv(uBack, rgbBack);
      gl.uniform3fv(uFront, rgbFront);
      gl.uniform1f(uPx, pxSize);
      gl.uniform1i(uShape, shapeMap[shape]);
      gl.uniform1i(uType, typeMap[type]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [colorBack, colorFront, shape, type, pxSize, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full ${className}`}
      style={{ display: 'block' }}
    />
  );
}
