import { create } from "zustand";

interface Store {
  playerId: string | null;
  roomId: string | null;
  roomPassword: string | null;
  setPlayerId: (id: string) => void;
  setRoomId: (id: string) => void;
  setRoomPassword: (password: string | null) => void;
  logout: () => void;
}

const PLAYER_ID_KEY = "player_id";

export const useStore = create<Store>((set) => ({
  playerId: localStorage.getItem(PLAYER_ID_KEY),
  roomId: null,
  roomPassword: null,
  setPlayerId: (id) => {
    localStorage.setItem(PLAYER_ID_KEY, id);
    set({ playerId: id });
  },
  setRoomId: (id) => set({ roomId: id }),
  setRoomPassword: (password) => set({ roomPassword: password }),
  logout: () => {
    localStorage.removeItem(PLAYER_ID_KEY);
    set({ playerId: null, roomId: null, roomPassword: null });
  },
}));
