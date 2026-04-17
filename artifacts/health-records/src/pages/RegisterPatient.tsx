import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useRegisterPatient,
  useUploadMedicalRecord,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/useAuth";
import { UserPlus, FileUp, Check, X } from "lucide-react";

const ACCEPTED_DOC_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".rtf"];
const ACCEPTED_DOC_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
  "text/rtf",
];
const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024;
const LOCAL_PATIENT_CREDENTIALS_KEY = "healthchain-local-patient-credentials";

type AccessRequest = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
};

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

function isAllowedDocument(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ACCEPTED_DOC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = ACCEPTED_DOC_MIME_TYPES.includes(file.type);
  return hasAllowedExtension || hasAllowedMime;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const marker = ",";
      const idx = raw.indexOf(marker);
      resolve(idx >= 0 ? raw.slice(idx + 1) : raw);
    };
    reader.onerror = () => reject(new Error("Failed to read document."));
    reader.readAsDataURL(file);
  });
}

export default function RegisterPatient() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const {
    role,
    patientId,
    name,
    patientAge,
    patientGender,
    patientBloodGroup,
    loginPatient,
  } = useAuthStore();
  const registerMutation = useRegisterPatient();
  const uploadRecordMutation = useUploadMedicalRecord();

  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [resolvedPatientId, setResolvedPatientId] = useState<string | null>(patientId ?? null);

  const localPatient = useMemo(
    () => (patientId ? getLocalPatientById(patientId) : null),
    [patientId],
  );

  const profileName = (name || localPatient?.name || "").trim();
  const profileAge = chooseAge(patientAge, localPatient?.age) ?? 0;
  const profileGender = chooseKnownText(patientGender, localPatient?.gender) ?? "Unknown";
  const profileBloodGroup =
    chooseKnownText(patientBloodGroup, localPatient?.bloodGroup) ?? "Unknown";

  useEffect(() => {
    setResolvedPatientId(patientId ?? null);
  }, [patientId]);

  if (role === "doctor") {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-card border border-border rounded-xl p-6">
        <h1 className="text-lg font-semibold text-foreground">Doctor Access</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Doctors cannot register patients from this page. Use View Record to request and view records after patient approval.
        </p>
      </div>
    );
  }

  const resolveCurrentPatientId = async (): Promise<string | null> => {
    if (patientId) return patientId;
    if (!profileName) return null;

    try {
      const res = await fetch("/api/patients");
      if (!res.ok) return null;
      const list = (await res.json()) as Array<{ id: string; name: string }>;
      const found = list.find(
        (item) => item.name.trim().toLowerCase() === profileName.toLowerCase(),
      );
      if (!found?.id) return null;
      setResolvedPatientId(found.id);
      loginPatient(found.id, profileName, {
        age: profileAge,
        gender: profileGender,
        bloodGroup: profileBloodGroup,
      });
      return found.id;
    } catch {
      return null;
    }
  };

  const loadRequests = async () => {
    const activePatientId = resolvedPatientId ?? (await resolveCurrentPatientId());
    if (!activePatientId) {
      setRequests([]);
      return;
    }
    setRequestsLoading(true);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(activePatientId)}/requests`);
      const data = (await res.json()) as AccessRequest[];
      if (Array.isArray(data)) {
        setRequests(data);
      } else {
        setRequests([]);
      }
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "patient") return;
    void loadRequests();
    const intervalId = window.setInterval(() => {
      void loadRequests();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [role, patientId, resolvedPatientId, profileName]);

  const respondToRequest = async (requestId: string, approved: boolean) => {
    const activePatientId = resolvedPatientId ?? (await resolveCurrentPatientId());
    if (!activePatientId) return;
    setRespondingRequestId(requestId);
    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(activePatientId)}/requests/${encodeURIComponent(requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to update request.");
      }
      toast({ title: approved ? "Access accepted" : "Access rejected" });
      await loadRequests();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRespondingRequestId(null);
    }
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setRecordFile(null);
      return;
    }

    if (!isAllowedDocument(file)) {
      toast({
        title: "Unsupported file type",
        description: "Only PDF, DOC, DOCX, TXT, and RTF records are allowed.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_DOC_SIZE_BYTES) {
      toast({
        title: "File too large",
        description: "Upload a document up to 10 MB.",
        variant: "destructive",
      });
      return;
    }

    setRecordFile(file);
  };

  const createPatientFromLoginProfile = async () => {
    if (!profileName) {
      throw new Error("Patient name is missing. Please sign in again.");
    }

    const created = await registerMutation.mutateAsync({
      data: {
        name: profileName,
        age: profileAge,
        gender: profileGender,
        bloodGroup: profileBloodGroup,
        allergies: [],
        diseases: [],
      } as any,
    });

    loginPatient(created.id, created.name, {
      age: profileAge,
      gender: profileGender,
      bloodGroup: profileBloodGroup,
    });

    return created.id;
  };

  const uploadForPatient = async (targetPatientId: string) => {
    if (!recordFile) {
      throw new Error("Please upload a patient record document first.");
    }

    const contentBase64 = await toBase64(recordFile);
    await uploadRecordMutation.mutateAsync({
      patientId: targetPatientId,
      data: {
        recordType: "document",
        title: `Patient Record: ${recordFile.name}`,
        description: "Soft-copy document uploaded by patient",
        labResults: {
          documentName: recordFile.name,
          mimeType: recordFile.type || "application/octet-stream",
          sizeBytes: recordFile.size,
          contentBase64,
        },
        visitDate: new Date().toISOString().slice(0, 10),
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recordFile) {
      toast({
        title: "Upload required",
        description: "Please choose a patient record document.",
        variant: "destructive",
      });
      return;
    }

    try {
      let targetPatientId = patientId;
      if (!targetPatientId) {
        targetPatientId = await createPatientFromLoginProfile();
      }

      try {
        await uploadForPatient(targetPatientId);
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("404") || message.includes("not found")) {
          targetPatientId = await createPatientFromLoginProfile();
          await uploadForPatient(targetPatientId);
        } else {
          throw error;
        }
      }

      queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      toast({ title: "Record uploaded", description: `Patient ID: ${targetPatientId}` });
      navigate(`/patients/${targetPatientId}`);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Register Patient</h1>
          <p className="text-sm text-muted-foreground">Patient details are auto-filled from login profile</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-medium text-foreground text-sm">Patient Record Soft Copy (Document Only)</h2>
          <p className="text-xs text-muted-foreground">
            Logged in as <span className="font-medium text-foreground">{profileName || "Patient"}</span>
            {resolvedPatientId ? (
              <>
                {" "}- ID: <span className="font-mono">{resolvedPatientId}</span>
              </>
            ) : null}
          </p>
          <label className="block text-xs text-muted-foreground">
            Accepted: PDF, DOC, DOCX, TXT, RTF - Max size: 10 MB
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/rtf,text/rtf"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <FileUp className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          {recordFile && (
            <p className="text-xs text-foreground">
              Selected: <span className="font-medium">{recordFile.name}</span>
            </p>
          )}

          {role === "patient" && (
            <div className="pt-3 mt-3 border-t border-border space-y-3">
              <h3 className="font-medium text-foreground text-sm">Doctor Access Requests</h3>
              {requestsLoading ? (
                <p className="text-xs text-muted-foreground">Loading requests...</p>
              ) : requests.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending requests.</p>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-border p-3 bg-background">
                    <p className="text-sm font-medium text-foreground">{request.doctorName}</p>
                    <p className="text-xs text-muted-foreground">Doctor ID: {request.doctorId}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Status: <span className="font-medium">{request.status}</span>
                    </p>
                    {request.status === "pending" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          disabled={respondingRequestId === request.id}
                          onClick={() => respondToRequest(request.id, true)}
                          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={respondingRequestId === request.id}
                          onClick={() => respondToRequest(request.id, false)}
                          className="px-3 py-1.5 rounded border border-border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={registerMutation.isPending || uploadRecordMutation.isPending}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {registerMutation.isPending || uploadRecordMutation.isPending
            ? "Uploading..."
            : "Upload Record"}
        </button>
      </form>
    </div>
  );
}
