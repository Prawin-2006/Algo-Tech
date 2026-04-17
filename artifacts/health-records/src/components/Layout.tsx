import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/store/useAuth";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ClipboardList,
  UserPlus,
  FolderSearch,
  LogIn,
  LogOut,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const doctorNavLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/view-record", label: "View Record", icon: FolderSearch },
  { href: "/chatbot", label: "Chatbot", icon: MessageSquare },
  { href: "/audit", label: "Audit Logs", icon: ClipboardList },
];
const patientNavLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/register", label: "Register Patient", icon: UserPlus },
  { href: "/chatbot", label: "Chatbot", icon: MessageSquare },
  { href: "/audit", label: "Audit Logs", icon: ClipboardList },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { doctorId, patientId, role, name, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isEmergencyPage = location.startsWith("/emergency/");
  const isAuthPage = location === "/auth";
  const navLinks = role === "doctor" ? doctorNavLinks : patientNavLinks;

  if (isEmergencyPage || isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 p-6 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-sm leading-tight">HealthChain</h1>
            <p className="text-xs text-muted-foreground">Secure Health Records</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <span
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  location === href
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          {role ? (
            <div className="space-y-2">
              <div className="px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
                <p className="text-xs text-muted-foreground">Logged in as</p>
                <p className="text-sm font-medium text-primary truncate">{name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {role === "doctor" ? `Doctor ID: ${doctorId}` : `Patient ID: ${patientId}`}
                </p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <Link href="/auth">
              <span
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full cursor-pointer",
                  location === "/auth"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <LogIn className="w-4 h-4" />
                Sign In / Sign Up
              </span>
            </Link>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 md:ml-64">
        <header className="sticky top-0 z-30 h-14 bg-card/90 backdrop-blur border-b border-border flex items-center px-4 md:px-6 gap-4">
          <button
            className="md:hidden p-1 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          {role && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full">
                <ShieldCheck className="w-3 h-3" />
                {name}
              </span>
            </div>
          )}
        </header>

        <main className="p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
