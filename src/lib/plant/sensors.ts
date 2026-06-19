// Shared sensor types and limits.
//
// This module is imported by BOTH the browser app and the Express server,
// so it must stay free of browser- or framework-specific imports.
//
// The hardware is intentionally minimal — two cheap sensors on an Arduino:
//   - moisture: capacitive soil moisture probe, reported as 0-100%
//   - light:    binary light sensor (LM393 module), reported as 0 or 100
//               (0 = dark, 100 = light detected). Values are kept on a 0-100
//               scale so the fallback slider and hardware share one shape.

export type PlantSensorKey = "moisture" | "light";

export interface PlantSensorReadings {
  moisture: number;
  light: number;
}

// Where a reading came from. "hardware" = a live Arduino value; "fallback" =
// the manual dashboard sliders (an estimate, not a measurement). Recorded on
// each observation so the model can weight the photo over slider-based numbers.
export type PlantSensorSource = "hardware" | "fallback";

export const DEFAULT_PLANT_SENSOR_READINGS: PlantSensorReadings = {
  moisture: 42,
  light: 100,
};

export const PLANT_SENSOR_LIMITS: Record<PlantSensorKey, { min: number; max: number }> = {
  moisture: { min: 0, max: 100 },
  light: { min: 0, max: 100 },
};

export function describeLightReading(light: number) {
  return light > 50 ? "on" : "off";
}
