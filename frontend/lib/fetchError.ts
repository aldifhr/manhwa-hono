// Shared fetch error parser — single source for reader/transport + server-api
export function parseErrorMessage(status: number, text: string): string {
  let msg = `HTTP ${status}`;
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: string };
    if (typeof body.error === "string") return body.error;
    const nested = (body.error as { message?: string })?.message;
    if (typeof nested === "string" && nested) return nested;
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    if (text) return text.slice(0, 200);
  }
  return msg;
}
