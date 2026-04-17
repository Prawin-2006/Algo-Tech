import { Link } from "wouter";
import { useGetPatient, useGetPatientRecords, useListPatients } from "@workspace/api-client-react";
import { Users, Search, QrCode, Eye, Upload } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuth";

const bloodGroupColors: Record<string, string> = {
  "O+": "bg-red-50 text-red-700 border-red-200",
  "O-": "bg-red-100 text-red-800 border-red-300",
  "A+": "bg-blue-50 text-blue-700 border-blue-200",
  "A-": "bg-blue-100 text-blue-800 border-blue-300",
  "B+": "bg-green-50 text-green-700 border-green-200",
  "B-": "bg-green-100 text-green-800 border-green-300",
  "AB+": "bg-purple-50 text-purple-700 border-purple-200",
  "AB-": "bg-purple-100 text-purple-800 border-purple-300",
};
const LOCAL_PATIENT_CREDENTIALS_KEY = "healthchain-local-patient-credentials";

type LocalPatientCredential = {
  id: string;
  name: string;
  password: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
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

function getAllLocalPatients(): LocalPatientCredential[] {
  try {
    const raw = localStorage.getItem(LOCAL_PATIENT_CREDENTIALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalPatientCredential => {
      if (!item || typeof item !== "object") return false;
      const rec = item as Record<string, unknown>;
      return typeof rec.id === "string" && typeof rec.name === "string";
    });
  } catch {
    return [];
  }
}

function chooseKnownText(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed;
  }
  return undefined;
}

function chooseAge(...values: Array<number | null | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

export default function PatientList() {
  const { role, patientId, name, patientAge, patientGender, patientBloodGroup } = useAuthStore();
  const isPatientView = role === "patient" && Boolean(patientId);

  const localPatients = getAllLocalPatients();

  const { data: patients, isLoading: isListLoading } = useListPatients({
    query: { enabled: !isPatientView },
  });
  const { data: ownPatient, isLoading: isOwnLoading } = useGetPatient(patientId ?? "", {
    query: { enabled: isPatientView && Boolean(patientId) },
  });
  const { data: ownRecords } = useGetPatientRecords(patientId ?? "", {
    query: { enabled: isPatientView && Boolean(patientId) },
  });

  const [search, setSearch] = useState("");
  const isLoading = isPatientView ? isOwnLoading : isListLoading;

  const localPatient = isPatientView && patientId ? getLocalPatientById(patientId) : null;
  const ownPatientView = ownPatient
    ? {
        ...ownPatient,
        age: chooseAge(ownPatient.age, localPatient?.age, patientAge) ?? 0,
        gender: chooseKnownText(ownPatient.gender, localPatient?.gender, patientGender) ?? "Unknown",
        bloodGroup: chooseKnownText(
          ownPatient.bloodGroup,
          localPatient?.bloodGroup,
          patientBloodGroup,
        ) ?? "Unknown",
      }
    : localPatient
      ? {
          id: localPatient.id,
          name: localPatient.name || name || "Patient",
          age: localPatient.age ?? patientAge ?? 0,
          gender: localPatient.gender ?? patientGender ?? "Unknown",
          bloodGroup: localPatient.bloodGroup ?? patientBloodGroup ?? "Unknown",
          phone: null,
          email: null,
          allergies: [] as string[],
          diseases: [] as string[],
          emergencyContact: null,
          createdAt: new Date().toISOString(),
        }
      : isPatientView && patientId
        ? {
            id: patientId,
            name: name ?? "Patient",
            age: patientAge ?? 0,
            gender: patientGender ?? "Unknown",
            bloodGroup: patientBloodGroup ?? "Unknown",
            phone: null,
            email: null,
            allergies: [] as string[],
            diseases: [] as string[],
            emergencyContact: null,
            createdAt: new Date().toISOString(),
          }
      : null;

  const normalizedList = (patients ?? []).map((p) => {
    const localById = localPatients.find((l) => l.id === p.id);
    const localByName = localPatients.find(
      (l) => l.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
    );
    const local = localById ?? localByName;
    return {
      ...p,
      age: chooseAge(p.age, local?.age) ?? 0,
      gender: chooseKnownText(p.gender, local?.gender) ?? "Unknown",
      bloodGroup: chooseKnownText(p.bloodGroup, local?.bloodGroup) ?? "Unknown",
    };
  });

  const sourcePatients = isPatientView ? (ownPatientView ? [ownPatientView] : []) : normalizedList;

  const filtered = sourcePatients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    p.bloodGroup.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} {isPatientView ? "profile shown" : "registered patients"}
          </p>
        </div>
        {!isPatientView && (
          <Link href="/register">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
              <Users className="w-4 h-4" />
              New Patient
            </span>
          </Link>
        )}
      </div>

      {!isPatientView && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Search by name, ID, or blood group..."
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No patients found</p>
          <p className="text-sm mt-1">
            {isPatientView
              ? "Your profile is not available right now."
              : search
                ? "Try a different search term"
                : "Register a patient to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const hasUploadedRecord = isPatientView
              ? (ownRecords?.length ?? 0) > 0
              : false;

            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                  {p.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{p.name}</p>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full border font-medium",
                      bloodGroupColors[p.bloodGroup] ?? "bg-muted text-muted-foreground border-border"
                    )}>
                      {p.bloodGroup}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.gender} - {p.age} years - ID: <span className="font-mono">{p.id}</span>
                  </p>
                  {hasUploadedRecord && (
                    <p className="text-xs mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium">
                        Record Uploaded
                      </span>
                    </p>
                  )}
                  {p.allergies.length > 0 && (
                    <p className="text-xs text-destructive mt-1">
                      Allergies: {p.allergies.join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link href={`/emergency/${p.id}`}>
                    <a className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Emergency view">
                      <QrCode className="w-4 h-4" />
                    </a>
                  </Link>
                  <Link href={`/upload/${p.id}`}>
                    <a className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Upload record">
                      <Upload className="w-4 h-4" />
                    </a>
                  </Link>
                  <Link href={`/patients/${p.id}`}>
                    <a className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                      {hasUploadedRecord ? "View Record" : "View"}
                    </a>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
