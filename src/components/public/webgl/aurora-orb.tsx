import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { toRgb } from "./color";

// Animated WebGL orb for ambient mode. The component stays self-contained so
// the dashboard can keep its simpler PicoCSS styling.

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

  uniform float iTime;
  uniform vec3 iResolution;
  uniform vec3 color1;
  uniform vec3 color2;
  uniform vec3 color3;
  uniform float hover;
  uniform float rot;
  uniform float hoverIntensity;
  varying vec2 vUv;

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
      p3.x + p3.y,
      p3.x + p3.z,
      p3.y + p3.z
    ) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
      dot(d0, d0),
      dot(d1, d1),
      dot(d2, d2),
      dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }

  const float innerRadius = 0.6;
  const float noiseScale = 0.65;

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }
  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 draw(vec2 uv) {
    vec3 baseColor1 = color1;
    vec3 baseColor2 = color2;
    vec3 baseColor3 = color3;

    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);
    v0 *= smoothstep(r0 * 1.05, r0, len);
    float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 col = mix(baseColor1, baseColor2, cl);
    col = mix(baseColor3, col, v0);
    col = (col + v1) * v2 * v3;
    col = clamp(col, 0.0, 1.0);

    return extractAlpha(col);
  }

  vec4 mainImage(vec2 fragCoord) {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord - center) / size * 2.0;

    float angle = rot;
    float s = sin(angle);
    float c = cos(angle);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

    return draw(uv);
  }

  void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec4 col = mainImage(fragCoord);
    gl_FragColor = vec4(col.rgb * col.a, col.a);
  }
`;

const PALETTES = {
  purple: ["#9C43FE", "#4CC2E9", "#101499"],
  ocean: ["#00D4FF", "#0099CC", "#003D5C"],
  sunset: ["#FF6B35", "#F7931E", "#C1292E"],
  forest: ["#2ECC71", "#27AE60", "#145A32"],
  fire: ["#FF4500", "#FF8C00", "#8B0000"],
} as const;

export type AuroraPalette = keyof typeof PALETTES;

interface AuroraOrbProps {
  colorMode?: "palette" | "custom";
  palette?: AuroraPalette;
  color1?: string;
  color2?: string;
  color3?: string;
  opacity?: number;
  hoverIntensity?: number;
  rotateOnHover?: boolean;
  active?: boolean;
  className?: string;
}

export function AuroraOrb({
  colorMode = "palette",
  palette = "purple",
  color1 = "#9C43FE",
  color2 = "#4CC2E9",
  color3 = "#101499",
  opacity = 1,
  hoverIntensity = 0.2,
  rotateOnHover = true,
  active = false,
  className,
}: AuroraOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `active` is read inside the render loop, so keep it in a ref to avoid
  // re-initializing WebGL every time it flips.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!containerRef.current) return;
    const container: HTMLDivElement = containerRef.current;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: false,
      webgl: 1,
      dpr: window.devicePixelRatio || 1,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const colors = colorMode === "palette" ? PALETTES[palette] : [color1, color2, color3];
    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: [1, 1, 1] },
        color1: { value: toRgb(colors[0], [1, 1, 1]) },
        color2: { value: toRgb(colors[1], [1, 1, 1]) },
        color3: { value: toRgb(colors[2], [1, 1, 1]) },
        hover: { value: 0 },
        rot: { value: 0 },
        hoverIntensity: { value: hoverIntensity },
      },
    });

    // ogl only warns on a *non-empty* shader log, so an empty-log compile
    // failure would render nothing silently. Check the link explicitly and
    // bail (leaving the page's gradient) with a useful message.
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      console.error(
        "Aurora orb shader failed to link — orb disabled. Program log:",
        gl.getProgramInfoLog(program.program),
      );
      if (container.contains(canvas)) container.removeChild(canvas);
      return;
    }

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    function resize() {
      renderer.setSize(container.clientWidth, container.clientHeight);
      program.uniforms.iResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
    }
    window.addEventListener("resize", resize);
    resize();

    let targetHover = 0;
    let currentHover = 0;
    let currentRot = 0;
    let lastTime = 0;
    const rotationSpeed = 0.3;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      const uvX = ((e.clientX - rect.left - rect.width / 2) / size) * 2;
      const uvY = ((e.clientY - rect.top - rect.height / 2) / size) * 2;
      targetHover = Math.sqrt(uvX * uvX + uvY * uvY) < 0.8 ? 1 : 0;
    };
    const handleMouseLeave = () => {
      targetHover = 0;
    };
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    let rafId = 0;
    const update = (t: number) => {
      rafId = requestAnimationFrame(update);
      if (document.hidden) return; // don't render while the page/tab isn't visible
      const dt = (t - lastTime) * 0.001;
      lastTime = t;
      const effectiveHover = activeRef.current ? 1 : targetHover;
      currentHover += (effectiveHover - currentHover) * 0.1;
      if ((rotateOnHover || activeRef.current) && effectiveHover > 0.5) {
        currentRot += dt * rotationSpeed;
      }
      program.uniforms.iTime.value = t * 0.001;
      program.uniforms.hover.value = currentHover;
      program.uniforms.rot.value = currentRot;
      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (container.contains(canvas)) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [colorMode, palette, color1, color2, color3, hoverIntensity, rotateOnHover]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", opacity }} />;
}
