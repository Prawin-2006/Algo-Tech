import { Link } from "wouter";
import {
  useGetPatient,
  useGetPatientRecords,
  useGetStats,
  useListPatients,
  useListAuditLogs,
} from "@workspace/api-client-react";
import { Users, FileText, ShieldAlert, Activity, UserPlus, QrCode, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuth";

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLatestVitals(records: Array<Record<string, unknown>>): { bp: string | null; sugar: string | null } {
  const ordered = [...records].sort((a, b) => {
    const aDate = new Date(String(a.createdAt ?? 0)).getTime();
    const bDate = new Date(String(b.createdAt ?? 0)).getTime();
    return bDate - aDate;
  });

  for (const record of ordered) {
    const labResults = record.labResults;
    if (!labResults || typeof labResults !== "object") continue;
    const lab = labResults as Record<string, unknown>;
    const bp =
      asOptionalString(lab.bp) ??
      asOptionalString(lab.bloodPressure) ??
      asOptionalString(lab.BP) ??
      asOptionalString(lab["blood_pressure"]);
    const sugar =
      asOptionalString(lab.sugar) ??
      asOptionalString(lab.bloodSugar) ??
      asOptionalString(lab.glucose) ??
      asOptionalString(lab["blood_sugar"]);

    if (bp || sugar) {
      return { bp: bp ?? null, sugar: sugar ?? null };
    }
  }

  return { bp: null, sugar: null };
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

type VitalIndicator = {
  status: string;
  toneClass: string;
  progressClass: string;
  progressPercent: number | null;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getBpIndicator(bp: string | null): VitalIndicator {
  if (!bp) {
    return {
      status: "Unknown",
      toneClass: "text-muted-foreground",
      progressClass: "bg-muted-foreground/40",
      progressPercent: null,
    };
  }

  const match = bp.match(/([0-9]{2,3})\s*\/\s*([0-9]{2,3})/);
  if (!match) {
    return {
      status: "Unclear",
      toneClass: "text-muted-foreground",
      progressClass: "bg-muted-foreground/40",
      progressPercent: null,
    };
  }

  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  const progressPercent = clampPercent(((systolic - 80) / (200 - 80)) * 100);

  if (systolic < 120 && diastolic < 80) {
    return {
      status: "Normal",
      toneClass: "text-emerald-700",
      progressClass: "bg-emerald-500",
      progressPercent,
    };
  }
  if (systolic <= 129 && diastolic < 80) {
    return {
      status: "Elevated",
      toneClass: "text-amber-700",
      progressClass: "bg-amber-500",
      progressPercent,
    };
  }
  if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
    return {
      status: "High Stage 1",
      toneClass: "text-orange-700",
      progressClass: "bg-orange-500",
      progressPercent,
    };
  }
  return {
    status: "High Stage 2",
    toneClass: "text-rose-700",
    progressClass: "bg-rose-500",
    progressPercent,
  };
}

function getSugarIndicator(sugar: string | null): VitalIndicator {
  if (!sugar) {
    return {
      status: "Unknown",
      toneClass: "text-muted-foreground",
      progressClass: "bg-muted-foreground/40",
      progressPercent: null,
    };
  }

  const match = sugar.match(/([0-9]{2,3}(?:\.[0-9]+)?)/);
  const sugarValue = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(sugarValue)) {
    return {
      status: "Unclear",
      toneClass: "text-muted-foreground",
      progressClass: "bg-muted-foreground/40",
      progressPercent: null,
    };
  }

  const progressPercent = clampPercent(((sugarValue - 60) / (250 - 60)) * 100);

  if (sugarValue < 70) {
    return {
      status: "Low",
      toneClass: "text-rose-700",
      progressClass: "bg-rose-500",
      progressPercent,
    };
  }
  if (sugarValue <= 99) {
    return {
      status: "Normal",
      toneClass: "text-emerald-700",
      progressClass: "bg-emerald-500",
      progressPercent,
    };
  }
  if (sugarValue <= 125) {
    return {
      status: "Prediabetes",
      toneClass: "text-amber-700",
      progressClass: "bg-amber-500",
      progressPercent,
    };
  }
  return {
    status: "High",
    toneClass: "text-rose-700",
    progressClass: "bg-rose-500",
    progressPercent,
  };
}

export default function Dashboard() {
  const { role, patientId, patientAge, patientBloodGroup } = useAuthStore();
  const isPatientView = role === "patient" && Boolean(patientId);

  const { data: stats, isLoading: statsLoading } = useGetStats({
    query: { enabled: !isPatientView },
  });
  const { data: patients } = useListPatients({
    query: { enabled: !isPatientView },
  });
  const { data: auditLogs } = useListAuditLogs({
    query: { enabled: !isPatientView },
  });
  const { data: ownPatient } = useGetPatient(patientId ?? "", {
    query: { enabled: isPatientView && Boolean(patientId) },
  });
  const { data: ownRecords } = useGetPatientRecords(patientId ?? "", {
    query: { enabled: isPatientView && Boolean(patientId) },
  });

  const patientList = Array.isArray(patients) ? patients : [];
  const auditLogList = Array.isArray(auditLogs) ? auditLogs : [];

  const recentPatients = patientList.slice(-3).reverse();
  const ownRecordList = (Array.isArray(ownRecords) ? ownRecords : []) as Array<Record<string, unknown>>;
  const patientVitals = getLatestVitals(ownRecordList);
  const bpIndicator = getBpIndicator(patientVitals.bp);
  const sugarIndicator = getSugarIndicator(patientVitals.sugar);
  const snapshotBloodGroup = chooseKnownText(patientBloodGroup, ownPatient?.bloodGroup) ?? "Unknown";
  const snapshotAgeNumber = chooseAge(patientAge, ownPatient?.age);
  const snapshotAge = snapshotAgeNumber ? `${snapshotAgeNumber} years` : "Unknown";
  const patientAllergies = Array.isArray(ownPatient?.allergies) && ownPatient.allergies.length > 0
    ? ownPatient.allergies.join(", ")
    : "None";

  const recentAudit = auditLogList.slice(-5).reverse();

  const totalPatients = isPatientView ? 1 : (stats?.totalPatients ?? 0);
  const totalRecords = isPatientView ? (ownRecords?.length ?? 0) : (stats?.totalRecords ?? 0);
  const totalAuditLogs = isPatientView ? 0 : (stats?.totalAuditLogs ?? 0);
  const recentAccessCount = isPatientView ? 0 : (stats?.recentAccessCount ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">HealthChain - Secure Medical Records System</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Patients"
          value={statsLoading && !isPatientView ? "-" : totalPatients}
          icon={Users}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label="Medical Records"
          value={statsLoading && !isPatientView ? "-" : totalRecords}
          icon={FileText}
          color="bg-accent/20 text-amber-700"
        />
        <StatCard
          label="Audit Entries"
          value={statsLoading && !isPatientView ? "-" : totalAuditLogs}
          icon={ShieldAlert}
          color="bg-destructive/10 text-destructive"
        />
        <StatCard
          label="Access Events"
          value={statsLoading && !isPatientView ? "-" : recentAccessCount}
          icon={Activity}
          color="bg-muted text-muted-foreground"
        />
      </div>

      {isPatientView ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Health Snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">BP</p>
              <p className="text-sm font-semibold text-foreground mt-1">{patientVitals.bp ?? "Unknown"}</p>
              <p className={cn("text-[11px] mt-1 font-medium", bpIndicator.toneClass)}>
                {bpIndicator.status}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", bpIndicator.progressClass)}
                  style={{ width: `${bpIndicator.progressPercent ?? 0}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">Blood Group</p>
              <p className="text-sm font-semibold text-foreground mt-1">{snapshotBloodGroup}</p>
            </div>
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">Age</p>
              <p className="text-sm font-semibold text-foreground mt-1">{snapshotAge}</p>
            </div>
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">Sugar Level</p>
              <p className="text-sm font-semibold text-foreground mt-1">{patientVitals.sugar ?? "Unknown"}</p>
              <p className={cn("text-[11px] mt-1 font-medium", sugarIndicator.toneClass)}>
                {sugarIndicator.status}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", sugarIndicator.progressClass)}
                  style={{ width: `${sugarIndicator.progressPercent ?? 0}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">Allergies</p>
              <p className="text-sm font-semibold text-foreground mt-1 break-words">{patientAllergies}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Quick Actions</h2>
            </div>
            <div className="space-y-2">
              <Link href="/register">
                <a className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors border border-border group">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <UserPlus className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Register New Patient</p>
                    <p className="text-xs text-muted-foreground">Create a secure patient health ID</p>
                  </div>
                </a>
              </Link>
              <Link href="/patients">
                <a className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors border border-border group">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <QrCode className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">View Patient Records</p>
                    <p className="text-xs text-muted-foreground">Access QR codes and medical history</p>
                  </div>
                </a>
              </Link>
              <Link href="/chatbot">
                <a className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors border border-border group">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Health Chatbot</p>
                    <p className="text-xs text-muted-foreground">Query patient data by keyword</p>
                  </div>
                </a>
              </Link>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Recent Patients</h2>
              <Link href="/patients">
                <a className="text-xs text-primary hover:underline">View all</a>
              </Link>
            </div>
            {recentPatients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No patients registered yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPatients.map((p) => (
                  <Link key={p.id} href={`/patients/${p.id}`}>
                    <a className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {p.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.bloodGroup} - {p.gender} - {p.age}y</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{p.id}</span>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!isPatientView && recentAudit.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent Access Log</h2>
            <Link href="/audit">
              <a className="text-xs text-primary hover:underline">View all</a>
            </Link>
          </div>
          <div className="space-y-2">
            {recentAudit.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  log.isEmergencyOverride ? "bg-destructive" : "bg-primary"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{log.doctorName}</span> accessed{" "}
                    <span className="font-medium">{log.patientName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{log.reason}</p>
                </div>
                {log.isEmergencyOverride && (
                  <span className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full flex-shrink-0">
                    Emergency
                  </span>
                )}
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(log.accessedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
