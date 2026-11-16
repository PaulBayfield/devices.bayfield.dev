// Whether a newer Devices is out. The server asks GitHub and caches the answer (see server/src/updates.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { api, isTauri, type UpdateStatus } from "./api";
import { invalidate, useApi } from "./hooks";

const PATH = "/app/updates";

export function useUpdateCheck() {
  const loaded = useApi<UpdateStatus>(PATH);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  /** Asks GitHub again, skipping the server's cache. */
  const check = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      await api<UpdateStatus>(`${PATH}?refresh=1`);
      invalidate(PATH);
      loaded.reload();
    } catch (e) {
      setCheckError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, [loaded.reload]);

  const status = loaded.data;
  return {
    status,
    checking: checking || (loaded.loading && !status),
    error: checkError ?? status?.error ?? loaded.error,
    check,
  };
}

export type UpdateCheck = ReturnType<typeof useUpdateCheck>;

// ---------- The desktop app's own updates ----------
//
// The server above says whether a newer Devices is out; the desktop app checks its own version
// against the signed release (latest.json) and installs it in place: same folder, so shortcuts
// and the taskbar pin stay.

export type DesktopUpdate =
  | { status: "checking" | "upToDate" | "error" | "installing" }
  | { status: "available"; version: string }
  /** `progress` is 0–1, or null while the size isn't known yet. */
  | { status: "downloading"; version: string; progress: number | null };

export function useDesktopUpdate() {
  const [state, setState] = useState<DesktopUpdate>({ status: "checking" });
  const pending = useRef<import("@tauri-apps/plugin-updater").Update | null>(null);

  const check = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      pending.current = update;
      setState(update ? { status: "available", version: update.version } : { status: "upToDate" });
    } catch (e) {
      console.error("Update check failed", e);
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (isTauri) void check();
  }, [check]);

  /** Downloads it, stops the agent (whose files the installer replaces), installs and restarts. */
  const install = useCallback(async () => {
    const update = pending.current;
    if (!update) return;
    try {
      let total = 0;
      let received = 0;
      setState({ status: "downloading", version: update.version, progress: null });
      await update.download((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          received += e.data.chunkLength;
          setState({ status: "downloading", version: update.version, progress: total ? Math.min(received / total, 1) : null });
        }
      });
      setState({ status: "installing" });
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("agent_stop");
      // On Windows the installer closes the app and opens it again when it's done.
      await update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("Update failed", e);
      setState({ status: "error" });
    }
  }, []);

  return { state, check, install };
}
