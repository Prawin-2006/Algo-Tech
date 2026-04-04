import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useRequestFullAccess } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Lock, FileText, Hash, AlertTriangle } from "lucide-react";

export default function FullAccess() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId ?? "";
  const [, navigate] = useLocation();
  const { doctorId, name } = useAuthStore();
  const { toast } = useToast();
  const accessMutation = useRequestFullAccess();

  const [reason, setReason] = useState("");
  const [isEmergencyOverride, setIsEmergencyOverride] = useState(false);
  const [fullData, setFullData] = useState<NonNullable<ReturnType<typeof useRequestFullAccess>["data"]> | null>(null);

  if (!doctorId) {
    return (
      <div className="max-w-md mx-auto mt-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Authentication Required</h1>
        <p className="text-sm text-muted-foreground">You must be logged in as a doctor to access full patient records.</p>
        <Link href="/doctor-login">
          <a className="inline-block mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
            Doctor Login
          </a>
        </Link>
      </div>
    );
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: "Access reason is required", variant: "destructive" });
      return;
    }

    accessMutation.mutate(
      {
        patientId,
        data: {
          doctorId: doctorId!,
          doctorName: name!,
          reason: reason.trim(),
          isEmergencyOverride,
        },
      },
      {
        onSuccess: (data) => {
          setFullData(data);
          toast({ title: "Access granted", description: "Access logged to audit trail" });
        },
        onError: () => {
          toast({ title: "Access failed", variant: "destructive" });
        },
      }
    );
  };

  if (fullData) {
    const { patient, records } = fullData;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{patient.name} — Full Record</h1>
            <p className="text-sm text-muted-foreground">Accessed by {name} · Logged to audit trail</p>
          </div>
          <Link href={`/patients/${patientId}`}>
            <a className="text-sm text-primary hover:underline">Back to patient</a>
          </Link>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            This access has been logged. Doctor: <span className="font-medium">{name}</span> · Reason: <span className="font-medium">{reason}</span>
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Patient Information</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Blood Group", value: patient.bloodGroup },
              { label: "Age", value: `${patient.age}y` },
              { label: "Gender", value: patient.gender },
              { label: "Phone", value: patient.phone ?? "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {patient.allergies.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-destructive" />
                Allergies
              </p>
              <div className="flex flex-wrap gap-2">
                {patient.allergies.map((a, i) => (
                  <span key={i} className="px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs border border-destructive/20">{a}</span>
                ))}
              </div>
            </div>
          )}

          {patient.diseases.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Conditions</p>
              <div className="flex flex-wrap gap-2">
                {patient.diseases.map((d, i) => (
                  <span key={i} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs border border-amber-200">{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            All Medical Records ({records.length})
          </h2>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records found</p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="p-4 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                        {record.recordType}
                      </span>
                      <p className="font-medium text-foreground text-sm mt-2">{record.title}</p>
                      {record.description && <p className="text-xs text-muted-foreground mt-1">{record.description}</p>}

                      {record.prescriptions.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">Prescriptions:</p>
                          {record.prescriptions.map((p, i) => (
                            <p key={i} className="text-xs text-foreground flex items-center gap-1 mt-1">
                              <span className="w-1 h-1 rounded-full bg-primary" />
                              {p}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1 mt-2">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">
                          Blockchain Hash: {record.dataHash.substring(0, 24)}...
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {record.doctorName && <p className="text-xs font-medium text-foreground">{record.doctorName}</p>}
                      {record.hospitalName && <p className="text-xs text-muted-foreground">{record.hospitalName}</p>}
                      {record.visitDate && <p className="text-xs text-muted-foreground">{record.visitDate}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Request Full Access</h1>
        <p className="text-sm text-muted-foreground">Patient ID: <span className="font-mono">{patientId}</span></p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">Doctor ID: {doctorId}</p>
          </div>
        </div>

        <form onSubmit={handleRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Reason for Access *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={3}
              placeholder="Clinical reason for accessing full patient records..."
              required
            />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 cursor-pointer">
            <input
              type="checkbox"
              checked={isEmergencyOverride}
              onChange={(e) => setIsEmergencyOverride(e.target.checked)}
              className="rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-destructive">Emergency Override</p>
              <p className="text-xs text-muted-foreground">Access without patient approval — will be logged</p>
            </div>
          </label>

          <button
            type="submit"
            disabled={accessMutation.isPending}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {accessMutation.isPending ? "Verifying..." : "Request Full Access"}
          </button>
        </form>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        All access requests are logged to the immutable audit trail with timestamp and reason.
      </p>
    </div>
  );
}
