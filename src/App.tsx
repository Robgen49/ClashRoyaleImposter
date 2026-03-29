import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiGet, apiRequest } from "./api";
import { useStore } from "./store";

type StatusKind = "ok" | "err" | "neutral";

interface StatusState {
  text: string;
  kind: StatusKind;
}

interface RoleInfo {
  cardName: string;
  imageUrl: string | null;
  elixir: number | null;
}

interface RoomListItem {
  room_id: string;
  room_name: string;
  host_id: string;
}

interface Participant {
  name: string;
  player_id: string;
}

const JOIN_PASSWORD_LEN = 5;

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

/** Карта по API — не подставляем `role` (там «Player» и т.п., не карта). */
function extractRoleInfo(data: any): RoleInfo | null {
  const raw =
    data?.card_name ??
    data?.cardName ??
    data?.name ??
    data?.card ??
    null;
  if (raw == null || String(raw).trim() === "") return null;
  if (String(raw).toLowerCase() === "unknown") return null;

  const cardName = String(raw);

  const explicitImage =
    data?.image_url ??
    data?.imageUrl ??
    data?.card_image ??
    data?.cardImage ??
    data?.image ??
    null;

  const elixir =
    typeof data?.elixir === "number" && Number.isFinite(data.elixir)
      ? data.elixir
      : null;

  return {
    cardName,
    imageUrl: explicitImage
      ? toAbsoluteImageUrl(String(explicitImage))
      : resolveLocalCardImage(cardName),
    elixir,
  };
}

function hasAssignedCard(data: any): boolean {
  return extractRoleInfo(data) != null;
}

/** По ответу get-my-role: идёт ли матч (после game-start). */
function inferGameStarted(data: any): boolean {
  const s = String(data?.status ?? "").toLowerCase();
  if (["active", "started", "playing", "in_game", "running"].includes(s)) {
    return true;
  }
  if (["waiting", "lobby", "idle", "pending", "not_started"].includes(s)) {
    return false;
  }
  if (hasAssignedCard(data)) return true;
  return false;
}

async function copyText(text: string, onDone: (msg: string) => void) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      onDone("Скопировано в буфер обмена.");
      return;
    }
  } catch {
    // insecure context (HTTP), permission denied, etc.
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    onDone(
      ok
        ? "Скопировано в буфер обмена."
        : "Не удалось скопировать — выделите текст вручную.",
    );
  } catch {
    onDone("Не удалось скопировать.");
  }
}

export default function App() {
  const {
    playerId,
    roomId,
    roomName,
    roomPassword,
    setPlayerId,
    setRoom,
    clearRoom,
    logout,
  } = useStore();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roomNameCreate, setRoomNameCreate] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinRoomPassword, setJoinRoomPassword] = useState("");
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [gamePhase, setGamePhase] = useState<
    "checking" | "waiting" | "running"
  >("checking");
  const [participantsLoading, setParticipantsLoading] = useState(true);

  const hadPlayersInRoomRef = useRef(false);

  function setOk(text: string) {
    setStatus({ text, kind: "ok" });
  }
  function setErr(text: string) {
    setStatus({ text, kind: "err" });
  }
  function setNeutral(text: string) {
    setStatus({ text, kind: "neutral" });
  }

  const loadRooms = useCallback(async () => {
    if (!playerId || roomId) return;
    try {
      const list = await apiGet("/game/rooms");
      setRooms(Array.isArray(list) ? list : []);
    } catch {
      setRooms([]);
    }
  }, [playerId, roomId]);

  const loadParticipants = useCallback(async () => {
    if (!playerId || !roomId) return;
    try {
      const data = await apiGet(
        `/game/room-participants/${encodeURIComponent(roomId)}`,
      );
      const players = Array.isArray(data?.players) ? data.players : [];
      const count =
        typeof data?.count === "number" ? data.count : players.length;

      if (players.length > 0) {
        hadPlayersInRoomRef.current = true;
      }

      if (
        players.length === 0 &&
        count === 0 &&
        hadPlayersInRoomRef.current
      ) {
        setRoleInfo(null);
        clearRoom();
        setGamePhase("checking");
        setErr("Хост вышел — комната закрыта.");
        return;
      }

      setParticipants(players);
      setParticipantCount(count);
    } catch {
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, [playerId, roomId, clearRoom]);

  useEffect(() => {
    if (!roomId) {
      setParticipants([]);
      setParticipantCount(0);
      setGamePhase("checking");
      hadPlayersInRoomRef.current = false;
      setParticipantsLoading(true);
    } else {
      hadPlayersInRoomRef.current = false;
      setParticipantsLoading(true);
      setGamePhase("checking");
    }
  }, [roomId]);

  const syncGameStatus = useCallback(async () => {
    if (!playerId || !roomId) return;
    try {
      const res = await fetch(
        `${API_URL}/game/get-my-role?room_id=${encodeURIComponent(roomId)}&player_id=${encodeURIComponent(playerId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setGamePhase("waiting");
        return;
      }
      setGamePhase(inferGameStarted(data) ? "running" : "waiting");
    } catch {
      setGamePhase("waiting");
    }
  }, [playerId, roomId]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!playerId || roomId) return;
    const t = window.setInterval(() => void loadRooms(), 8000);
    return () => window.clearInterval(t);
  }, [playerId, roomId, loadRooms]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const t = window.setInterval(() => void loadParticipants(), 4000);
    return () => window.clearInterval(t);
  }, [roomId, playerId, loadParticipants]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    void syncGameStatus();
  }, [roomId, playerId, syncGameStatus]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const t = window.setInterval(() => void syncGameStatus(), 5000);
    return () => window.clearInterval(t);
  }, [roomId, playerId, syncGameStatus]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `${API_URL}/game/room-participants/${encodeURIComponent(roomId)}`,
      );
      if (cancelled) return;
      if (res.status === 404) {
        clearRoom();
        setErr("Комната не найдена или вы из неё исключены.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, playerId, clearRoom]);

  async function register() {
    setBusy("register");
    try {
      await apiRequest("/auth/player-reg", "POST", { name, password });
      setOk("Аккаунт создан. Можно войти.");
    } catch {
      setErr("Не удалось зарегистрироваться. Имя 3–20 символов, пароль от 5.");
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
      const uname = res.username ?? name;
      setOk(`С возвращением, ${uname}. ID игрока сохранён на этом устройстве.`);
    } catch {
      setErr("Не удалось войти. Неверный пароль или пользователь не найден.");
    } finally {
      setBusy(null);
    }
  }

  async function createRoom() {
    if (!playerId) return;
    const rn = roomNameCreate.trim();
    if (!rn) {
      setErr("Введите название комнаты.");
      return;
    }
    setBusy("create");
    try {
      const res = await apiRequest("/game/create-room", "POST", {
        player_id: playerId,
        room_name: rn,
      });
      setRoom({
        roomId: res.room_id,
        roomName: res.room_name ?? rn,
        roomPassword: res.password ?? null,
      });
      setRoleInfo(null);
      setJoinRoomPassword("");
      setOk("Комната создана. Поделитесь 5-символьным паролем.");
    } catch {
      setErr("Не удалось создать комнату.");
    } finally {
      setBusy(null);
    }
  }

  async function joinRoom() {
    if (!playerId) return;
    if (!joinRoomId.trim()) {
      setErr("Выберите комнату из списка или введите её ID.");
      return;
    }
    if (joinRoomPassword.length !== JOIN_PASSWORD_LEN) {
      setErr(`Пароль должен быть ровно ${JOIN_PASSWORD_LEN} символов.`);
      return;
    }
    setBusy("join");
    try {
      await apiRequest("/game/join-room", "POST", {
        player_id: playerId,
        password: joinRoomPassword,
        room_id: joinRoomId.trim(),
      });
      const picked = rooms.find((r) => r.room_id === joinRoomId.trim());
      setRoom({
        roomId: joinRoomId.trim(),
        roomName: picked?.room_name ?? null,
        roomPassword: null,
      });
      setRoleInfo(null);
      setJoinRoomPassword("");
      setOk("Вы вошли в комнату.");
    } catch {
      setErr("Не удалось войти — проверьте ID комнаты и пароль.");
    } finally {
      setBusy(null);
    }
  }

  async function leaveRoom() {
    if (!playerId || !roomId) return;
    setBusy("leave");
    try {
      await apiRequest("/game/leave-room", "POST", {
        player_id: playerId,
        room_id: roomId,
      });
      clearRoom();
      setRoleInfo(null);
      setOk("Вы вышли из комнаты.");
      void loadRooms();
    } catch {
      setErr("Не удалось выйти из комнаты.");
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
      setGamePhase("running");
      void syncGameStatus();
      setOk("Матч начался.");
    } catch {
      setErr("Не удалось начать игру.");
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

      const started = inferGameStarted(data);
      setGamePhase(started ? "running" : "waiting");

      if (!started) {
        setRoleInfo(null);
        setNeutral(
          "Матч ещё не начался — дождитесь, пока хост нажмёт «Начать игру».",
        );
        return;
      }

      const parsed = extractRoleInfo(data);
      if (!parsed) {
        setRoleInfo(null);
        setNeutral(
          "Игра началась, но карта ещё не назначена — попробуйте через пару секунд.",
        );
        return;
      }

      setRoleInfo(parsed);
      setOk(`Ваша карта: ${parsed.cardName}`);
    } catch {
      setErr("Пока не удалось загрузить роль.");
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
          <div className="brand__badge">only funs</div>
          <h1 className="brand__title">
            Clash Royale <span>Imposter</span>
          </h1>
          <p className="brand__subtitle">
            Игра в шпиона
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
                Вход
              </h2>
              <span className="panel__hint">3–20 символов · пароль от 5</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="auth-name">
                Имя
              </label>
              <input
                id="auth-name"
                className="input"
                autoComplete="username"
                placeholder="Ваш ник"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="auth-pass">
                Пароль
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
                {busy === "login" ? "Вход…" : "Войти"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy !== null}
                onClick={register}
              >
                {busy === "register" ? "Создание…" : "Регистрация"}
              </button>
            </div>
          </section>
        )}

        {playerId && !roomId && (
          <section className="panel" aria-labelledby="lobby-heading">
            <div className="panel__head">
              <h2 id="lobby-heading" className="panel__title">
                Лобби
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => {
                  logout();
                  setNeutral("Вы вышли из аккаунта.");
                }}
              >
                Выйти
              </button>
            </div>
            <div className="kv">
              <div className="kv__row">
                <span className="kv__label">ID игрока</span>
                <code className="kv__value">{playerId}</code>
                <div className="kv__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => copyText(playerId, (m) => setNeutral(m))}
                  >
                    Копировать
                  </button>
                </div>
              </div>
            </div>

            <div className="divider" />
            <div className="panel__head">
              <h3 className="panel__title panel__title--sub">Открытые комнаты</h3>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => void loadRooms()}
              >
                Обновить
              </button>
            </div>
            {rooms.length === 0 ? (
              <p className="muted">Комнат пока нет — создайте свою или подождите хоста.</p>
            ) : (
              <ul className="room-list">
                {rooms.map((r) => (
                  <li key={r.room_id}>
                    <button
                      type="button"
                      className={
                        joinRoomId === r.room_id
                          ? "room-list__item room-list__item--active"
                          : "room-list__item"
                      }
                      onClick={() => {
                        setJoinRoomId(r.room_id);
                        setNeutral(`Выбрано: ${r.room_name}`);
                      }}
                    >
                      <span className="room-list__name">{r.room_name}</span>
                      <span className="room-list__meta">{r.room_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="muted stack-top-sm">
              Нажмите на комнату и введите 5-символьный пароль для входа.
            </p>

            <div className="divider" />
            <div className="field">
              <label className="field__label" htmlFor="create-name">
                Создать комнату
              </label>
              <input
                id="create-name"
                className="input"
                placeholder="Название (1–30 символов)"
                maxLength={30}
                value={roomNameCreate}
                onChange={(e) => setRoomNameCreate(e.target.value)}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null}
                onClick={createRoom}
              >
                {busy === "create" ? "Создание…" : "Создать комнату"}
              </button>
            </div>

            <div className="divider" />
            <div className="field">
              <label className="field__label" htmlFor="join-id">
                ID комнаты
              </label>
              <input
                id="join-id"
                className="input"
                placeholder="Из списка или вставьте"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="join-pass">
                Пароль комнаты ({JOIN_PASSWORD_LEN} символов)
              </label>
              <input
                id="join-pass"
                className="input"
                autoComplete="off"
                placeholder="•••••"
                maxLength={JOIN_PASSWORD_LEN}
                value={joinRoomPassword}
                onChange={(e) =>
                  setJoinRoomPassword(e.target.value.slice(0, JOIN_PASSWORD_LEN))
                }
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy !== null}
                onClick={joinRoom}
              >
                {busy === "join" ? "Вход…" : "Войти в комнату"}
              </button>
            </div>
          </section>
        )}

        {playerId && roomId && (
          <section className="panel" aria-labelledby="room-heading">
            <div className="panel__head">
              <h2 id="room-heading" className="panel__title">
                Комната
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                disabled={busy !== null}
                onClick={leaveRoom}
              >
                {busy === "leave" ? "…" : "Выйти"}
              </button>
            </div>
            <div className="room-hero">
              <div className="room-hero__label">Комната</div>
              <div className="room-hero__id">
                {roomName || roomId}
              </div>
              {roomName && (
                <p className="muted room-hero__sub">
                  Ид.: <code className="room-hero__code">{roomId}</code>
                </p>
              )}
            </div>

            <div
              className={`game-phase game-phase--${gamePhase}`}
              role="status"
            >
              {gamePhase === "checking" && "Проверка статуса матча…"}
              {gamePhase === "waiting" && "Ожидание: хост должен начать матч."}
              {gamePhase === "running" && "Игра идёт — можно открыть карту."}
            </div>

            <div className="participants stack-top">
              <div className="participants__head">
                <span className="field__label participants__title">
                  Игроки ({participantCount})
                </span>
              </div>
              {participantsLoading && participants.length === 0 ? (
                <p className="muted">Загрузка списка…</p>
              ) : participants.length === 0 ? (
                <p className="muted">В списке никого нет.</p>
              ) : (
                <ul className="participants__list">
                  {participants.map((p) => (
                    <li key={p.player_id} className="participants__row">
                      <span className="participants__name">{p.name}</span>
                      {p.player_id === playerId && (
                        <span className="participants__you">вы</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="kv stack-top">
              <div className="kv__row">
                <span className="kv__label">Копировать ID</span>
                <div className="kv__actions kv__actions--push">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => copyText(roomId, (m) => setNeutral(m))}
                  >
                    Копировать
                  </button>
                </div>
              </div>
              {roomPassword && (
                <div className="kv__row">
                  <span className="kv__label">Пароль</span>
                  <code className="kv__value">{roomPassword}</code>
                  <div className="kv__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() =>
                        copyText(roomPassword, (m) => setNeutral(m))
                      }
                    >
                      Копировать
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="divider" />
            {roleInfo && (
              <>
                <div className="card-view">
                  <div className="card-view__label">Ваша карта</div>
                  <div className="card-view__name">{roleInfo.cardName}</div>
                  {roleInfo.elixir != null && (
                    <p className="card-view__elixir">Эликсир: {roleInfo.elixir}</p>
                  )}
                  {roleInfo.imageUrl ? (
                    <img
                      className="card-view__image"
                      src={roleInfo.imageUrl}
                      alt={roleInfo.cardName}
                    />
                  ) : (
                    <div className="card-view__placeholder">
                      Нет картинки для этой карты.
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
                {busy === "start" ? "Запуск…" : "Начать игру"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={
                  busy !== null ||
                  gamePhase === "checking" ||
                  gamePhase === "waiting"
                }
                onClick={getRole}
                title={
                  gamePhase !== "running"
                    ? "Доступно после старта матча хостом"
                    : undefined
                }
              >
                {busy === "role"
                  ? "Загрузка…"
                  : gamePhase !== "running"
                    ? "Показать карту (после старта)"
                    : "Показать карту"}
              </button>
            </div>
          </section>
        )}

        <p className="footer-note">
          ID игрока и комната хранятся локально — обновление страницы не выбросит
          из комнаты.
          API:{" "}
          <a href={`${API_URL}/docs`} className="footer-note__api">{API_URL}/docs</a>{" "}
          Open Source:{" "}<a href="https://github.com/Robgen49/ClashRoyaleImposter" className="footer-note__api">Frontend</a> {" "}
          <a href="https://github.com/MarselKrankd/clashRoyale_Imposter" className="footer-note__api">Backend</a>
        </p>
      </div>
    </div>
  );
}
