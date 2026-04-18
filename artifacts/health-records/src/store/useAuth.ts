import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  doctorId: string | null;
  patientId: string | null;
  role: "doctor" | "patient" | "guardian" | null;
  name: string | null;
  patientAge: number | null;
  patientGender: string | null;
  patientBloodGroup: string | null;
  loginDoctor: (doctorId: string, name: string) => void;
  loginPatient: (
    patientId: string,
    name: string,
    profile?: { age?: number | null; gender?: string | null; bloodGroup?: string | null },
  ) => void;
  loginGuardian: (patientId: string, guardianName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      doctorId: null,
      patientId: null,
      role: null,
      name: null,
      patientAge: null,
      patientGender: null,
      patientBloodGroup: null,
      loginDoctor: (doctorId, name) =>
        set({
          doctorId,
          patientId: null,
          role: "doctor",
          name,
          patientAge: null,
          patientGender: null,
          patientBloodGroup: null,
        }),
      loginPatient: (patientId, name, profile) =>
        set({
          doctorId: null,
          patientId,
          role: "patient",
          name,
          patientAge: profile?.age ?? null,
          patientGender: profile?.gender ?? null,
          patientBloodGroup: profile?.bloodGroup ?? null,
        }),
      loginGuardian: (patientId, guardianName) =>
        set({
          doctorId: null,
          patientId,
          role: "guardian",
          name: guardianName,
          patientAge: null,
          patientGender: null,
          patientBloodGroup: null,
        }),
      logout: () =>
        set({
          doctorId: null,
          patientId: null,
          role: null,
          name: null,
          patientAge: null,
          patientGender: null,
          patientBloodGroup: null,
        }),
    }),
    {
      name: "healthchain-auth",
    }
  )
);
