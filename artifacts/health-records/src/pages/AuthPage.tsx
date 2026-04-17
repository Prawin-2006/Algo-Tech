import { useState } from "react";
import { useLocation } from "wouter";
import { useDoctorLogin, useRegisterPatient } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  HeartPulse,
  CheckCircle2,
  Copy,
} from "lucide-react";

type Tab = "signin" | "signup";

type BloodGroup = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-";

const bloodGroups: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { login } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [newHealthId, setNewHealthId] = useState<string | null>(null);

  const loginMutation = useDoctorLogin();
  const registerMutation = useRegisterPatient();

  const [signIn, setSignIn] = useState({ doctorId: "", password: "" });
  const [signUp, setSignUp] = useState({
    name: "",
    age: "",
    gender: "Male",
    bloodGroup: "O+" as BloodGroup,
    phone: "",
    email: "",
    allergies: "",
    diseases: "",
    emergencyContact: "",
  });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { doctorId: signIn.doctorId, password: signIn.password } },
      {
        onSuccess: (data) => {
          login(data.doctorId, data.name);
          toast({ title: `Welcome back, ${data.name}!`, description: "You now have full access." });
          navigate("/");
        },
        onError: () => {
          toast({
            title: "Invalid credentials",
            description: "Check your Doctor ID and password.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      {
        data: {
          name: signUp.name,
          age: parseInt(signUp.age),
          gender: signUp.gender,
          bloodGroup: signUp.bloodGroup,
          phone: signUp.phone || undefined,
          email: signUp.email || undefined,
          allergies: signUp.allergies ? signUp.allergies.split(",").map((s) => s.trim()).filter(Boolean) : [],
          diseases: signUp.diseases ? signUp.diseases.split(",").map((s) => s.trim()).filter(Boolean) : [],
          emergencyContact: signUp.emergencyContact || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setNewHealthId(data.id);
        },
        onError: () => {
          toast({
            title: "Registration failed",
            description: "Please check your details and try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const copyHealthId = () => {
    if (newHealthId) {
      navigator.clipboard.writeText(newHealthId);
      toast({ title: "Health ID copied!" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <HeartPulse className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">HealthChain</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure Medical Records System</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-border">
            <button
              onClick={() => { setTab("signin"); setNewHealthId(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                tab === "signin"
                  ? "bg-primary/5 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
            <button
              onClick={() => { setTab("signup"); setNewHealthId(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                tab === "signup"
                  ? "bg-primary/5 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Sign Up
            </button>
          </div>

          <div className="p-6">
            {tab === "signin" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Welcome back</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Sign in with your doctor credentials</p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Doctor ID</label>
                    <input
                      type="text"
                      value={signIn.doctorId}
                      onChange={(e) => setSignIn((s) => ({ ...s, doctorId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      placeholder="e.g. doctor1"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={signIn.password}
                        onChange={(e) => setSignIn((s) => ({ ...s, password: e.target.value }))}
                        className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Enter password"
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
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </button>
                </form>

                <div className="pt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Demo accounts</p>
                  <div className="grid gap-1.5">
                    {[
                      { id: "doctor1", name: "Dr. Priya Sharma" },
                      { id: "doctor2", name: "Dr. Rajesh Kumar" },
                      { id: "doctor3", name: "Dr. Anitha Nair" },
                    ].map(({ id, name }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSignIn({ doctorId: id, password: "health123" })}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">{id} · health123</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "signup" && !newHealthId && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Create patient account</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Register to get your secure Health ID</p>
                </div>

                <form onSubmit={handleSignUp} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name *</label>
                      <input
                        type="text"
                        value={signUp.name}
                        onChange={(e) => setSignUp((s) => ({ ...s, name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Your full name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Age *</label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={signUp.age}
                        onChange={(e) => setSignUp((s) => ({ ...s, age: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Age"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Gender *</label>
                      <select
                        value={signUp.gender}
                        onChange={(e) => setSignUp((s) => ({ ...s, gender: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Blood Group *</label>
                      <select
                        value={signUp.bloodGroup}
                        onChange={(e) => setSignUp((s) => ({ ...s, bloodGroup: e.target.value as BloodGroup }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {bloodGroups.map((bg) => (
                          <option key={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={signUp.phone}
                        onChange={(e) => setSignUp((s) => ({ ...s, phone: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="+91 xxxxxxxxxx"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                      <input
                        type="email"
                        value={signUp.email}
                        onChange={(e) => setSignUp((s) => ({ ...s, email: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="your@email.com"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        Known Allergies
                        <span className="font-normal ml-1">(comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        value={signUp.allergies}
                        onChange={(e) => setSignUp((s) => ({ ...s, allergies: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="e.g. Penicillin, Dust mites"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Emergency Contact</label>
                      <input
                        type="text"
                        value={signUp.emergencyContact}
                        onChange={(e) => setSignUp((s) => ({ ...s, emergencyContact: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="+91 xxxxxxxxxx"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={registerMutation.isPending}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 mt-1"
                  >
                    {registerMutation.isPending ? "Creating account..." : "Create Account"}
                  </button>
                </form>
              </div>
            )}

            {tab === "signup" && newHealthId && (
              <div className="space-y-5 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Account created!</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your secure Health ID has been generated. Save it — you'll need it for emergency access.
                  </p>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1.5">Your Health ID</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl font-bold text-primary tracking-widest font-mono">{newHealthId}</span>
                    <button
                      onClick={copyHealthId}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <button
                    onClick={() => navigate(`/patients/${newHealthId}`)}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
                  >
                    View My Profile
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    className="w-full py-2.5 px-4 border border-border rounded-lg font-medium text-sm hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Go to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          All data is AES-256 encrypted · SHA-256 blockchain verified
        </p>
      </div>
    </div>
  );
}
