import { useListAuditLogs } from "@workspace/api-client-react";
import { ClipboardList, ShieldAlert, Shield, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function AuditLogs() {
  const { data: logs, isLoading } = useListAuditLogs();
  const [search, setSearch] = useState("");

  const filtered = logs?.filter((l) =>
    l.patientName.toLowerCase().includes(search.toLowerCase()) ||
    l.doctorName.toLowerCase().includes(search.toLowerCase()) ||
    l.reason.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const sorted = [...filtered].reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            {logs?.length ?? 0} access events recorded
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Search by patient, doctor, or reason..."
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No access events recorded</p>
          <p className="text-sm mt-1">Access events appear here when doctors view patient records</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((log) => (
            <div
              key={log.id}
              className={cn(
                "bg-card border rounded-xl p-4 flex items-start gap-4",
                log.isEmergencyOverride ? "border-destructive/30" : "border-border"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                log.isEmergencyOverride ? "bg-destructive/10" : "bg-primary/10"
              )}>
                {log.isEmergencyOverride ? (
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                ) : (
                  <Shield className="w-4 h-4 text-primary" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{log.doctorName}</span>
                  <span className="text-xs text-muted-foreground">accessed</span>
                  <span className="text-sm font-medium text-foreground">{log.patientName}</span>
                  {log.isEmergencyOverride && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                      Emergency Override
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Reason: <span className="text-foreground">{log.reason}</span>
                </p>
                <div className="flex items-center gap-4 mt-1.5">
                  <p className="text-xs text-muted-foreground">
                    Doctor ID: <span className="font-mono">{log.doctorId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Patient: <span className="font-mono">{log.patientId}</span>
                  </p>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">
                  {new Date(log.accessedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.accessedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
