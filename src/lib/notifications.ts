// Desktop notifications when a device runs low: at 20 % (LOW_BATTERY), then again at 10 %, once
// each until it charges or climbs back up. What was notified is remembered across restarts, so
// reopening the app doesn't say it all again.

import { useEffect } from "react";
import { isTauri, type Device } from "./api";
import { LOW_BATTERY, isCharging } from "./app";
import type { Translate } from "./i18n";

const CRITICAL = 10;
/** Back above this (or charging), a device can be notified again. */
const RESET_ABOVE = LOW_BATTERY + 5;
const STORAGE_KEY = "devices.lowBatteryNotified";

/** The lowest level each device was notified at (20 or 10). */
function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function save(notified: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notified));
  } catch {
    // Not critical: at worst a notification comes again.
  }
}

/** Asks once if needed; false when notifications are refused. */
export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (!isTauri) return false;
  const n = await import("@tauri-apps/plugin-notification");
  if (await n.isPermissionGranted()) return true;
  return ask ? (await n.requestPermission()) === "granted" : false;
}

async function notify(title: string, body: string) {
  if (!(await notificationsAllowed(true))) return;
  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title, body });
}

/** Desktop app: watches the devices and notifies the ones that need charging. */
export function useLowBatteryNotifications(devices: Device[] | undefined, enabled: boolean, t: Translate) {
  useEffect(() => {
    if (!isTauri || !enabled || !devices) return;
    const notified = load();
    let changed = false;
    for (const d of devices) {
      const percent = d.battery?.percent;
      if (percent == null) continue;
      const charging = isCharging(d) || d.battery?.state === "full";
      if (charging || percent > RESET_ABOVE) {
        if (notified[d.id] !== undefined) {
          delete notified[d.id];
          changed = true;
        }
        continue;
      }
      const level = percent <= CRITICAL ? CRITICAL : percent <= LOW_BATTERY ? LOW_BATTERY : null;
      // Already told at this level (or a lower one).
      if (level === null || (notified[d.id] !== undefined && notified[d.id] <= level)) continue;
      notified[d.id] = level;
      changed = true;
      void notify(t(level === CRITICAL ? "batteryCriticalTitle" : "batteryLowTitle", { name: d.name }), t("batteryLowBody", { percent }));
    }
    if (changed) save(notified);
  }, [devices, enabled, t]);
}
