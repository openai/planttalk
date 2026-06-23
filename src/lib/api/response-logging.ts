import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const apiLogsDirectoryPath = path.join(process.cwd(), "logs");

export function createResponseLogFilename(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  // Millisecond suffix prevents two responses landing in the same second from
  // overwriting each other.
  const millisecond = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}${month}${day}${hour}${minute}${second}${millisecond}.json`;
}

export function writeApiResponseLog(payload: unknown) {
  const fileName = createResponseLogFilename();
  const filePath = path.join(apiLogsDirectoryPath, fileName);
  const fileBody = `${JSON.stringify(payload, null, 2)}\n`;

  void mkdir(apiLogsDirectoryPath, { recursive: true })
    .then(() => writeFile(filePath, fileBody, "utf8"))
    .catch((error) => {
      console.error("Failed to write API response log:", error);
    });
}

export function jsonResponseWithLog(payload: unknown, init?: ResponseInit) {
  writeApiResponseLog(payload);
  return Response.json(payload, init);
}
