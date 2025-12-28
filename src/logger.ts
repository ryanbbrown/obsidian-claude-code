/** Simplified logger - console only */
import { getSettings } from "@/settings/model";

export function logInfo(...args: unknown[]) {
  if (getSettings().debug) {
    console.log(...args);
  }
}

export function logError(...args: unknown[]) {
  console.error(...args);
}

export function logWarn(...args: unknown[]) {
  if (getSettings().debug) {
    console.warn(...args);
  }
}
