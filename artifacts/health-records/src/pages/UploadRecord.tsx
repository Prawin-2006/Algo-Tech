import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useUploadMedicalRecord, useGetPatient, getGetPatientRecordsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Plus, X } from "lucide-react";

export default function UploadRecord() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId ?? "";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const uploadMutation = useUploadMedicalRecord();

  const { data: patient } = useGetPatient(patientId, { query: { enabled: !!patientId } });

  const [form, setForm] = useState({
    recordType: "General",
    title: "",
    description: "",
    doctorName: "",
    hospitalName: "",
    visitDate: "",
  });
  const [prescriptions, setPrescriptions] = useState<string[]>([]);
  const [prescriptionInput, setPrescriptionInput] = useState("");

  const recordTypes = ["General", "Lab Report", "Prescription", "Radiology", "Surgery", "Cardiology", "Ophthalmology", "Vaccination", "Other"];

  const addPrescription = () => {
    if (prescriptionInput.trim()) {
      setPrescriptions([...prescriptions, prescriptionInput.trim()]);
      setPrescriptionInput("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    uploadMutation.mutate(
      {
        patientId,
        data: {
          recordType: form.recordType,
          title: form.title,
          description: form.description || undefined,
          prescriptions,
          doctorName: form.doctorName || undefined,
          hospitalName: form.hospitalName || undefined,
          visitDate: form.visitDate || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPatientRecordsQueryKey(patientId) });
          toast({ title: "Record uploaded", description: "Encrypted and hashed to blockchain" });
          navigate(`/patients/${patientId}`);
        },
        onError: () => {
          toast({ title: "Upload failed", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/patients/${patientId}`}>
          <a className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </a>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Upload Medical Record</h1>
          {patient && (
            <p className="text-sm text-muted-foreground">For {patient.name} · <span className="font-mono">{patient.id}</span></p>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white text-xs font-bold">!</span>
        </div>
        <div>
          <p className="text-sm font-medium text-amber-800">Blockchain Secured</p>
          <p className="text-xs text-amber-700">Data will be AES-encrypted and SHA-256 hashed for tamper-proof storage. The hash simulates blockchain verification.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-foreground text-sm">Record Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Record Type *</label>
              <select
                value={form.recordType}
                onChange={(e) => setForm({ ...form, recordType: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {recordTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Record title"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={3}
              placeholder="Additional notes or findings..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Doctor Name</label>
              <input
                type="text"
                value={form.doctorName}
                onChange={(e) => setForm({ ...form, doctorName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Dr. Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hospital</label>
              <input
                type="text"
                value={form.hospitalName}
                onChange={(e) => setForm({ ...form, hospitalName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Hospital name"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Visit Date</label>
            <input
              type="date"
              value={form.visitDate}
              onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-medium text-foreground text-sm">Prescriptions</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={prescriptionInput}
              onChange={(e) => setPrescriptionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPrescription())}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Metformin 500mg twice daily"
            />
            <button type="button" onClick={addPrescription} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {prescriptions.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted border border-border">
                <span className="text-sm text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {p}
                </span>
                <button type="button" onClick={() => setPrescriptions(prescriptions.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={uploadMutation.isPending}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {uploadMutation.isPending ? "Encrypting & Uploading..." : "Upload Medical Record"}
        </button>
      </form>
    </div>
  );
}
