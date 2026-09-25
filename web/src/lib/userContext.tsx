import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchUsers } from "./api";
import type { User } from "../types";

const STORAGE_KEY = "hrcollector.selectedUserId";

interface UserContextValue {
  users: User[];
  selectedUserId: string | null;
  setSelectedUserId: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const UserContext = createContext<UserContextValue | null>(null);

/** Loads the fixed list of users once and remembers which one is
 * currently selected (persisted in localStorage so it survives a
 * refresh). Everything that's scoped per-person — the session list,
 * settings, .fit uploads — reads selectedUserId from here. */
export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers()
      .then((list) => {
        setUsers(list);
        setSelectedUserIdState((current) => {
          if (current && list.some((u) => u.id === current)) return current;
          return list[0]?.id ?? null;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  function setSelectedUserId(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedUserIdState(id);
  }

  return (
    <UserContext.Provider value={{ users, selectedUserId, setSelectedUserId, loading, error }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUsers must be used within a UserProvider");
  return ctx;
}
