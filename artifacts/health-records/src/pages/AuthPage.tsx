import { useState } from "react";
import { useLocation } from "wouter";
import { useDoctorLogin, useRegisterPatient } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  HeartPulse,
  Stethoscope,
  User,
  Eye,
  EyeOff,
  Lock,
  IdCard,
  UserRound,
} from "lucide-react";

type Mode = "signin" | "signup";
type AccountType = "doctor" | "patient";
type BloodGroup = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-";

const bloodGroups: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const LOCAL_PATIENT_CREDENTIALS_KEY = "healthchain-local-patient-credentials";

type LocalPatientCredential = {
  id: string;
  name: string;
  password: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
};

function readLocalPatientCredentials(): LocalPatientCredential[] {
  try {
    const raw = localStorage.getItem(LOCAL_PATIENT_CREDENTIALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalPatientCredential => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.password === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeLocalPatientCredentials(data: LocalPatientCredential[]): void {
  localStorage.setItem(LOCAL_PATIENT_CREDENTIALS_KEY, JSON.stringify(data));
}

function upsertLocalPatientCredential(entry: LocalPatientCredential): void {
  const current = readLocalPatientCredentials();
  const withoutSameName = current.filter(
    (item) => item.name.toLowerCase() !== entry.name.toLowerCase(),
  );
  writeLocalPatientCredentials([...withoutSameName, entry]);
}

function findLocalPatientCredential(name: string, password: string): LocalPatientCredential | null {
  const normalizedName = name.trim().toLowerCase();
  return (
    readLocalPatientCredentials().find(
      (item) => item.name.toLowerCase() === normalizedName && item.password === password,
    ) ?? null
  );
}

function chooseAge(...values: Array<number | string | null | undefined>): number | undefined {
  for (const value of values) {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return undefined;
}

function chooseKnownText(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed;
  }
  return undefined;
}

async function syncBackendPatientProfile(
  patientId: string,
  profile: { age?: number; gender?: string; bloodGroup?: string },
): Promise<void> {
  if (!profile.age && !profile.gender && !profile.bloodGroup) return;
  await fetch(`/api/patients/${encodeURIComponent(patientId)}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { loginDoctor, loginPatient } = useAuthStore();
  const { toast } = useToast();

  const doctorLoginMutation = useDoctorLogin();
  const registerMutation = useRegisterPatient();

  const [mode, setMode] = useState<Mode>("signin");
  const [accountType, setAccountType] = useState<AccountType>("doctor");
  const [showSecret, setShowSecret] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  const [doctorSignIn, setDoctorSignIn] = useState({ doctorId: "", doctorName: "" });
  const [patientSignIn, setPatientSignIn] = useState({
    patientName: "",
    password: "",
    age: "",
    gender: "Unknown",
    bloodGroup: "Unknown",
  });

  const [patientSignUp, setPatientSignUp] = useState({
    name: "",
    password: "",
    age: "",
    gender: "Male",
    bloodGroup: "O+" as BloodGroup,
    emergencyContact: "",
  });

  const isSigningIn =
    doctorLoginMutation.isPending ||
    registerMutation.isPending;

  const handleDoctorSignIn = (e: React.FormEvent) => {
    e.preventDefault();

    doctorLoginMutation.mutate(
      {
        data: {
          doctorId: doctorSignIn.doctorId,
          password: doctorSignIn.doctorName,
          name: doctorSignIn.doctorName,
        } as any,
      },
      {
        onSuccess: (data) => {
          loginDoctor(data.doctorId, data.name);
          toast({ title: `Welcome, ${data.name}` });
          navigate("/view-record");
        },
        onError: () => {
          toast({
            title: "Invalid credentials",
            description: "Use Doctor ID and Doctor Name.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handlePatientSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const localEntry = findLocalPatientCredential(
      patientSignIn.patientName,
      patientSignIn.password,
    );

    try {
      const res = await fetch("/api/patients/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientSignIn),
      });

      const data = (await res.json()) as {
        patientId?: string;
        name?: string;
        error?: string;
      };

      if (!res.ok || !data.patientId || !data.name) {
        throw new Error(data.error || "Invalid patient credentials");
      }

      let mergedProfile: { age?: number; gender?: string; bloodGroup?: string } = {};
      try {
        const patientRes = await fetch(`/api/patients/${encodeURIComponent(data.patientId)}`);
        if (patientRes.ok) {
          const patientData = (await patientRes.json()) as {
            age?: number;
            gender?: string;
            bloodGroup?: string;
          };
          mergedProfile = {
            age: chooseAge(patientData.age, localEntry?.age, patientSignIn.age),
            gender: chooseKnownText(
              patientData.gender,
              localEntry?.gender,
              patientSignIn.gender,
            ),
            bloodGroup: chooseKnownText(
              patientData.bloodGroup,
              localEntry?.bloodGroup,
              patientSignIn.bloodGroup,
            ),
          };
          upsertLocalPatientCredential({
            id: data.patientId,
            name: data.name,
            password: patientSignIn.password,
            age: mergedProfile.age,
            gender: mergedProfile.gender,
            bloodGroup: mergedProfile.bloodGroup,
          });
        }
      } catch {
        // Continue login even if profile fetch fails.
      }

      if (!mergedProfile.age && !mergedProfile.gender && !mergedProfile.bloodGroup) {
        mergedProfile = {
          age: chooseAge(localEntry?.age, patientSignIn.age),
          gender: chooseKnownText(localEntry?.gender, patientSignIn.gender),
          bloodGroup: chooseKnownText(localEntry?.bloodGroup, patientSignIn.bloodGroup),
        };
      }

      await syncBackendPatientProfile(data.patientId, mergedProfile);
      loginPatient(data.patientId, data.name, mergedProfile);
      toast({ title: `Welcome, ${data.name}` });
      navigate(`/patients/${data.patientId}`);
    } catch (error) {
      const localMatch = localEntry;
      if (localMatch) {
        const mergedAge = chooseAge(localMatch.age, patientSignIn.age);
        const mergedGender = chooseKnownText(localMatch.gender, patientSignIn.gender);
        const mergedBloodGroup = chooseKnownText(localMatch.bloodGroup, patientSignIn.bloodGroup);

        try {
          const registerRes = await fetch("/api/patients/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: localMatch.name,
              password: localMatch.password,
              age: mergedAge ?? 0,
              gender: mergedGender ?? "Unknown",
              bloodGroup: mergedBloodGroup ?? "Unknown",
              allergies: [],
              diseases: [],
            }),
          });

          if (registerRes.ok) {
            const backendPatient = (await registerRes.json()) as { id: string; name: string };
            upsertLocalPatientCredential({
              ...localMatch,
              id: backendPatient.id,
            });
            loginPatient(backendPatient.id, backendPatient.name, {
              age: mergedAge,
              gender: mergedGender,
              bloodGroup: mergedBloodGroup,
            });
            toast({
              title: `Welcome, ${backendPatient.name}`,
              description: "Your local profile was synced to secure records.",
            });
            navigate(`/patients/${backendPatient.id}`);
            return;
          }
        } catch {
          // Ignore backend sync failure and continue local fallback.
        }

        upsertLocalPatientCredential({
          ...localMatch,
          age: mergedAge,
          gender: mergedGender,
          bloodGroup: mergedBloodGroup,
        });

        loginPatient(localMatch.id, localMatch.name, {
          age: mergedAge,
          gender: mergedGender,
          bloodGroup: mergedBloodGroup,
        });
        toast({
          title: `Welcome, ${localMatch.name}`,
          description: "Using local profile data.",
        });
        navigate(`/patients/${localMatch.id}`);
        return;
      }

      toast({
        title: "Invalid credentials",
        description: error instanceof Error ? error.message : "Use Patient Name and Password.",
        variant: "destructive",
      });
    }
  };

  const handlePatientSignUp = (e: React.FormEvent) => {
    e.preventDefault();

    registerMutation.mutate(
      {
        data: {
          name: patientSignUp.name,
          password: patientSignUp.password,
          age: Number(patientSignUp.age),
          gender: patientSignUp.gender,
          bloodGroup: patientSignUp.bloodGroup,
          emergencyContact: patientSignUp.emergencyContact || undefined,
        } as any,
      },
      {
        onSuccess: (data) => {
          upsertLocalPatientCredential({
            id: data.id,
            name: patientSignUp.name,
            password: patientSignUp.password,
            age: Number(patientSignUp.age),
            gender: patientSignUp.gender,
            bloodGroup: patientSignUp.bloodGroup,
          });
          toast({ title: "Patient account created", description: `Health ID: ${data.id}` });
          setPatientSignIn({
            patientName: patientSignUp.name,
            password: patientSignUp.password,
            age: patientSignUp.age,
            gender: patientSignUp.gender,
            bloodGroup: patientSignUp.bloodGroup,
          });
          setAccountType("patient");
          setMode("signin");
        },
        onError: () => {
          const fallbackId = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
          upsertLocalPatientCredential({
            id: fallbackId,
            name: patientSignUp.name,
            password: patientSignUp.password,
            age: Number(patientSignUp.age),
            gender: patientSignUp.gender,
            bloodGroup: patientSignUp.bloodGroup,
          });
          toast({
            title: "Created locally",
            description: "Database unavailable. Patient credentials saved in this browser.",
          });
          setPatientSignIn({
            patientName: patientSignUp.name,
            password: patientSignUp.password,
            age: patientSignUp.age,
            gender: patientSignUp.gender,
            bloodGroup: patientSignUp.bloodGroup,
          });
          setAccountType("patient");
          setMode("signin");
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 shadow-lg">
            <HeartPulse className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">MediLock</h1>
          <p className="mt-1 text-sm text-slate-500">Secure Health Records Platform</p>
        </div>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "signin" ? "bg-white text-slate-900 shadow" : "text-slate-600"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setAccountType("patient");
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "signup" ? "bg-white text-slate-900 shadow" : "text-slate-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          <h2 className="text-3xl font-bold text-slate-900">
            {mode === "signin" ? "Sign in to your account" : "Create your patient account"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin" ? "Select your account type to continue" : "Patient sign up requires name and password"}
          </p>

          {mode === "signin" && (
            <>
              <p className="mb-2 mt-6 text-sm font-semibold text-slate-700">I am a</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType("doctor")}
                  className={`rounded-xl border p-4 text-left transition ${
                    accountType === "doctor"
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                    <Stethoscope className="h-5 w-5 text-slate-600" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">Doctor</p>
                  <p className="text-xs text-slate-500">Healthcare Provider</p>
                </button>

                <button
                  type="button"
                  onClick={() => setAccountType("patient")}
                  className={`rounded-xl border p-4 text-left transition ${
                    accountType === "patient"
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                    <User className="h-5 w-5 text-slate-600" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">Patient</p>
                  <p className="text-xs text-slate-500">Personal Health</p>
                </button>
              </div>

              {accountType === "doctor" ? (
                <form onSubmit={handleDoctorSignIn} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-800">Doctor ID</label>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={doctorSignIn.doctorId}
                        onChange={(e) => setDoctorSignIn((s) => ({ ...s, doctorId: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                        placeholder="doctor1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-800">Doctor Name</label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={doctorSignIn.doctorName}
                        onChange={(e) => setDoctorSignIn((s) => ({ ...s, doctorName: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                        placeholder="Dr. Priya Sharma"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Remember this device
                  </label>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                  >
                    {isSigningIn ? "Signing in..." : "Sign In as Doctor"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePatientSignIn} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-800">Patient Name</label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={patientSignIn.patientName}
                        onChange={(e) => setPatientSignIn((s) => ({ ...s, patientName: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                        placeholder="Patient full name"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-sm font-semibold text-slate-800">Password</label>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showSecret ? "text" : "password"}
                        required
                        value={patientSignIn.password}
                        onChange={(e) => setPatientSignIn((s) => ({ ...s, password: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                        placeholder="Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Age</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={patientSignIn.age}
                        onChange={(e) => setPatientSignIn((s) => ({ ...s, age: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Gender</label>
                      <select
                        value={patientSignIn.gender}
                        onChange={(e) => setPatientSignIn((s) => ({ ...s, gender: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                      >
                        <option>Unknown</option>
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Blood Group</label>
                      <select
                        value={patientSignIn.bloodGroup}
                        onChange={(e) => setPatientSignIn((s) => ({ ...s, bloodGroup: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                      >
                        <option>Unknown</option>
                        {bloodGroups.map((bg) => (
                          <option key={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                  >
                    Sign In as Patient
                  </button>
                </form>
              )}
            </>
          )}

          {mode === "signup" && (
            <form onSubmit={handlePatientSignUp} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800">Patient Name</label>
                <input
                  type="text"
                  required
                  value={patientSignUp.name}
                  onChange={(e) => setPatientSignUp((s) => ({ ...s, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showSecret ? "text" : "password"}
                    required
                    value={patientSignUp.password}
                    onChange={(e) => setPatientSignUp((s) => ({ ...s, password: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-10 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                    placeholder="Create a password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">Age</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={patientSignUp.age}
                    onChange={(e) => setPatientSignUp((s) => ({ ...s, age: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">Gender</label>
                  <select
                    value={patientSignUp.gender}
                    onChange={(e) => setPatientSignUp((s) => ({ ...s, gender: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">Blood Group</label>
                  <select
                    value={patientSignUp.bloodGroup}
                    onChange={(e) => setPatientSignUp((s) => ({ ...s, bloodGroup: e.target.value as BloodGroup }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                  >
                    {bloodGroups.map((bg) => (
                      <option key={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-800">Emergency Contact</label>
                  <input
                    type="text"
                    value={patientSignUp.emergencyContact}
                    onChange={(e) => setPatientSignUp((s) => ({ ...s, emergencyContact: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500 transition focus:ring-2"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
              >
                {registerMutation.isPending ? "Creating account..." : "Sign Up as Patient"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
