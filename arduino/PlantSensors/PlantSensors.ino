// PlantSensors — minimal firmware for the Plant Talk project.
//
// Reads two cheap sensors and prints one JSON line over serial:
//   {"moisture":0.42,"light":1.00}
//
//   moisture : capacitive soil moisture, normalized 0.0 (dry) – 1.0 (saturated)
//   light    : binary light sensor, 0.0 (dark) or 1.0 (light detected)
//
// The browser connects over the Web Serial API (115200 baud) and scales the
// fractions to 0–100%. No libraries required — works on any Uno/Nano/Mega.
//
// === Wiring ===
//
// Capacitive soil moisture sensor (DFRobot SEN0193 or compatible clone)
//   Signal → A0   (yellow wire)
//   VCC    → 5V   (red wire — NE555 clones require 5V; 3.3V won't start the oscillator)
//   GND    → GND  (black wire)
//
//   ⚠️  CLONE PINOUT WARNING: many NE555 clones have the VCC and Signal
//   silkscreen labels SWAPPED on the PCB. If you get all-zero or constant
//   readings, try swapping the VCC and Signal wires. GND is always correct
//   (the outermost pin near the probe end).
//
//   ⚠️  HIGH FAILURE RATE: from cheap batches expect some dead sensors —
//   a dead one pulls A0 to 0 and never responds to moisture. A working one
//   reads roughly 300–500 in dry air and DROPS when submerged (capacitive
//   sensors are inverted: lower ADC = wetter).
//
// LM393 light sensor module (LDR + comparator, digital output)
//   DO  → D8
//   VCC → 5V
//   GND → GND
//
//   DO is HIGH when dark and LOW when light is present (inverted below).
//   Adjust the onboard potentiometer to set the on/off threshold.
//
// === Calibration ===
//   1. Upload, open a serial monitor at 115200, send: calibrate
//   2. Hold the probe in open air → note the stable raw value → AIR_VALUE
//   3. Submerge to the white line in water → note the value → WATER_VALUE
//   4. Update the two defines below and re-upload. Send: calibrate to exit.
//   (If your dry-to-wet range is under ~100 counts you likely have an NE555
//   clone — it still works, the multi-sample averaging below compensates.)
//
// === Serial Commands (newline-terminated) ===
//   interval <ms>  set the reporting interval (100–60000, default 1000)
//   read           force an immediate reading
//   calibrate      toggle rapid raw-ADC output for calibration
//   status         print the current configuration

// --- Calibration values: measure these with YOUR sensor (see above) ---
#define AIR_VALUE 398   // ADC reading in dry air
#define WATER_VALUE 56  // ADC reading submerged in water

// Multi-sample averaging reduces NE555 jitter.
#define SAMPLES 16

#define MOISTURE_PIN A0
#define LIGHT_PIN 8

unsigned long lastUpdate = 0;
unsigned long SERIAL_INTERVAL = 1000;
bool calibrateMode = false;

char cmdBuffer[64];
int cmdLen = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LIGHT_PIN, INPUT);
  Serial.println(F("{\"status\":\"PlantSensors ready\"}"));
}

void loop() {
  updateSensors();
  processCommands();
}

void updateSensors() {
  unsigned long interval = calibrateMode ? 200 : SERIAL_INTERVAL;
  if (millis() - lastUpdate < interval) return;
  lastUpdate = millis();

  // Average several ADC samples to smooth out oscillator jitter.
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(MOISTURE_PIN);
  }
  int raw = (int)(sum / SAMPLES);

  if (calibrateMode) {
    Serial.print(F("{\"raw\":"));
    Serial.print(raw);
    Serial.println(F("}"));
    return;
  }

  // Normalize: AIR_VALUE (dry) → 0.0, WATER_VALUE (wet) → 1.0, clamped.
  float moisture = (float)(AIR_VALUE - raw) / (float)(AIR_VALUE - WATER_VALUE);
  if (moisture < 0.0) moisture = 0.0;
  if (moisture > 1.0) moisture = 1.0;

  // LM393 DO: HIGH = dark, LOW = light present.
  float light = (digitalRead(LIGHT_PIN) == LOW) ? 1.0 : 0.0;

  Serial.print(F("{\"moisture\":"));
  Serial.print(moisture, 2);
  Serial.print(F(",\"light\":"));
  Serial.print(light, 2);
  Serial.println(F("}"));
}

void processCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (cmdLen > 0) {
        cmdBuffer[cmdLen] = '\0';
        handleCommand(cmdBuffer);
        cmdLen = 0;
      }
    } else if (cmdLen < 63) {
      cmdBuffer[cmdLen++] = c;
    }
  }
}

void handleCommand(const char* cmd) {
  if (strncmp(cmd, "interval ", 9) == 0) {
    long val = atol(cmd + 9);
    if (val >= 100 && val <= 60000) {
      SERIAL_INTERVAL = (unsigned long)val;
      Serial.print(F("{\"ack\":\"interval set to "));
      Serial.print(val);
      Serial.println(F("\"}"));
    } else {
      Serial.println(F("{\"error\":\"interval must be 100-60000 ms\"}"));
    }
  } else if (strcmp(cmd, "read") == 0) {
    lastUpdate = 0;  // force an immediate reading
  } else if (strcmp(cmd, "calibrate") == 0) {
    calibrateMode = !calibrateMode;
    Serial.println(calibrateMode
      ? F("{\"ack\":\"calibrate ON - raw ADC every 200ms. Note air + water values, update the defines.\"}")
      : F("{\"ack\":\"calibrate OFF\"}"));
  } else if (strcmp(cmd, "status") == 0) {
    Serial.print(F("{\"status\":{\"serial_interval\":"));
    Serial.print(SERIAL_INTERVAL);
    Serial.print(F(",\"air_value\":"));
    Serial.print(AIR_VALUE);
    Serial.print(F(",\"water_value\":"));
    Serial.print(WATER_VALUE);
    Serial.println(F("}}"));
  } else {
    Serial.println(F("{\"error\":\"unknown command\"}"));
  }
}
