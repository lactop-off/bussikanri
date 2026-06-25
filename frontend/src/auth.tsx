import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, login as apiLogin, tokens } from "./api";
import type { User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      tokens.clear();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    await apiLogin(email, password);
    setUser(await api<User>("/auth/me"));
  }

  function logout() {
    tokens.clear();
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function canManage(user: User | null): boolean {
  return user?.role === "manager" || user?.role === "admin";
}
