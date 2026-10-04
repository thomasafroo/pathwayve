"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  saveRequestSchema,
  type SaveRequest,
  type ScheduleDocument,
} from "@/types/schedule";
import type { WorkspaceTrip } from "@/types/workspace";

const pendingKey = "pathwayve.pending-save.v1";
type Snapshot = {
  document: ScheduleDocument | null;
  workspace: WorkspaceTrip | null;
};
type Summary = { id: string; name: string; starts_at: string; status: string };

export function AccountControls({
  snapshot,
  busy,
  onOpen,
  onSignOut,
}: {
  snapshot: Snapshot;
  busy: boolean;
  // persisted: the snapshot is stored in the account (not a restored draft).
  onOpen: (snapshot: Snapshot, persisted: boolean) => void;
  onSignOut: () => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loginReason, setLoginReason] = useState("Log in to PathWayve");
  const [saved, setSaved] = useState<Summary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const loginDialog = useRef<HTMLDialogElement>(null);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<SaveRequest | null>(null);
  const restored = useRef(false);
  const previousUser = useRef<string | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ snapshot, onOpen, onSignOut });
  useEffect(() => {
    latest.current = { snapshot, onOpen, onSignOut };
  });
  const canSave = !!(snapshot.document || snapshot.workspace);

  async function save(payload: SaveRequest) {
    if (inFlight.current) return;
    const requestingUser = previousUser.current;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (requestingUser !== previousUser.current) return;
      if (response.status === 401) {
        pending.current = payload;
        sessionStorage.setItem(
          pendingKey,
          JSON.stringify({ payload, autoSave: true }),
        );
        setLoginReason("Log in to save this schedule");
        loginDialog.current?.showModal();
        return;
      }
      if (!response.ok)
        throw new Error(data.error?.message || "Unable to save. Try again.");
      sessionStorage.removeItem(pendingKey);
      pending.current = null;
      latest.current.onOpen(data, true);
      setNotice("Saved to your account.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save. Try again.",
      );
    } finally {
      setWorking(false);
      inFlight.current = false;
    }
  }

  useEffect(() => {
    if (isPending) return;
    const userId = session?.user.id ?? null;
    if (previousUser.current && previousUser.current !== userId) {
      latest.current.onSignOut();
      libraryDialog.current?.close();
      pending.current = null;
      sessionStorage.removeItem(pendingKey);
      void Promise.resolve().then(() => {
        setSaved([]);
        setNotice("");
        setError("");
      });
    }
    previousUser.current = userId;
    if (restored.current) return;
    restored.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const returned = params.get("auth");
      try {
        const stored = sessionStorage.getItem(pendingKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          const payload = saveRequestSchema.parse(parsed.payload);
          pending.current = payload;
          latest.current.onOpen(payload, false);
          if (returned === "complete" && userId && parsed.autoSave)
            await save(payload);
          else if (returned)
            setNotice(
              "Your schedule is still here. Press Save schedule when you’re ready.",
            );
        }
        if (returned === "error")
          setError(
            "Google sign-in was cancelled or could not finish. Your schedule has been kept; try again.",
          );
      } catch {
        setError(
          "The pending schedule could not be restored. Please create it again.",
        );
      } finally {
        if (returned) {
          params.delete("auth");
          params.delete("error");
          params.delete("error_description");
          window.history.replaceState(
            null,
            "",
            window.location.pathname + (params.size ? `?${params}` : ""),
          );
        }
      }
    })();
    // Restore once after session resolution, including after Google's redirect.
  }, [isPending, session?.user.id]);

  function prepare(autoSave: boolean) {
    const current = latest.current.snapshot;
    if (!current.document && !current.workspace) return;
    const same =
      pending.current &&
      JSON.stringify({
        document: pending.current.document,
        workspace: pending.current.workspace,
      }) === JSON.stringify(current);
    const payload = same
      ? pending.current!
      : { ...current, requestId: crypto.randomUUID() };
    // Store before leaving this page; never redirect if storage fails.
    sessionStorage.setItem(pendingKey, JSON.stringify({ payload, autoSave }));
    pending.current = payload;
    return payload;
  }
  function requestLogin(signUp = false) {
    setError("");
    setLoginReason(
      signUp ? "Create your PathWayve account" : "Log in to PathWayve",
    );
    loginDialog.current?.showModal();
  }
  async function saveClick() {
    setError("");
    try {
      const payload = prepare(true);
      if (!payload) return;
      if (session) await save(payload);
      else {
        setLoginReason("Log in to save this schedule");
        loginDialog.current?.showModal();
      }
    } catch {
      setError(
        "Your browser could not keep this schedule for sign-in. Enable session storage and try again.",
      );
    }
  }
  async function googleLogin() {
    setWorking(true);
    setError("");
    try {
      prepare(!!pending.current);
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/?auth=complete`,
        errorCallbackURL: `${window.location.origin}/?auth=error`,
      });
      if (result.error)
        throw new Error(
          result.error.message || "Google sign-in is unavailable.",
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setWorking(false);
    }
  }
  async function signOut() {
    setWorking(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error)
        throw new Error(result.error.message || "Unable to sign out.");
      pending.current = null;
      sessionStorage.removeItem(pendingKey);
      setSaved([]);
      setNotice("");
      libraryDialog.current?.close();
      onSignOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out.");
    } finally {
      setWorking(false);
    }
  }
  async function showLibrary() {
    const requestingUser = previousUser.current;
    libraryDialog.current?.showModal();
    setLoadingList(true);
    setSaved([]);
    setError("");
    try {
      const response = await fetch("/api/schedules", { cache: "no-store" });
      const data = await response.json();
      if (requestingUser !== previousUser.current) return;
      if (!response.ok)
        throw new Error(data.error?.message || "Unable to load schedules.");
      setSaved(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load schedules.",
      );
    } finally {
      setLoadingList(false);
    }
  }
  async function openSchedule(id: string) {
    const requestingUser = previousUser.current;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/schedules/${id}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (requestingUser !== previousUser.current) return;
      if (!response.ok)
        throw new Error(data.error?.message || "Unable to open schedule.");
      pending.current = null;
      sessionStorage.removeItem(pendingKey);
      onOpen(data, true);
      setNotice("");
      libraryDialog.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open schedule.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="account-controls">
      {canSave && (
        <button
          className="primary"
          disabled={busy || working || isPending}
          onClick={() => void saveClick()}
        >
          {working ? "Please wait…" : "Save schedule"}
        </button>
      )}
      {session ? (
        <>
          <button
            className="secondary"
            disabled={busy || working}
            onClick={() => void showLibrary()}
          >
            My schedules
          </button>
          <span className="account-name" title={session.user.email}>
            {session.user.name}
          </span>
          <button
            className="text-button"
            disabled={busy || working}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <button
            className="secondary"
            disabled={busy || working || isPending}
            onClick={() => requestLogin()}
          >
            Log in
          </button>
          <button
            className="primary"
            disabled={busy || working || isPending}
            onClick={() => requestLogin(true)}
          >
            Sign up
          </button>
        </>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={loginDialog}
        className="account-dialog"
        aria-labelledby="login-title"
      >
        <h2 id="login-title">{loginReason}</h2>
        <p>Keep your schedules private and open them on any device.</p>
        <p>New here? Signing in with Google creates your account.</p>
        {error && <p role="alert">{error}</p>}
        <button
          className="primary google-sign-in"
          disabled={working}
          onClick={() => void googleLogin()}
        >
          Continue with Google
        </button>
        <button
          className="text-button"
          disabled={working}
          onClick={() => loginDialog.current?.close()}
        >
          Keep planning
        </button>
      </dialog>
      <dialog
        ref={libraryDialog}
        className="account-dialog"
        aria-labelledby="library-title"
      >
        <h2 id="library-title">My schedules</h2>
        <p>Only schedules saved to your account appear here.</p>
        {loadingList ? (
          <p role="status">Loading schedules…</p>
        ) : (
          <div className="saved-schedule-list">
            {saved.length ? (
              saved.map((item) => (
                <button
                  key={item.id}
                  disabled={working}
                  onClick={() => void openSchedule(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {new Date(item.starts_at).toLocaleDateString()} ·{" "}
                    {item.status}
                  </span>
                </button>
              ))
            ) : (
              <p>
                No saved schedules yet. Plan a day, then press Save schedule.
              </p>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="secondary"
          onClick={() => libraryDialog.current?.close()}
        >
          Close
        </button>
      </dialog>
    </div>
  );
}
