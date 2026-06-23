import { chmodSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIN_NODE = [20, 12, 0];
const envPath = resolve(".env");
const envExamplePath = resolve(".env.example");

function parseVersion(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function isNodeSupported() {
  const current = parseVersion(process.versions.node);
  for (let i = 0; i < MIN_NODE.length; i += 1) {
    if (current[i] > MIN_NODE[i]) return true;
    if (current[i] < MIN_NODE[i]) return false;
  }
  return true;
}

function hasConfiguredApiKey(contents) {
  const match = contents.match(/^OPENAI_API_KEY=(.*)$/m);
  if (!match) return false;
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  return value.length > 0 && value !== "replace-me";
}

console.log("Plant Talk setup");

if (!isNodeSupported()) {
  console.error(`Node ${process.versions.node} is installed, but Plant Talk needs Node 20.12 or newer.`);
  console.error("Install a current Node.js LTS release, then run `npm run setup` again.");
  process.exit(1);
}

console.log(`Node ${process.versions.node} looks good.`);

if (!existsSync(envExamplePath)) {
  console.error("Could not find .env.example. Run this command from the Plant Talk repo root.");
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(envExamplePath, envPath);
  chmodSync(envPath, 0o600);
  console.log(`Created ${envPath}`);
} else {
  console.log(`Found existing ${envPath}; leaving it unchanged.`);
}

const envContents = readFileSync(envPath, "utf8");

if (hasConfiguredApiKey(envContents)) {
  console.log("OpenAI API access appears configured. The key was not printed.");
} else {
  console.log("OpenAI API access still needs to be added.");
  console.log("If you do not have a key yet, sign in at https://platform.openai.com/api-keys.");
  console.log(`Open ${envPath} and replace replace-me with your OpenAI API key.`);
  console.log("Do not paste the key into chat.");
}
