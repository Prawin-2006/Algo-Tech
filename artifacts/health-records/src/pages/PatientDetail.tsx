import { Link, useParams } from "wouter";
import { useGetPatient, useGetPatientQr, useGetPatientRecords } from "@workspace/api-client-react";
import { ArrowLeft, FileText, Upload, ShieldAlert, QrCode, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PatientDetail() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId ?? "";

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId },
  });
  const { data: qr } = useGetPatientQr(patientId, {
    query: { enabled: !!patientId },
  });
  const { data: records } = useGetPatientRecords(patientId, {
    query: { enabled: !!patientId },
  });

  if (patientLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!patient) {
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
          <h1 className="text-xl font-bold text-foreground">{patient.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{patient.id}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-4">Patient Information</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Blood Group", value: patient.bloodGroup },
                { label: "Age", value: `${patient.age} years` },
                { label: "Gender", value: patient.gender },
                { label: "Phone", value: patient.phone ?? "—" },
                { label: "Email", value: patient.email ?? "—" },
                { label: "Emergency Contact", value: patient.emergencyContact ?? "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {patient.allergies.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Known Allergies</p>
                <div className="flex flex-wrap gap-2">
                  {patient.allergies.map((a, i) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs border border-destructive/20">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {patient.diseases.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Medical Conditions</p>
                <div className="flex flex-wrap gap-2">
                  {patient.diseases.map((d, i) => (
                    <span key={i} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs border border-amber-200">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Medical Records ({records?.length ?? 0})
              </h2>
              <Link href={`/upload/${patient.id}`}>
                <a className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Record
                </a>
              </Link>
            </div>

            {!records || records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No medical records yet</p>
                <Link href={`/upload/${patient.id}`}>
                  <a className="text-primary text-xs hover:underline mt-1 inline-block">Upload first record</a>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((record) => (
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
                ))}
              </div>
            )}
          </div>
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

          <Link href={`/emergency/${patient.id}`}>
            <a className="flex items-center gap-2 w-full p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/20 transition-colors">
              <ShieldAlert className="w-4 h-4" />
              Emergency View
            </a>
          </Link>

          <Link href={`/full-access/${patient.id}`}>
            <a className="flex items-center gap-2 w-full p-3 bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors">
              <FileText className="w-4 h-4" />
              Doctor Full Access
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}
