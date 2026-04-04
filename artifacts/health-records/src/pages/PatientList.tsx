import { Link } from "wouter";
import { useListPatients } from "@workspace/api-client-react";
import { Users, Search, QrCode, Eye, Upload } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const bloodGroupColors: Record<string, string> = {
  "O+": "bg-red-50 text-red-700 border-red-200",
  "O-": "bg-red-100 text-red-800 border-red-300",
  "A+": "bg-blue-50 text-blue-700 border-blue-200",
  "A-": "bg-blue-100 text-blue-800 border-blue-300",
  "B+": "bg-green-50 text-green-700 border-green-200",
  "B-": "bg-green-100 text-green-800 border-green-300",
  "AB+": "bg-purple-50 text-purple-700 border-purple-200",
  "AB-": "bg-purple-100 text-purple-800 border-purple-300",
};

export default function PatientList() {
  const { data: patients, isLoading } = useListPatients();
  const [search, setSearch] = useState("");

  const filtered = patients?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    p.bloodGroup.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {patients?.length ?? 0} registered patients
          </p>
        </div>
        <Link href="/register">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
            <Users className="w-4 h-4" />
            New Patient
          </span>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Search by name, ID, or blood group..."
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No patients found</p>
          <p className="text-sm mt-1">
            {search ? "Try a different search term" : "Register a patient to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                {p.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{p.name}</p>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full border font-medium",
                    bloodGroupColors[p.bloodGroup] ?? "bg-muted text-muted-foreground border-border"
                  )}>
                    {p.bloodGroup}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.gender} · {p.age} years · ID: <span className="font-mono">{p.id}</span>
                </p>
                {p.allergies.length > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    Allergies: {p.allergies.join(", ")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/emergency/${p.id}`}>
                  <a className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Emergency view">
                    <QrCode className="w-4 h-4" />
                  </a>
                </Link>
                <Link href={`/upload/${p.id}`}>
                  <a className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Upload record">
                    <Upload className="w-4 h-4" />
                  </a>
                </Link>
                <Link href={`/patients/${p.id}`}>
                  <a className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </a>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
