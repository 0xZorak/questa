"use client";
import { useEffect, useRef } from "react";

/* ── Vertex shader — fullscreen quad, outputs v_uv ── */
const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/* ── Fragment shader — brand-coloured morph ── */
const FRAG = `
precision mediump float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
varying vec2  v_uv;

#define PI 3.14159265359

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),               hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

mat2 rot2d(float a) {
  float s = sin(a); float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  uv = (uv - 0.5) * aspect;

  float mouseInfluence = length(u_mouse - v_uv) * 2.0;

  vec3 color = vec3(0.0);

  for (float i = 0.0; i < 3.0; i++) {
    vec2 p = uv;
    float t = u_time * 0.5 + i * PI * 2.0 / 3.0;

    p *= rot2d(t * 0.3);
    p *= 1.0 + sin(t) * 0.2;
    p *= 5.0 + sin(mouseInfluence * PI) * 2.0;

    float n  = noise(p + t);
    float n2 = noise(p * 2.0 - t);

    float shape = sin(n * 5.0 + t) * cos(n2 * 4.0 - t);
    shape = abs(shape);
    shape = smoothstep(0.2 + mouseInfluence * 0.3, 0.21, shape);

    /* Brand palette — sage / amber / beige */
    vec3 col = vec3(0.678, 0.776, 0.639);   /* #ADC6A3 sage  */
    if (i == 1.0) col = vec3(0.725, 0.459, 0.169);  /* #B9752B amber */
    if (i == 2.0) col = vec3(0.867, 0.839, 0.773);  /* #DDD6C5 beige */

    color += shape * col;
  }

  /* #180E02 dark-brown base */
  color = mix(vec3(0.094, 0.055, 0.008), color, 1.0);
  color += noise(uv * 100.0) * 0.02;

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function MorphingCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: 0.5, y: 0.5 });
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    /* Fullscreen quad — 2 triangles */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uRes   = gl.getUniformLocation(prog, "u_resolution");

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - r.left) / r.width,
        y: 1 - (e.clientY - r.top) / r.height,
      };
    };
    canvas.addEventListener("mousemove", onMove);

    const t0 = performance.now();
    const render = () => {
      const t = (performance.now() - t0) / 1000;
      gl.uniform1f(uTime,  t);
      gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
      gl.uniform2f(uRes,   canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
