import { useState } from "react";
import { API_URL, apiRequest } from "./api";
import { useStore } from "./store";

type StatusKind = "ok" | "err" | "neutral";

interface StatusState {
  text: string;
  kind: StatusKind;
}

interface RoleInfo {
  cardName: string;
  imageUrl: string | null;
}

const localCardImages = import.meta.glob("./assets/cards/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  as: "url",
}) as Record<string, string>;

function normalizeCardKey(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveLocalCardImage(cardName: string): string | null {
  const target = normalizeCardKey(cardName);
  for (const [path, url] of Object.entries(localCardImages)) {
    const filename = path.split("/").pop() ?? "";
    const baseName = filename.replace(/\.[^/.]+$/, "");
    if (normalizeCardKey(baseName) === target) return url;
  }
  return null;
}

function toAbsoluteImageUrl(imagePath: string): string {
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return `${API_URL}${normalizedPath}`;
}

function extractRoleInfo(data: any): RoleInfo {
  const cardName =
    data?.card_name ??
    data?.cardName ??
    data?.name ??
    data?.card ??
    data?.role ??
    "unknown";

  const explicitImage =
    data?.card_image ??
    data?.cardImage ??
    data?.image_url ??
    data?.imageUrl ??
    data?.image ??
    null;

  return {
    cardName: String(cardName),
    imageUrl: explicitImage
      ? toAbsoluteImageUrl(String(explicitImage))
      : resolveLocalCardImage(String(cardName)),
  };
}

function copyText(text: string, onDone: (msg: string) => void) {
  void navigator.clipboard.writeText(text).then(
    () => onDone("Copied to clipboard."),
    () => onDone("Could not copy."),
  );
}

export default function App() {
  const {
    playerId,
    roomId,
    roomPassword,
    setPlayerId,
    setRoomId,
    setRoomPassword,
    logout,
  } = useStore();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinRoomPassword, setJoinRoomPassword] = useState("");
  const [status, setStatus] = useState<StatusState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);

  function setOk(text: string) {
    setStatus({ text, kind: "ok" });
  }
  function setErr(text: string) {
    setStatus({ text, kind: "err" });
  }
  function setNeutral(text: string) {
    setStatus({ text, kind: "neutral" });
  }

  async function register() {
    setBusy("register");
    try {
      await apiRequest("/auth/player-reg", "POST", { name, password });
      setOk("Account created. You can sign in now.");
    } catch {
      setErr("Registration failed. Check name length (3–20) and password (5+).");
    } finally {
      setBusy(null);
    }
  }

  async function login() {
    setBusy("login");
    try {
      const res = await apiRequest("/auth/player-log", "POST", {
        name,
        password,
      });
      setPlayerId(res.player_id);
      setOk(`Welcome back. Player ID saved on this device.`);
    } catch {
      setErr("Login failed. Wrong password or user not found.");
    } finally {
      setBusy(null);
    }
  }

  async function createRoom() {
    if (!playerId) return;
    setBusy("create");
    try {
      const res = await apiRequest("/game/create-room", "POST", {
        player_id: playerId,
      });
      setRoomId(res.room_id);
      setRoomPassword(res.password ?? null);
      setRoleInfo(null);
      setOk("Room created. Share the password with friends.");
    } catch {
      setErr("Could not create room.");
    } finally {
      setBusy(null);
    }
  }

  async function joinRoom() {
    if (!playerId) return;
    setBusy("join");
    try {
      const res = await apiRequest("/game/join-room", "POST", {
        player_id: playerId,
        password: joinRoomPassword,
        room_id: joinRoomId,
      });
      setRoomId(res.room_id ?? joinRoomId);
      setRoomPassword(null);
      setRoleInfo(null);
      setOk("You joined the room.");
    } catch {
      setErr("Could not join — check room ID and password.");
    } finally {
      setBusy(null);
    }
  }

  async function startGame() {
    if (!roomId || !playerId) return;
    setBusy("start");
    try {
      const res = await fetch(
        `${API_URL}/game/game-start?room_id=${encodeURIComponent(roomId)}&player_id=${encodeURIComponent(playerId)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("bad");
      setOk("Match started.");
    } catch {
      setErr("Could not start the game.");
    } finally {
      setBusy(null);
    }
  }

  async function getRole() {
    if (!roomId || !playerId) return;
    setBusy("role");
    try {
      const res = await fetch(
        `${API_URL}/game/get-my-role?room_id=${encodeURIComponent(roomId)}&player_id=${encodeURIComponent(playerId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error("bad");
      const parsed = extractRoleInfo(data);
      setRoleInfo(parsed);
      setOk(`Your card: ${parsed.cardName}`);
    } catch {
      setErr("Could not load role yet.");
    } finally {
      setBusy(null);
    }
  }

  const statusClass =
    status?.kind === "ok"
      ? "status status--ok"
      : status?.kind === "err"
        ? "status status--err"
        : "status status--neutral";

  return (
    <div className="app">
      <div className="app__bg" aria-hidden />
      <div className="app__inner">
        <header className="brand">
          <div className="brand__badge">Social deduction</div>
          <h1 className="brand__title">
            Clash Royale <span>Imposter</span>
          </h1>
          <p className="brand__subtitle">
            Enter the arena, create a room, and find who is lying before the
            crown falls.
          </p>
        </header>

        {status && (
          <div className={statusClass} role="status">
            <span className="status__dot" aria-hidden />
            <span>{status.text}</span>
          </div>
        )}

        {!playerId && (
          <section className="panel" aria-labelledby="auth-heading">
            <div className="panel__head">
              <h2 id="auth-heading" className="panel__title">
                Sign in
              </h2>
              <span className="panel__hint">3–20 chars · password 5+</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="auth-name">
                Display name
              </label>
              <input
                id="auth-name"
                className="input"
                autoComplete="username"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="auth-pass">
                Password
              </label>
              <input
                id="auth-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null}
                onClick={login}
              >
                {busy === "login" ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy !== null}
                onClick={register}
              >
                {busy === "register" ? "Creating…" : "Create account"}
              </button>
            </div>
          </section>
        )}

        {playerId && (
          <section className="panel" aria-labelledby="lobby-heading">
            <div className="panel__head">
              <h2 id="lobby-heading" className="panel__title">
                Lobby
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => {
                  logout();
                  setNeutral("Signed out.");
                }}
              >
                Sign out
              </button>
            </div>
            <div className="kv">
              <div className="kv__row">
                <span className="kv__label">Player ID</span>
                <code className="kv__value">{playerId}</code>
                <div className="kv__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() =>
                      copyText(playerId, (m) => setNeutral(m))
                    }
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
            <div className="divider" />
            <div className="field">
              <label className="field__label" htmlFor="create-hint">
                Host
              </label>
              <p id="create-hint" className="muted">
                Create a private room — you will get a password to share.
              </p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null}
                onClick={createRoom}
              >
                {busy === "create" ? "Creating…" : "Create room"}
              </button>
            </div>
            <div className="divider" />
            <div className="field">
              <label className="field__label" htmlFor="join-id">
                Join with code
              </label>
              <input
                id="join-id"
                className="input"
                placeholder="Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="join-pass">
                Room password
              </label>
              <input
                id="join-pass"
                className="input"
                type="password"
                placeholder="From the host"
                value={joinRoomPassword}
                onChange={(e) => setJoinRoomPassword(e.target.value)}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy !== null}
                onClick={joinRoom}
              >
                {busy === "join" ? "Joining…" : "Join room"}
              </button>
            </div>
          </section>
        )}

        {playerId && roomId && (
          <section className="panel" aria-labelledby="room-heading">
            <div className="panel__head">
              <h2 id="room-heading" className="panel__title">
                Room
              </h2>
            </div>
            <div className="room-hero">
              <div className="room-hero__label">Room ID</div>
              <div className="room-hero__id">{roomId}</div>
            </div>
            <div className="kv stack-top">
              <div className="kv__row">
                <span className="kv__label">Copy ID</span>
                <div className="kv__actions kv__actions--push">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => copyText(roomId, (m) => setNeutral(m))}
                  >
                    Copy
                  </button>
                </div>
              </div>
              {roomPassword && (
                <div className="kv__row">
                  <span className="kv__label">Password</span>
                  <code className="kv__value">{roomPassword}</code>
                  <div className="kv__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() =>
                        copyText(roomPassword, (m) => setNeutral(m))
                      }
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="divider" />
            {roleInfo && (
              <>
                <div className="card-view">
                  <div className="card-view__label">Your card</div>
                  <div className="card-view__name">{roleInfo.cardName}</div>
                  {roleInfo.imageUrl ? (
                    <img
                      className="card-view__image"
                      src={roleInfo.imageUrl}
                      alt={roleInfo.cardName}
                    />
                  ) : (
                    <div className="card-view__placeholder">
                      No card image yet for this card name.
                    </div>
                  )}
                </div>
                <div className="divider" />
              </>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null}
                onClick={startGame}
              >
                {busy === "start" ? "Starting…" : "Start game"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy !== null}
                onClick={getRole}
              >
                {busy === "role" ? "Loading…" : "Reveal my role"}
              </button>
            </div>
          </section>
        )}

        <p className="footer-note">
          Player ID is stored locally — no token. API:{" "}
          <span className="footer-note__api">{API_URL}</span>
        </p>
      </div>
    </div>
  );
}
