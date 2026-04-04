import { useState } from "react";
import { useLocation } from "wouter";
import { useDoctorLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function DoctorLogin() {
  const [, navigate] = useLocation();
  const { login } = useAuthStore();
  const { toast } = useToast();
  const loginMutation = useDoctorLogin();

  const [doctorId, setDoctorId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    loginMutation.mutate(
      { data: { doctorId, password } },
      {
        onSuccess: (data) => {
          login(data.doctorId, data.name);
          toast({ title: `Welcome, ${data.name}` });
          navigate("/patients");
        },
        onError: () => {
          toast({ title: "Invalid credentials", description: "Check your Doctor ID and password", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="max-w-sm mx-auto mt-8 space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Doctor Authentication</h1>
        <p className="text-sm text-muted-foreground mt-1">Secure access to full patient records</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Doctor ID</label>
            <input
              type="text"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. doctor1"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loginMutation.isPending ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>

      <div className="bg-muted border border-border rounded-xl p-4">
        <p className="text-xs font-medium text-foreground mb-2">Demo Credentials</p>
        <div className="space-y-1">
          {[
            { id: "doctor1", name: "Dr. Priya Sharma" },
            { id: "doctor2", name: "Dr. Rajesh Kumar" },
            { id: "doctor3", name: "Dr. Anitha Nair" },
          ].map(({ id, name }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setDoctorId(id); setPassword("health123"); }}
              className="w-full text-left p-2 rounded-lg hover:bg-background transition-colors"
            >
              <p className="text-xs font-medium text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">ID: {id} · Password: health123</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
