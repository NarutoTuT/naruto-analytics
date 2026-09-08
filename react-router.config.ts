import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  // Keep the standard server entry for local and Docker startup.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
