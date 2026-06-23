import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { toRgb } from "./color";

// Full-bleed animated background for ambient mode. The shader is WebGL1-friendly
// and has a CSS gradient fallback for machines without reliable shader support.

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

  varying vec2 v_uv;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_seed;
  uniform vec3 u_color0;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_waveSpeed;
  uniform float u_waveFreqX;
  uniform float u_waveFreqY;
  uniform float u_waveAngle;
  uniform float u_waveAmplitude;
  uniform float u_maskSoftness;
  uniform float u_blendAmount;

  mat2 Rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  vec2 hash(vec2 p) {
    float s = u_seed;
    vec2 k1 = vec2(2127.1 + s * 13.37, 81.17 + s * 7.31);
    vec2 k2 = vec2(1269.5 + s * 11.13, 283.37 + s * 5.79);
    p = vec2(dot(p, k1), dot(p, k2));
    return fract(sin(p) * (43758.5453 + s * 1.618));
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(dot(-1.0 + 2.0 * hash(i), f),
          dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
    return 0.5 + 0.5 * n;
  }

  float seedF(float base) {
    return base * (1.0 + 0.5 * sin(u_seed * 3.17 + base));
  }

  vec2 warpUV(vec2 uv) {
    float t = u_time * u_waveSpeed;

    float angleOffset = sin(u_seed * 2.73) * 30.0;
    mat2 dirRot = Rot(radians(u_waveAngle + angleOffset));
    vec2 ruv = dirRot * uv;

    float fxMod = seedF(u_waveFreqX);
    float fyMod = seedF(u_waveFreqY);

    float phaseX = fract(sin(u_seed * 7.19) * 437.58) * 6.2832;
    float phaseY = fract(cos(u_seed * 3.41) * 291.37) * 6.2832;

    float harmonic = sin(u_seed * 1.23) * 0.5;
    float a = fyMod * ruv.y - sin(ruv.x * fxMod + ruv.y - t + phaseX);
    a += harmonic * sin(ruv.x * fxMod * 2.0 + ruv.y * 0.5 + t * 0.7 + phaseY);

    a = smoothstep(
      cos(a) * u_maskSoftness,
      sin(a) * u_maskSoftness + 3.,
      cos(a - fyMod * ruv.y) - sin(a - fxMod * ruv.x)
    );

    a *= u_waveAmplitude;

    uv = cos(a) * uv + sin(a) * vec2(-uv.y, uv.x);
    return uv;
  }

  void main() {
    vec2 fragCoord = v_uv * u_resolution;
    vec2 uv = fragCoord / u_resolution.xy;
    float ratio = u_resolution.x / u_resolution.y;
    float t = u_time * u_waveSpeed;

    vec2 tuv = uv - 0.5;

    vec2 seedShift = vec2(sin(u_seed * 4.37), cos(u_seed * 5.91)) * 100.0;
    float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) + seedShift);
    tuv.y *= 1.0 / ratio;
    tuv *= Rot(radians((degree - 0.5) * 720.0 + 180.0));
    tuv.y *= ratio;

    vec2 uv2 = (fragCoord * 2.0 - u_resolution.xy) / (u_resolution.x + u_resolution.y) * 2.0;
    float preRotAngle = fract(sin(u_seed * 5.63) * 173.29) * 6.2832;
    uv2 *= Rot(preRotAngle);
    vec2 warped = warpUV(uv2) * 0.5 + 0.5;

    vec2 blendUV = mix(tuv, warped - 0.5, u_blendAmount);

    float layerRot1 = -5.0 + sin(u_seed * 1.83) * 20.0;
    float layerRot2 = 10.0 + cos(u_seed * 2.47) * 20.0;

    vec3 c0 = u_color0;
    vec3 c1 = u_color1;
    vec3 c2 = u_color2;
    vec3 c3 = u_color3;

    vec3 layer1 = mix(c0, c2, smoothstep(-0.3, 0.3, (blendUV * Rot(radians(layerRot1))).x));
    vec3 layer2 = mix(c3, c1, smoothstep(-0.3, 0.3, (blendUV * Rot(radians(layerRot2))).x));
    vec3 col = mix(layer1, layer2, smoothstep(0.3, -0.3, blendUV.y));

    col = mix(col, col * col + 0.5 * sqrt(col), 0.3);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// The exact uniform values the published page set on this shader instance.
const PAGE_COLORS = ["rgb(221, 247, 254)", "rgb(57, 208, 250)", "rgb(4, 122, 253)", "rgb(49, 153, 255)"];
const PAGE_PARAMS = {
  seed: 27,
  waveSpeed: 1.83,
  waveFreqX: 2.1,
  waveFreqY: 1.8,
  waveAngle: 86,
  waveAmplitude: 1.2,
  maskSoftness: 0.59,
  blendAmount: 0.56,
};

interface WaveGradientBackgroundProps {
  colors?: string[];
  resolutionScale?: number;
  className?: string;
}

export function WaveGradientBackground({
  colors = PAGE_COLORS,
  resolutionScale = 0.75,
  className,
}: WaveGradientBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container: HTMLDivElement = containerRef.current;

    // Create a fresh canvas + context per mount — do NOT reuse a React-owned
    // <canvas>. Under StrictMode the effect runs twice (setup → cleanup →
    // setup); cleanup calls loseContext(), and a reused canvas would hand the
    // remount the same dead context, whose shaders then fail to compile with
    // no info log. Letting ogl make its own canvas each time avoids that.
    const renderer = new Renderer({
      alpha: true,
      webgl: 1,
      dpr: (window.devicePixelRatio || 1) * resolutionScale,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const usedColors = colors.slice(0, 4);
    const colorAt = (i: number) => toRgb(usedColors[i] ?? usedColors[usedColors.length - 1] ?? "#000");

    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: [1, 1] },
        u_seed: { value: PAGE_PARAMS.seed },
        u_color0: { value: colorAt(0) },
        u_color1: { value: colorAt(1) },
        u_color2: { value: colorAt(2) },
        u_color3: { value: colorAt(3) },
        u_waveSpeed: { value: PAGE_PARAMS.waveSpeed },
        u_waveFreqX: { value: PAGE_PARAMS.waveFreqX },
        u_waveFreqY: { value: PAGE_PARAMS.waveFreqY },
        u_waveAngle: { value: PAGE_PARAMS.waveAngle },
        u_waveAmplitude: { value: PAGE_PARAMS.waveAmplitude },
        u_maskSoftness: { value: PAGE_PARAMS.maskSoftness },
        u_blendAmount: { value: PAGE_PARAMS.blendAmount },
      },
    });

    // ogl only warns on a *non-empty* shader log, so an empty-log compile
    // failure would render nothing silently. Check the link explicitly; on
    // failure, bail and let the canvas's CSS gradient stand in.
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      console.error("Wave gradient shader failed to link — falling back to the CSS gradient.", {
        programLog: gl.getProgramInfoLog(program.program) || "(no info log)",
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "(unavailable)",
        fragmentHighpPrecision: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? null,
      });
      return;
    }

    container.appendChild(canvas);
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    function resize() {
      renderer.setSize(container.clientWidth, container.clientHeight);
      program.uniforms.u_resolution.value = [gl.canvas.width, gl.canvas.height];
    }
    window.addEventListener("resize", resize);
    resize();

    let rafId = 0;
    const render = (t: number) => {
      rafId = requestAnimationFrame(render);
      if (document.hidden) return; // don't render while the page/tab isn't visible
      resize();
      program.uniforms.u_time.value = t * 0.001;
      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      if (container.contains(canvas)) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [colors, resolutionScale]);

  // The CSS gradient matches the page's no-WebGL background — it shows before
  // the shader paints, and stays if the shader ever fails to compile.
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, rgb(38, 159, 255) 0%, rgb(146, 224, 255) 100%)",
      }}
    />
  );
}
