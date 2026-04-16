import { createHash } from "node:crypto";

export function sha256Buffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function sha256ReadableStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const hash = createHash("sha256");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }

  return hash.digest("hex");
}
