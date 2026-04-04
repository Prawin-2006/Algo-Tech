import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  doctorId: string | null;
  name: string | null;
  login: (doctorId: string, name: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      doctorId: null,
      name: null,
      login: (doctorId, name) => set({ doctorId, name }),
      logout: () => set({ doctorId: null, name: null }),
    }),
    {
      name: "healthchain-auth",
    }
  )
);
