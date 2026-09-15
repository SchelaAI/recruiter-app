import type { Channel } from "./types";

/**
 * Simple heuristic: WhatsApp dominates professional messaging almost everywhere
 * except North America, where email is still the default. This is what
 * "recommend communication channel automatically" means in practice for a v1 —
 * a real implementation would factor in response-rate history per region.
 */
export function recommendChannel(countryCode: string): Channel {
  return countryCode === "+1" ? "em" : "wa";
}
