import { create } from "zustand";
import api from "@/lib/api";

interface User {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  avatar_url: string | null;
  is_active: boolean;
  locale: string;
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user, token) => {
    localStorage.setItem("mnemo_token", token);
    localStorage.setItem("mnemo_user", JSON.stringify(user));
    api.setToken(token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("mnemo_token");
    localStorage.removeItem("mnemo_user");
    api.setToken(null);
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("mnemo_token");
    const userStr = localStorage.getItem("mnemo_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        api.setToken(token);
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem("mnemo_token");
        localStorage.removeItem("mnemo_user");
      }
    }
  },
}));
