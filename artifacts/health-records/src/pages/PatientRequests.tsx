import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Check, Send, X } from "lucide-react";

type AccessRequest = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
};

type GuardianRequest = {
  id: string;
  patientId: string;
  guardianName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
};

const GUARDIAN_COMPAT_PREFIX = "guardian:";

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildGuardianCompatDoctorId(guardianName: string): string {
  const normalized = guardianName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return `${GUARDIAN_COMPAT_PREFIX}${normalized || "user"}`;
}

function toGuardianRequestsFromCompat(
  rows: AccessRequest[],
  guardianName?: string,
): GuardianRequest[] {
  const normalizedName = guardianName?.trim().toLowerCase();
  return rows
    .filter((item) => item.doctorId.toLowerCase().startsWith(GUARDIAN_COMPAT_PREFIX))
    .filter((item) =>
      normalizedName ? item.doctorName.trim().toLowerCase() === normalizedName : true,
    )
    .map((item) => ({
      id: item.id,
      patientId: item.patientId,
      guardianName: item.doctorName,
      status: item.status,
      requestedAt: item.requestedAt,
    }));
}

export default function PatientRequests() {
  const { role, patientId, name } = useAuthStore();
  const { toast } = useToast();
  const [doctorRequests, setDoctorRequests] = useState<AccessRequest[]>([]);
  const [guardianRequests, setGuardianRequests] = useState<GuardianRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingGuardianRequest, setSendingGuardianRequest] = useState(false);

  const isGuardianView = role === "guardian";
  const isPatientView = role === "patient";
  const pageTitle = isGuardianView ? "Guardian Requests" : "Patient Requests";
  const pageDescription = isGuardianView
    ? "Send a request to become guardian for this patient. Patient must permit it."
    : "Approve or reject doctor and guardian access requests.";

  const loadDoctorRequests = async () => {
    if (!patientId) return;
    const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/requests`);
    const data = (await readJsonSafe<AccessRequest[]>(res)) ?? [];
    if (Array.isArray(data)) {
      setDoctorRequests(
        data.filter(
          (item) => !item.doctorId.toLowerCase().startsWith(GUARDIAN_COMPAT_PREFIX),
        ),
      );
    }
  };

  const loadGuardianRequests = async () => {
    if (!patientId) return;
    const guardianNameQuery =
      isGuardianView && name ? `?guardianName=${encodeURIComponent(name)}` : "";
    const res = await fetch(
      `/api/patients/${encodeURIComponent(patientId)}/guardian-requests${guardianNameQuery}`,
    );
    if (res.ok) {
      const data = (await readJsonSafe<GuardianRequest[]>(res)) ?? [];
      if (Array.isArray(data)) {
        setGuardianRequests(data);
        return;
      }
    }

    // Backward compatibility: older backend exposes only doctor request endpoints.
    const compat = await fetch(`/api/patients/${encodeURIComponent(patientId)}/requests`);
    const compatData = (await readJsonSafe<AccessRequest[]>(compat)) ?? [];
    const converted = toGuardianRequestsFromCompat(
      Array.isArray(compatData) ? compatData : [],
      isGuardianView ? name : undefined,
    );
    setGuardianRequests(converted);
  };

  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      if (isPatientView) {
        await Promise.all([loadDoctorRequests(), loadGuardianRequests()]);
      } else if (isGuardianView) {
        await loadGuardianRequests();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [patientId, role, name]);

  if ((role !== "patient" && role !== "guardian") || !patientId) {
    return <p className="text-sm text-muted-foreground">Patient or guardian login required.</p>;
  }

  const respondDoctorRequest = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const json = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(json?.error || "Failed to update doctor request");
      toast({ title: approved ? "Access approved" : "Access rejected" });
      load();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const respondGuardianRequest = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientId)}/guardian-requests/${encodeURIComponent(requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const json = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) {
        // Backward compatibility: route may not exist on older backend.
        const compat = await fetch(
          `/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/respond`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approved }),
          },
        );
        const compatJson = await readJsonSafe<{ error?: string }>(compat);
        if (!compat.ok) {
          throw new Error(compatJson?.error || json?.error || "Failed to update guardian request");
        }
      }
      toast({ title: approved ? "Guardian permitted" : "Guardian rejected" });
      load();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const sendGuardianRequest = async () => {
    if (!name) {
      toast({
        title: "Request failed",
        description: "Guardian name is missing.",
        variant: "destructive",
      });
      return;
    }
    setSendingGuardianRequest(true);
    try {
      const res = await fetch("/api/guardians/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          guardianName: name,
        }),
      });
      const json = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) {
        // Backward compatibility: route may not exist on older backend.
        const compat = await fetch(
          "/api/records/request-access",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId: patientId.trim(),
              doctorId: buildGuardianCompatDoctorId(name),
              doctorName: name,
            }),
          },
        );
        const compatJson = await readJsonSafe<{ error?: string }>(compat);
        if (!compat.ok) {
          throw new Error(compatJson?.error || json?.error || "Could not send guardian request");
        }
      }
      toast({
        title: "Request sent",
        description: "Patient can now permit or reject your guardian request.",
      });
      load();
    } catch (error) {
      toast({
        title: "Request failed",
        description: error instanceof Error ? error.message : "Could not send request.",
        variant: "destructive",
      });
    } finally {
      setSendingGuardianRequest(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{pageDescription}</p>
      </div>

      {isGuardianView && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <button
            onClick={sendGuardianRequest}
            disabled={sendingGuardianRequest}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            {sendingGuardianRequest ? "Sending..." : "Request to be Guardian"}
          </button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading requests...</p>
          ) : guardianRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guardian requests yet.</p>
          ) : (
            <div className="space-y-3">
              {guardianRequests.map((request) => (
                <div key={request.id} className="border border-border rounded-lg p-3">
                  <p className="text-sm font-medium text-foreground">{request.guardianName}</p>
                  <p className="text-xs text-muted-foreground mt-1">Status: {request.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isPatientView && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Doctor Access Requests</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading requests...</p>
            ) : doctorRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No doctor requests yet.</p>
            ) : (
              doctorRequests.map((request) => (
                <div key={request.id} className="border border-border rounded-lg p-3">
                  <p className="text-sm font-medium text-foreground">{request.doctorName}</p>
                  <p className="text-xs text-muted-foreground">Doctor ID: {request.doctorId}</p>
                  <p className="text-xs text-muted-foreground mt-1">Status: {request.status}</p>
                  {request.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => respondDoctorRequest(request.id, true)}
                        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => respondDoctorRequest(request.id, false)}
                        className="px-3 py-1.5 rounded border border-border text-xs font-medium inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Guardian Permission Requests</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading requests...</p>
            ) : guardianRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guardian requests yet.</p>
            ) : (
              guardianRequests.map((request) => (
                <div key={request.id} className="border border-border rounded-lg p-3">
                  <p className="text-sm font-medium text-foreground">{request.guardianName}</p>
                  <p className="text-xs text-muted-foreground mt-1">Status: {request.status}</p>
                  {request.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => respondGuardianRequest(request.id, true)}
                        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Permit
                      </button>
                      <button
                        onClick={() => respondGuardianRequest(request.id, false)}
                        className="px-3 py-1.5 rounded border border-border text-xs font-medium inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
