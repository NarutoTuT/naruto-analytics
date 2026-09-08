import { timingSafeEqual } from "node:crypto";
export function requireInternal(
  request: Request,
  key: "CRON_SECRET" | "INTERNAL_ADMIN_SECRET",
) {
  const secret = process.env[key];
  const supplied = request.headers.get("authorization") || "";
  if (!secret) throw new Response("Service not configured", { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Response("Unauthorized", { status: 401 });
}
