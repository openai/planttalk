// Parse a CSS hex (`#rrggbb`) or `rgb()/rgba()` color string into normalized
// RGB components in 0..1, ready to hand to a WebGL uniform.
export function toRgb(color: string, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hex) {
    return [parseInt(hex[1], 16) / 255, parseInt(hex[2], 16) / 255, parseInt(hex[3], 16) / 255];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(color);
  if (rgb) {
    const parts = rgb[1].split(",").map((n) => parseFloat(n.trim()));
    return [(parts[0] || 0) / 255, (parts[1] || 0) / 255, (parts[2] || 0) / 255];
  }
  return fallback;
}
