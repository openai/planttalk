// Shared status glyphs for the action panels (Camera, Sensors, Observation
// loop, Voice). Each panel shows 👉 when there's an action to take, then flips
// to ✅ once it's on/done — a quick "what still needs a click" read across the
// top row of the dashboard.
export type ActionStatus = "todo" | "working" | "done" | "error" | "warn";

export function actionGlyph(status: ActionStatus): string {
  switch (status) {
    case "done":
      return "✅";
    case "working":
      return "⏳";
    case "error":
      return "❌";
    case "warn":
      return "⚠️";
    default:
      return "👉";
  }
}
