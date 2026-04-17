import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Lock, Send, FileText } from "lucide-react";

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

function decodeBase64Preview(contentBase64: string, limit = 1500): string | null {
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

type RecordViewResponse = {
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    bloodGroup: string;
  };
  records: Array<{
    id: string;
    recordType: string;
    title: string;
    description: string | null;
    createdAt: string;
    labResults?: {
      documentName?: string;
      mimeType?: string;
      sizeBytes?: number;
      contentBase64?: string;
      extractedText?: string;
      extractedHtml?: string;
    } | null;
  }>;
};

export default function ViewRecord() {
  const { role, doctorId, name } = useAuthStore();
  const { toast } = useToast();
  const [patientId, setPatientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RecordViewResponse | null>(null);
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

  if (role !== "doctor" || !doctorId || !name) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="text-sm text-muted-foreground">Doctor login required to view records.</p>
      </div>
    );
  }

  const requestAccess = async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/records/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patientId.trim(), doctorId, doctorName: name }),
      });
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as { error?: string }) : null;
      if (!res.ok) {
        throw new Error(
          json?.error ||
            `Request failed with status ${res.status}${res.statusText ? ` (${res.statusText})` : ""}.`,
        );
      }
      toast({ title: "Access request sent", description: "Patient can approve it in Requests page." });
    } catch (error) {
      toast({
        title: "Request failed",
        description:
          error instanceof SyntaxError
            ? "API returned an invalid response. Please make sure backend server is running."
            : error instanceof Error
              ? error.message
              : "Could not send request.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const viewRecords = async () => {
    if (!patientId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/records/doctor-view/${encodeURIComponent(patientId.trim())}?doctorId=${encodeURIComponent(doctorId)}`);
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as RecordViewResponse & { error?: string }) : null;
      if (!res.ok) {
        throw new Error(
          json?.error ||
            `View failed with status ${res.status}${res.statusText ? ` (${res.statusText})` : ""}.`,
        );
      }
      if (!json) throw new Error("Empty response from server.");
      setData(json);
      setOpenRecordId(null);
      setPopupRecord(null);
    } catch (error) {
      setData(null);
      toast({
        title: "Cannot view records",
        description:
          error instanceof SyntaxError
            ? "API returned an invalid response. Please make sure backend server is running."
            : error instanceof Error
              ? error.message
              : "Patient approval required.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">View Record</h1>
        <p className="text-sm text-muted-foreground">Request patient approval and view records once approved.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Patient Health ID</label>
          <input
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="HC-XXXXXXXX"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={requestAccess}
            disabled={loading || !patientId.trim()}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium border border-primary/20"
          >
            <span className="inline-flex items-center gap-2"><Send className="w-4 h-4" />Request Access</span>
          </button>
          <button
            onClick={viewRecords}
            disabled={loading || !patientId.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <span className="inline-flex items-center gap-2"><Lock className="w-4 h-4" />View Record</span>
          </button>
        </div>
      </div>

      {data && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-foreground">{data.patient.name}</h2>
            <p className="text-xs text-muted-foreground">{data.patient.id} - {data.patient.bloodGroup} - {data.patient.age}y</p>
          </div>
          <div className="space-y-3">
            {data.records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records available.</p>
            ) : (
              data.records.map((record) => {
                const documentName = typeof record.labResults?.documentName === "string" ? record.labResults.documentName : null;
                const mimeType = typeof record.labResults?.mimeType === "string" ? record.labResults.mimeType : null;
                const sizeBytes = typeof record.labResults?.sizeBytes === "number" ? record.labResults.sizeBytes : null;
                const contentBase64 = typeof record.labResults?.contentBase64 === "string" ? record.labResults.contentBase64 : null;
                const extractedHtml = typeof record.labResults?.extractedHtml === "string" ? record.labResults.extractedHtml : null;
                const extractedText = typeof record.labResults?.extractedText === "string" ? record.labResults.extractedText.trim() : null;
                const textPreview = extractedText || (mimeType?.startsWith("text/") && contentBase64 ? decodeBase64Preview(contentBase64) : null);
                const isOpen = openRecordId === record.id;

                return (
                  <div key={record.id} className="border border-border rounded-lg p-3">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      {record.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{record.recordType}</p>
                    {record.description && <p className="text-xs text-foreground mt-2">{record.description}</p>}

                    {(documentName || contentBase64) && (
                      <button
                        type="button"
                        onClick={() => setOpenRecordId(isOpen ? null : record.id)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                      >
                        {isOpen ? "Hide Record" : "View Record"}
                      </button>
                    )}

                    {isOpen && (documentName || contentBase64) && (
                      <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
                        <p className="text-xs font-semibold text-foreground mb-2">Uploaded Record</p>
                        <div className="space-y-1 text-xs text-foreground">
                          {documentName && <p><span className="text-muted-foreground">Name:</span> {documentName}</p>}
                          {mimeType && <p><span className="text-muted-foreground">Type:</span> {mimeType}</p>}
                          {sizeBytes !== null && <p><span className="text-muted-foreground">Size:</span> {formatBytes(sizeBytes)}</p>}
                        </div>
                        {contentBase64 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAiSummary(null);
                              setAiSummaryError(null);
                              setPopupRecord({
                                recordId: record.id,
                                patientId: data.patient.id,
                                title: documentName ?? record.title,
                                mimeType: mimeType ?? "application/octet-stream",
                                contentBase64,
                                extractedHtml,
                                extractedText: textPreview,
                              });
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                          >
                            Open Popup View
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

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
                <iframe title="PDF Record Preview" src={popupUrl} className="w-full h-full min-h-[60vh] rounded border border-border bg-white" />
              ) : popupRecord.extractedHtml ? (
                <iframe title="Record HTML Preview" srcDoc={popupRecord.extractedHtml} className="w-full h-full min-h-[60vh] rounded border border-border bg-white" />
              ) : popupRecord.extractedText ? (
                <pre className="text-xs whitespace-pre-wrap break-words rounded border border-border bg-card p-3">
                  {popupRecord.extractedText}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No readable text could be extracted from this record.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
