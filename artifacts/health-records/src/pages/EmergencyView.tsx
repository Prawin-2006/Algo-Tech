import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useGetEmergencyData } from "@workspace/api-client-react";
import { AlertTriangle, Phone, Droplets, ShieldAlert, LockOpen } from "lucide-react";
import { useAuthStore } from "@/store/useAuth";

const LOCAL_PATIENT_CREDENTIALS_KEY = "healthchain-local-patient-credentials";

type LocalPatientCredential = {
  id: string;
  name: string;
  password: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
};

type EmergencySummary = {
  patientId: string;
  name: string;
  age: number | null;
  gender: string | null;
  bloodGroup: string | null;
  bp: string | null;
  sugar: string | null;
  allergies: string[] | null;
  currentMedicines: string[] | null;
  emergencyContact: string | null;
  pastDiseases: string[] | null;
};

type OverrideResponse = {
  sessionId: string;
  grantedAt: string;
  expiresAt: string;
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    bloodGroup: string;
    emergencyContact?: string | null;
    allergies: string[];
    diseases: string[];
  };
  records: Array<{
    id: string;
    recordType: string;
    title: string;
    description?: string | null;
    doctorName?: string | null;
    hospitalName?: string | null;
    visitDate?: string | null;
    prescriptions: string[];
    dataHash: string;
    createdAt: string;
  }>;
};

function getLocalPatientById(id: string): LocalPatientCredential | null {
  try {
    const raw = localStorage.getItem(LOCAL_PATIENT_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const found = parsed.find((item) => {
      if (!item || typeof item !== "object") return false;
      const rec = item as Record<string, unknown>;
      return rec.id === id;
    });
    return found ? (found as LocalPatientCredential) : null;
  } catch {
    return null;
  }
}

function chooseKnownText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed;
  }
  return null;
}

function chooseAge(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function withNullLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "null";
  const text = String(value).trim();
  return text ? text : "null";
}

export default function EmergencyView() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId ?? "";
  const { role, doctorId, name, patientAge, patientGender, patientBloodGroup } = useAuthStore();

  const { data, isLoading, error, refetch } = useGetEmergencyData(patientId, {
    query: { enabled: !!patientId },
  });

  const [overrideData, setOverrideData] = useState<OverrideResponse | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const localPatient = patientId ? getLocalPatientById(patientId) : null;

  const mergedSummary = useMemo((): EmergencySummary | null => {
    if (!data && !localPatient) return null;

    const payload = data as unknown as Partial<EmergencySummary> | undefined;
    const age = chooseAge(
      typeof payload?.age === "number" ? payload.age : null,
      localPatient?.age,
      patientAge,
    );
    const gender = chooseKnownText(
      typeof payload?.gender === "string" ? payload.gender : null,
      localPatient?.gender,
      patientGender,
    );
    const bloodGroup = chooseKnownText(
      typeof payload?.bloodGroup === "string" ? payload.bloodGroup : null,
      localPatient?.bloodGroup,
      patientBloodGroup,
    );

    return {
      patientId: payload?.patientId ?? patientId,
      name: payload?.name ?? localPatient?.name ?? "null",
      age,
      gender,
      bloodGroup,
      bp: typeof payload?.bp === "string" ? payload.bp : null,
      sugar: typeof payload?.sugar === "string" ? payload.sugar : null,
      allergies: payload?.allergies ?? null,
      currentMedicines: payload?.currentMedicines ?? null,
      emergencyContact:
        typeof payload?.emergencyContact === "string" ? payload.emergencyContact : null,
      pastDiseases: payload?.pastDiseases ?? null,
    };
  }, [data, localPatient, patientAge, patientGender, patientBloodGroup, patientId]);

  useEffect(() => {
    if (!overrideData) {
      setRemainingSeconds(0);
      return;
    }

    const update = () => {
      const sec = Math.max(0, Math.floor((new Date(overrideData.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(sec);
      if (sec <= 0) {
        setOverrideData(null);
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [overrideData]);

  useEffect(() => {
    if (role !== "doctor" || !doctorId || !patientId) return;

    const fetchActive = async () => {
      try {
        const res = await fetch(
          `/api/patients/${encodeURIComponent(patientId)}/emergency-override?doctorId=${encodeURIComponent(doctorId)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as OverrideResponse;
        setOverrideData(json);
      } catch {
        // no active override
      }
    };

    void fetchActive();
  }, [role, doctorId, patientId]);

  const triggerOverride = async () => {
    if (role !== "doctor" || !doctorId || !name || !patientId) return;
    setOverrideError(null);
    setOverrideLoading(true);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/emergency-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          doctorName: name,
          reason: "Emergency critical override",
        }),
      });
      const json = (await res.json()) as OverrideResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to enable override");
      setOverrideData(json);
      await refetch();
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "Unable to enable emergency override.");
    } finally {
      setOverrideLoading(false);
    }
  };

  const timeLeft = `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`;

  return (
    <div className="min-h-screen bg-red-950 text-white flex flex-col">
      <div className="bg-red-900 border-b border-red-800 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center animate-pulse">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">EMERGENCY ACCESS</h1>
            <p className="text-xs text-red-300">HealthChain · Critical Patient Information</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoading && (
            <div className="text-center py-16 text-red-300">
              <p>Loading critical data...</p>
            </div>
          )}

          {error && !mergedSummary && (
            <div className="text-center py-16 text-red-300">
              <p>Patient not found</p>
              <Link href="/patients">
                <a className="text-red-200 text-sm hover:underline mt-2 inline-block">Go back</a>
              </Link>
            </div>
          )}

          {mergedSummary && (
            <>
              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Patient</p>
                <h2 className="text-3xl font-bold text-white">{mergedSummary.name}</h2>
                <p className="text-xs text-red-300 mt-1 font-mono">ID: {mergedSummary.patientId}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-red-900 border border-red-700 rounded-xl p-4">
                  <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Gender</p>
                  <p className="text-xl font-semibold">{withNullLabel(mergedSummary.gender)}</p>
                </div>
                <div className="bg-red-900 border border-red-700 rounded-xl p-4">
                  <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Age</p>
                  <p className="text-xl font-semibold">{withNullLabel(mergedSummary.age)}</p>
                </div>
                <div className="bg-red-900 border border-red-700 rounded-xl p-4">
                  <p className="text-xs text-red-300 uppercase tracking-wider mb-1">BP</p>
                  <p className="text-xl font-semibold">{withNullLabel(mergedSummary.bp)}</p>
                </div>
                <div className="bg-red-900 border border-red-700 rounded-xl p-4">
                  <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Sugar</p>
                  <p className="text-xl font-semibold">{withNullLabel(mergedSummary.sugar)}</p>
                </div>
              </div>

              <div className="bg-red-900 border-2 border-red-500 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-5 h-5 text-red-300" />
                  <p className="text-xs text-red-300 uppercase tracking-wider">Blood Group</p>
                </div>
                <p className="text-3xl font-bold text-white">{withNullLabel(mergedSummary.bloodGroup)}</p>
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <p className="text-xs text-red-300 uppercase tracking-wider">Known Allergies</p>
                </div>
                {mergedSummary.allergies && mergedSummary.allergies.length > 0 ? (
                  <div className="space-y-2">
                    {mergedSummary.allergies.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-amber-900/50 border border-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="text-amber-200 font-medium">{a}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-red-200 font-medium">null</p>
                )}
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <p className="text-xs text-red-300 uppercase tracking-wider mb-2">Current Medicines</p>
                {mergedSummary.currentMedicines && mergedSummary.currentMedicines.length > 0 ? (
                  <ul className="space-y-1">
                    {mergedSummary.currentMedicines.map((m, i) => (
                      <li key={i} className="text-sm text-red-100">• {m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-red-200">null</p>
                )}
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <p className="text-xs text-red-300 uppercase tracking-wider mb-2">Past Diseases</p>
                {mergedSummary.pastDiseases && mergedSummary.pastDiseases.length > 0 ? (
                  <ul className="space-y-1">
                    {mergedSummary.pastDiseases.map((d, i) => (
                      <li key={i} className="text-sm text-red-100">• {d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-red-200">null</p>
                )}
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-5 h-5 text-green-400" />
                  <p className="text-xs text-red-300 uppercase tracking-wider">Emergency Contact</p>
                </div>
                <p className="text-xl font-semibold text-green-300">{withNullLabel(mergedSummary.emergencyContact)}</p>
              </div>

              {role === "doctor" && doctorId && name && (
                <div className="bg-red-900/60 border border-red-700 rounded-xl p-4 space-y-3">
                  <button
                    onClick={triggerOverride}
                    disabled={overrideLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    <LockOpen className="w-4 h-4" />
                    {overrideLoading ? "Enabling Override..." : "Emergency Override (1 hour)"}
                  </button>
                  {overrideError && <p className="text-xs text-amber-300">{overrideError}</p>}
                  {overrideData && (
                    <p className="text-xs text-green-300">
                      Override active. Full record access expires in {timeLeft}.
                    </p>
                  )}
                </div>
              )}

              {overrideData && (
                <div className="bg-red-900 border border-red-600 rounded-xl p-5">
                  <h3 className="text-sm uppercase tracking-wider text-red-300 mb-3">Uploaded Patient Records (Override)</h3>
                  <div className="space-y-3">
{overrideData.records.length === 0 ? (
                      <p className="text-sm text-red-200">No data found</p>
                    ) : (
                      overrideData.records.map((record) => (
                        <div key={record.id} className="rounded-lg border border-red-700 bg-red-950/40 p-3">
                          <p className="font-semibold">{record.title}</p>
                          <p className="text-xs text-red-300">{record.recordType} • {record.visitDate ?? "null"}</p>
                          <p className="text-xs mt-1">{record.description ?? "null"}</p>
                          <p className="text-xs mt-1 text-red-200">Doctor: {record.doctorName ?? "null"} | Hospital: {record.hospitalName ?? "null"}</p>
                          <p className="text-xs mt-1 text-red-200">Medicines: {record.prescriptions.length ? record.prescriptions.join(", ") : "null"}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


