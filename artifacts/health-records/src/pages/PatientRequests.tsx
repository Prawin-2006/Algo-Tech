import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Check, X } from "lucide-react";

type AccessRequest = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
};

export default function PatientRequests() {
  const { role, patientId } = useAuthStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/requests`);
      const data = (await res.json()) as AccessRequest[];
      if (Array.isArray(data)) setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [patientId]);

  if (role !== "patient" || !patientId) {
    return <p className="text-sm text-muted-foreground">Patient login required.</p>;
  }

  const respond = async (requestId: string, approved: boolean) => {
    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientId)}/requests/${encodeURIComponent(requestId)}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to update request");
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

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Patient Requests</h1>
        <p className="text-sm text-muted-foreground">Approve or reject doctor record-access requests.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          requests.map((request) => (
            <div key={request.id} className="border border-border rounded-lg p-3">
              <p className="text-sm font-medium text-foreground">{request.doctorName}</p>
              <p className="text-xs text-muted-foreground">Doctor ID: {request.doctorId}</p>
              <p className="text-xs text-muted-foreground mt-1">Status: {request.status}</p>
              {request.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => respond(request.id, true)}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => respond(request.id, false)}
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
  );
}
