import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useGetPatient, useGetPatientQr, useGetPatientRecords } from "@workspace/api-client-react";
import { ArrowLeft, FileText, Upload, ShieldAlert, QrCode, Hash } from "lucide-react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";

const LOCAL_PATIENT_CREDENTIALS_KEY = "healthchain-local-patient-credentials";

type LocalPatientCredential = {
  id: string;
  name: string;
  password: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  maritalStatus?: string;
  abhaNumber?: string;
  pastMedicalHistory?: string[];
  surgeryHistory?: string;
  currentMedicines?: string[];
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

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function decodeBase64Preview(contentBase64: string, limit = 1200): string | null {
  try {
    const binary = atob(contentBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const trimmed = text.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, limit);
  } catch {
    return null;
  }
}

type CompareLatestResponse = {
  patient: { id: string; name: string };
  latestRecord: { id: string; title: string; recordType: string; createdAt: string };
  previousRecord: { id: string; title: string; recordType: string; createdAt: string };
  comparison: {
    fieldChanges: Array<{ field: string; previous: string; latest: string }>;
    addedNotes: string[];
    removedNotes: string[];
  };
};

export default function PatientDetail() {
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [popupRecord, setPopupRecord] = useState<{
    recordId: string | null;
    patientId: string | null;
    title: string;
    mimeType: string;
    contentBase64: string | null;
    extractedHtml: string | null;
    extractedText: string | null;
  } | null>(null);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [snapshotUpdating, setSnapshotUpdating] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareLatestResponse | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const params = useParams<{ patientId: string }>();
  const requestedPatientId = params.patientId ?? "";
  const {
    role,
    patientId: loggedInPatientId,
    name,
    patientAge,
    patientGender,
    patientBloodGroup,
  } = useAuthStore();
  const { toast } = useToast();
  const isDoctorView = role === "doctor";

  const { data: patient, isLoading: patientLoading } = useGetPatient(requestedPatientId, {
    query: { enabled: !!requestedPatientId },
  });
  const { data: qr } = useGetPatientQr(requestedPatientId, {
    query: { enabled: !!requestedPatientId && Boolean(patient) },
  });
  const { data: records } = useGetPatientRecords(requestedPatientId, {
    query: { enabled: !!requestedPatientId },
  });

  const localPatient = requestedPatientId ? getLocalPatientById(requestedPatientId) : null;
  const patientDynamic = patient as Record<string, unknown> | undefined;
  const localByName = patient
    ? getAllLocalPatients().find(
        (entry) => entry.name.trim().toLowerCase() === patient.name.trim().toLowerCase(),
      )
    : null;
  const localProfile = localPatient ?? localByName;
  const patientView = patient
    ? {
        ...patient,
        age: chooseAge(patient.age, localProfile?.age, patientAge) ?? 0,
        gender: chooseKnownText(patient.gender, localProfile?.gender, patientGender) ?? "Unknown",
        bloodGroup: chooseKnownText(
          patient.bloodGroup,
          localProfile?.bloodGroup,
          patientBloodGroup,
        ) ?? "Unknown",
        dateOfBirth:
          chooseKnownText(
            typeof patientDynamic?.dateOfBirth === "string" ? patientDynamic.dateOfBirth : null,
            localProfile?.dateOfBirth,
          ) ?? null,
        maritalStatus:
          chooseKnownText(
            typeof patientDynamic?.maritalStatus === "string" ? patientDynamic.maritalStatus : null,
            localProfile?.maritalStatus,
          ) ?? null,
        abhaNumber:
          chooseKnownText(
            typeof patientDynamic?.abhaNumber === "string" ? patientDynamic.abhaNumber : null,
            localProfile?.abhaNumber,
          ) ?? null,
        pastMedicalHistory: (() => {
          const fromApi = normalizeStringList(patientDynamic?.pastMedicalHistory);
          if (fromApi.length > 0) return fromApi;
          const fromLocal = normalizeStringList(localProfile?.pastMedicalHistory);
          if (fromLocal.length > 0) return fromLocal;
          return patient.diseases ?? [];
        })(),
        surgeryHistory:
          chooseKnownText(
            typeof patientDynamic?.surgeryHistory === "string" ? patientDynamic.surgeryHistory : null,
            localProfile?.surgeryHistory,
          ) ?? null,
        currentMedicines: (() => {
          const fromApi = normalizeStringList(patientDynamic?.currentMedicines);
          if (fromApi.length > 0) return fromApi;
          return normalizeStringList(localProfile?.currentMedicines);
        })(),
      }
    : role === "patient" && loggedInPatientId === requestedPatientId && localPatient
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
          dateOfBirth: localPatient.dateOfBirth ?? null,
          maritalStatus: localPatient.maritalStatus ?? null,
          abhaNumber: localPatient.abhaNumber ?? null,
          pastMedicalHistory: normalizeStringList(localPatient.pastMedicalHistory),
          surgeryHistory: localPatient.surgeryHistory ?? null,
          currentMedicines: normalizeStringList(localPatient.currentMedicines),
          emergencyContact: null,
          createdAt: new Date().toISOString(),
        }
      : role === "patient" && loggedInPatientId === requestedPatientId
        ? {
            id: requestedPatientId,
            name: name ?? "Patient",
            age: patientAge ?? 0,
            gender: patientGender ?? "Unknown",
            bloodGroup: patientBloodGroup ?? "Unknown",
            phone: null,
            email: null,
            allergies: [] as string[],
            diseases: [] as string[],
            dateOfBirth: null,
            maritalStatus: null,
            abhaNumber: null,
            pastMedicalHistory: [] as string[],
            surgeryHistory: null,
            currentMedicines: [] as string[],
            emergencyContact: null,
            createdAt: new Date().toISOString(),
          }
      : null;

  useEffect(() => {
    if (!popupRecord || !popupRecord.contentBase64 || !popupRecord.mimeType.toLowerCase().includes("pdf")) {
      setPopupUrl(null);
      return;
    }

    try {
      const binary = atob(popupRecord.contentBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: popupRecord.mimeType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPopupUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setPopupUrl(null);
      return;
    }
  }, [popupRecord]);

  const summarizePopupRecord = async () => {
    if (!popupRecord) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const response = await fetch("/api/records/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: popupRecord.title,
          mimeType: popupRecord.mimeType,
          extractedText: popupRecord.extractedText,
          extractedHtml: popupRecord.extractedHtml,
          contentBase64: popupRecord.contentBase64,
        }),
      });
      const json = (await response.json()) as { summary?: string; error?: string };
      if (!response.ok || !json.summary) {
        throw new Error(json.error || "Could not summarize this record.");
      }
      setAiSummary(json.summary);
    } catch (error) {
      setAiSummaryError(error instanceof Error ? error.message : "Failed to summarize this record.");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const updateSnapshotFromRecord = async () => {
    if (!popupRecord?.patientId || !popupRecord?.recordId) return;
    setSnapshotUpdating(true);
    try {
      const response = await fetch(
        `/api/patients/${encodeURIComponent(popupRecord.patientId)}/records/${encodeURIComponent(popupRecord.recordId)}/update-snapshot`,
        { method: "POST" },
      );
      const raw = await response.text();
      const json = raw ? (JSON.parse(raw) as { error?: string }) : null;
      if (!response.ok) {
        throw new Error(json?.error || "Could not update snapshot.");
      }
      toast({
        title: "Snapshot updated",
        description: "Dashboard snapshot was updated from this record.",
      });
    } catch (error) {
      toast({
        title: "Snapshot update failed",
        description: error instanceof Error ? error.message : "Could not update snapshot.",
        variant: "destructive",
      });
    } finally {
      setSnapshotUpdating(false);
    }
  };

  const compareLatestRecords = async () => {
    if (!patientView?.id) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const response = await fetch(
        `/api/patients/${encodeURIComponent(patientView.id)}/records/compare-latest`,
      );
      const raw = await response.text();
      const json = raw ? (JSON.parse(raw) as CompareLatestResponse & { error?: string }) : null;
      if (!response.ok || !json) {
        throw new Error(json?.error || "Could not compare the latest records.");
      }
      setCompareResult(json);
      setCompareOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not compare the latest records.";
      setCompareError(message);
      toast({
        title: "Comparison failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCompareLoading(false);
    }
  };

  if (patientLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!patientView) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Patient not found</p>
        <Link href="/patients"><a className="text-primary text-sm hover:underline mt-2 inline-block">Back to patients</a></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/patients">
          <a className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </a>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">{patientView.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{patientView.id}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4">Patient Information</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Blood Group", value: patientView.bloodGroup },
                { label: "Age", value: `${patientView.age} years` },
                { label: "Gender", value: patientView.gender },
                { label: "Date of Birth", value: patientView.dateOfBirth ?? "N/A" },
                { label: "Marital Status", value: patientView.maritalStatus ?? "N/A" },
                { label: "ABHA Number", value: patientView.abhaNumber ?? "N/A" },
                { label: "Phone", value: patientView.phone ?? "N/A" },
                { label: "Email", value: patientView.email ?? "N/A" },
                { label: "Emergency Contact", value: patientView.emergencyContact ?? "N/A" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {patientView.allergies.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Known Allergies</p>
                <div className="flex flex-wrap gap-2">
                  {patientView.allergies.map((a, i) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs border border-destructive/20">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {patientView.diseases.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Medical Conditions</p>
                <div className="flex flex-wrap gap-2">
                  {patientView.diseases.map((d, i) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs border border-amber-200">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {patientView.pastMedicalHistory.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Past Medical History</p>
                <div className="flex flex-wrap gap-2">
                  {patientView.pastMedicalHistory.map((history, i) => (
                    <span key={`${history}-${i}`} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs border border-amber-200">
                      {history}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {patientView.surgeryHistory && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1">Surgery / Hospitalisation History</p>
                <p className="text-sm text-foreground">{patientView.surgeryHistory}</p>
              </div>
            )}

            {patientView.currentMedicines.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Current Medicines</p>
                <div className="flex flex-wrap gap-2">
                  {patientView.currentMedicines.map((medicine, i) => (
                    <span key={`${medicine}-${i}`} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20">
                      {medicine}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isDoctorView && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Medical Records ({records?.length ?? 0})
                {records && records.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                    Record Uploaded
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={compareLatestRecords}
                  disabled={compareLoading || !records || records.length < 2}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 font-medium hover:bg-amber-100 disabled:opacity-60"
                >
                  {compareLoading ? "Comparing..." : "Compare Last 2"}
                </button>
                <Link href={`/upload/${patientView.id}`}>
                  <a className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Upload Record
                  </a>
                </Link>
              </div>
            </div>
            {compareError && (
              <p className="text-xs text-destructive mb-3">{compareError}</p>
            )}

            {!records || records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No medical records yet</p>
                <Link href={`/upload/${patientView.id}`}>
                  <a className="text-primary text-xs hover:underline mt-1 inline-block">Upload first record</a>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((record) => {
                  const dynamicRecord = record as Record<string, unknown>;
                  const dynamicLabResults = dynamicRecord.labResults;
                  const labResults =
                    dynamicLabResults && typeof dynamicLabResults === "object"
                      ? (dynamicLabResults as Record<string, unknown>)
                      : null;

                  const documentName = typeof labResults?.documentName === "string" ? labResults.documentName : null;
                  const mimeType = typeof labResults?.mimeType === "string" ? labResults.mimeType : null;
                  const sizeBytes = typeof labResults?.sizeBytes === "number" ? labResults.sizeBytes : null;
                  const contentBase64 = typeof labResults?.contentBase64 === "string" ? labResults.contentBase64 : null;
                  const extractedHtml = typeof labResults?.extractedHtml === "string" ? labResults.extractedHtml : null;
                  const extractedText = typeof labResults?.extractedText === "string" ? labResults.extractedText.trim() : null;

                  const isTextDocument = !!mimeType && mimeType.startsWith("text/");
                  const textPreview =
                    extractedText ||
                    (isTextDocument && contentBase64 ? decodeBase64Preview(contentBase64) : null);

                  const isOpen = openRecordId === record.id;

                  return (
                    <div key={record.id} className="p-4 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                              {record.recordType}
                            </span>
                          </div>
                          <p className="font-medium text-foreground text-sm mt-2">{record.title}</p>
                          {record.description && (
                            <p className="text-xs text-muted-foreground mt-1">{record.description}</p>
                          )}

                          <button
                            type="button"
                            onClick={() => setOpenRecordId(isOpen ? null : record.id)}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                          >
                            View Record
                          </button>

                          {record.prescriptions.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Prescriptions:</p>
                              <ul className="mt-1 space-y-0.5">
                                {record.prescriptions.map((p, i) => (
                                  <li key={i} className="text-xs text-foreground flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-primary inline-block" />
                                    {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {isOpen && labResults && (
                            <div className="mt-3 rounded-md border border-border bg-background p-3">
                              <p className="text-xs font-semibold text-foreground mb-2">Document Data</p>
                              <div className="space-y-1 text-xs text-foreground">
                                {documentName && <p><span className="text-muted-foreground">Name:</span> {documentName}</p>}
                                {mimeType && <p><span className="text-muted-foreground">Type:</span> {mimeType}</p>}
                                {sizeBytes !== null && <p><span className="text-muted-foreground">Size:</span> {formatBytes(sizeBytes)}</p>}
                              </div>
                              {textPreview && (
                                <div className="mt-2">
                                  <p className="text-xs text-muted-foreground mb-1">Typed Preview:</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words rounded border border-border bg-muted p-2 max-h-40 overflow-auto">
                                    {textPreview}
                                  </pre>
                                </div>
                              )}
                              {contentBase64 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAiSummary(null);
                                    setAiSummaryError(null);
                                    setPopupRecord({
                                      recordId: record.id,
                                      patientId: patientView.id,
                                      title: documentName ?? record.title,
                                      mimeType: mimeType ?? "application/octet-stream",
                                      contentBase64,
                                      extractedHtml,
                                      extractedText: textPreview,
                                    });
                                  }}
                                  className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                                >
                                  View Record
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 mt-2">
                            <Hash className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-mono">
                              Blockchain Hash: {record.dataHash.substring(0, 16)}...
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          {record.doctorName && (
                            <p className="text-xs font-medium text-foreground">{record.doctorName}</p>
                          )}
                          {record.hospitalName && (
                            <p className="text-xs text-muted-foreground">{record.hospitalName}</p>
                          )}
                          {record.visitDate && (
                            <p className="text-xs text-muted-foreground mt-1">{record.visitDate}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              Health QR Code
            </h2>
            {qr ? (
              <div className="flex flex-col items-center gap-3">
                <img src={qr.qrDataUrl} alt="Patient QR Code" className="w-40 h-40 rounded-lg border border-border" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Scan for emergency access</p>
                  <p className="text-xs font-mono text-foreground mt-1 break-all">{qr.qrText}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 bg-muted rounded-lg">
                <QrCode className="w-8 h-8 text-muted-foreground opacity-40" />
              </div>
            )}
          </div>

          <Link href={`/emergency/${patientView.id}`}>
            <a className="flex items-center gap-2 w-full p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/20 transition-colors">
              <ShieldAlert className="w-4 h-4" />
              Emergency View
            </a>
          </Link>

          <Link href="/view-record">
            <a className="flex items-center gap-2 w-full p-3 bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors">
              <FileText className="w-4 h-4" />
              Access via View Record
            </a>
          </Link>
        </div>
      </div>

      {popupRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">{popupRecord.title}</p>
                <p className="text-xs text-muted-foreground">{popupRecord.mimeType}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPopupRecord(null);
                  setAiSummary(null);
                  setAiSummaryError(null);
                }}
                className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted"
              >
                Close
              </button>
            </div>
            <div className="p-4 bg-background h-[70vh] overflow-auto space-y-3">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={updateSnapshotFromRecord}
                  disabled={snapshotUpdating || !popupRecord.recordId || !popupRecord.patientId}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {snapshotUpdating ? "Updating..." : "Update"}
                </button>
                <button
                  type="button"
                  onClick={summarizePopupRecord}
                  disabled={aiSummaryLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-60"
                >
                  {aiSummaryLoading ? "Summarizing..." : "Summarize with AI"}
                </button>
              </div>
              {aiSummaryError && (
                <p className="text-xs text-destructive">{aiSummaryError}</p>
              )}
              {aiSummary && (
                <div className="rounded border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-1">AI Summary</p>
                  <pre className="text-xs whitespace-pre-wrap break-words">{aiSummary}</pre>
                </div>
              )}
              {popupRecord.mimeType.toLowerCase().includes("pdf") && popupUrl ? (
                <iframe
                  title="PDF Record Preview"
                  src={popupUrl}
                  className="w-full h-full min-h-[60vh] rounded border border-border bg-white"
                />
              ) : popupRecord.extractedHtml ? (
                <iframe
                  title="Record HTML Preview"
                  srcDoc={popupRecord.extractedHtml}
                  className="w-full h-full min-h-[60vh] rounded border border-border bg-white"
                />
              ) : popupRecord.extractedText ? (
                <pre className="text-xs whitespace-pre-wrap break-words rounded border border-border bg-card p-3">
                  {popupRecord.extractedText}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to preview this record.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {compareOpen && compareResult && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[88vh] bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">Latest 2 Record Comparison</p>
                <p className="text-xs text-muted-foreground">
                  {compareResult.patient.name} ({compareResult.patient.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted"
              >
                Close
              </button>
            </div>
            <div className="p-4 bg-background max-h-[74vh] overflow-auto space-y-4">
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div className="rounded border border-border bg-card p-3">
                  <p className="text-muted-foreground">Previous Record</p>
                  <p className="font-medium text-foreground mt-1">{compareResult.previousRecord.title}</p>
                  <p className="text-muted-foreground mt-1">
                    {new Date(compareResult.previousRecord.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="rounded border border-border bg-card p-3">
                  <p className="text-muted-foreground">Latest Record</p>
                  <p className="font-medium text-foreground mt-1">{compareResult.latestRecord.title}</p>
                  <p className="text-muted-foreground mt-1">
                    {new Date(compareResult.latestRecord.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="rounded border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Field Changes</p>
                {compareResult.comparison.fieldChanges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No key field changes detected.</p>
                ) : (
                  <div className="space-y-2">
                    {compareResult.comparison.fieldChanges.map((item) => (
                      <div key={item.field} className="rounded border border-border bg-muted/30 p-2">
                        <p className="text-xs font-medium text-foreground">{item.field}</p>
                        <p className="text-xs text-muted-foreground">Previous: {item.previous}</p>
                        <p className="text-xs text-foreground">Latest: {item.latest}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-2">Added Notes</p>
                  {compareResult.comparison.addedNotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No added notes.</p>
                  ) : (
                    <ul className="space-y-1">
                      {compareResult.comparison.addedNotes.map((line, index) => (
                        <li key={`${line}-${index}`} className="text-xs text-foreground">+ {line}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-rose-700 mb-2">Removed Notes</p>
                  {compareResult.comparison.removedNotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No removed notes.</p>
                  ) : (
                    <ul className="space-y-1">
                      {compareResult.comparison.removedNotes.map((line, index) => (
                        <li key={`${line}-${index}`} className="text-xs text-foreground">- {line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
