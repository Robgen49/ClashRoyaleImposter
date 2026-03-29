import { create } from "zustand";

interface Store {
  playerId: string | null;
  roomId: string | null;
  roomName: string | null;
  roomPassword: string | null;
  setPlayerId: (id: string) => void;
  setRoom: (opts: {
    roomId: string;
    roomName: string | null;
    /** Host password to persist; omit to keep previous; pass null to clear */
    roomPassword?: string | null;
  }) => void;
  setRoomPassword: (password: string | null) => void;
  clearRoom: () => void;
  logout: () => void;
}

const PLAYER_ID_KEY = "player_id";
const ROOM_ID_KEY = "room_id";
const ROOM_NAME_KEY = "room_name";
const ROOM_PASSWORD_KEY = "room_password";

export const useStore = create<Store>((set) => ({
  playerId: localStorage.getItem(PLAYER_ID_KEY),
  roomId: localStorage.getItem(ROOM_ID_KEY),
  roomName: localStorage.getItem(ROOM_NAME_KEY),
  roomPassword: localStorage.getItem(ROOM_PASSWORD_KEY),
  setPlayerId: (id) => {
    localStorage.setItem(PLAYER_ID_KEY, id);
    set({ playerId: id });
  },
  setRoom: ({ roomId, roomName, roomPassword }) => {
    localStorage.setItem(ROOM_ID_KEY, roomId);
    if (roomName != null) localStorage.setItem(ROOM_NAME_KEY, roomName);
    else localStorage.removeItem(ROOM_NAME_KEY);
    if (roomPassword !== undefined) {
      if (roomPassword != null && roomPassword !== "") {
        localStorage.setItem(ROOM_PASSWORD_KEY, roomPassword);
      } else {
        localStorage.removeItem(ROOM_PASSWORD_KEY);
      }
    }
    set((state) => ({
      roomId,
      roomName: roomName ?? null,
      roomPassword:
        roomPassword !== undefined ? roomPassword : state.roomPassword,
    }));
  },
  setRoomPassword: (password) => {
    if (password != null && password !== "") {
      localStorage.setItem(ROOM_PASSWORD_KEY, password);
    } else {
      localStorage.removeItem(ROOM_PASSWORD_KEY);
    }
    set({ roomPassword: password });
  },
  clearRoom: () => {
    localStorage.removeItem(ROOM_ID_KEY);
    localStorage.removeItem(ROOM_NAME_KEY);
    localStorage.removeItem(ROOM_PASSWORD_KEY);
    set({ roomId: null, roomName: null, roomPassword: null });
  },
  logout: () => {
    localStorage.removeItem(PLAYER_ID_KEY);
    localStorage.removeItem(ROOM_ID_KEY);
    localStorage.removeItem(ROOM_NAME_KEY);
    localStorage.removeItem(ROOM_PASSWORD_KEY);
    set({
      playerId: null,
      roomId: null,
      roomName: null,
      roomPassword: null,
    });
  },
}));
