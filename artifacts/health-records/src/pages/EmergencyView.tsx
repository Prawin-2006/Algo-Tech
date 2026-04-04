import { useParams, Link } from "wouter";
import { useGetEmergencyData } from "@workspace/api-client-react";
import { AlertTriangle, Phone, Droplets, ShieldAlert } from "lucide-react";

export default function EmergencyView() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId ?? "";

  const { data, isLoading, error } = useGetEmergencyData(patientId, {
    query: { enabled: !!patientId },
  });

  return (
    <div className="min-h-screen bg-red-950 text-white flex flex-col">
      <div className="bg-red-900 border-b border-red-800 p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center animate-pulse">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">EMERGENCY ACCESS</h1>
            <p className="text-xs text-red-300">HealthChain · Critical Patient Information</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {isLoading && (
            <div className="text-center py-16 text-red-300">
              <p>Loading critical data...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-16 text-red-300">
              <p>Patient not found</p>
              <Link href="/patients">
                <a className="text-red-200 text-sm hover:underline mt-2 inline-block">Go back</a>
              </Link>
            </div>
          )}

          {data && (
            <>
              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Patient</p>
                <h2 className="text-3xl font-bold text-white">{data.name}</h2>
                <p className="text-xs text-red-300 mt-1 font-mono">ID: {data.patientId}</p>
              </div>

              <div className="bg-red-900 border-2 border-red-500 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-5 h-5 text-red-300" />
                  <p className="text-xs text-red-300 uppercase tracking-wider">Blood Group</p>
                </div>
                <p className="text-4xl font-bold text-white">{data.bloodGroup}</p>
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <p className="text-xs text-red-300 uppercase tracking-wider">Known Allergies</p>
                </div>
                {data.allergies.length === 0 ? (
                  <p className="text-green-400 font-medium">No known allergies</p>
                ) : (
                  <div className="space-y-2">
                    {data.allergies.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-amber-900/50 border border-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="text-amber-200 font-medium">{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                <p className="text-xs text-red-300 uppercase tracking-wider mb-3">Medical Conditions</p>
                {data.diseases.length === 0 ? (
                  <p className="text-green-400 font-medium">No known conditions</p>
                ) : (
                  <div className="space-y-2">
                    {data.diseases.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-800/60 border border-red-600">
                        <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-red-100 font-medium">{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.emergencyContact && (
                <div className="bg-red-900 border border-red-700 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="w-5 h-5 text-green-400" />
                    <p className="text-xs text-red-300 uppercase tracking-wider">Emergency Contact</p>
                  </div>
                  <a href={`tel:${data.emergencyContact}`} className="text-2xl font-bold text-green-400 hover:text-green-300">
                    {data.emergencyContact}
                  </a>
                </div>
              )}

              <div className="bg-red-900/50 border border-red-800 rounded-xl p-4">
                <p className="text-xs text-red-400 text-center">
                  For full medical records, a doctor must authenticate via the HealthChain system.
                  This view is secured by blockchain verification.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
