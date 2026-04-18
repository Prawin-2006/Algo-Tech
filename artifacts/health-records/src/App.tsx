import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import RegisterPatient from "@/pages/RegisterPatient";
import PatientList from "@/pages/PatientList";
import PatientDetail from "@/pages/PatientDetail";
import UploadRecord from "@/pages/UploadRecord";
import EmergencyView from "@/pages/EmergencyView";
import DoctorLogin from "@/pages/DoctorLogin";
import FullAccess from "@/pages/FullAccess";
import Chatbot from "@/pages/Chatbot";
import AuditLogs from "@/pages/AuditLogs";
import AuthPage from "@/pages/AuthPage";
import ViewRecord from "@/pages/ViewRecord";
import PatientRequests from "@/pages/PatientRequests";
import Layout from "@/components/Layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/register" component={RegisterPatient} />
      <Route path="/patients" component={PatientList} />
      <Route path="/patients/:patientId" component={PatientDetail} />
      <Route path="/upload/:patientId" component={UploadRecord} />
      <Route path="/emergency/:patientId" component={EmergencyView} />
      <Route path="/doctor-login" component={DoctorLogin} />
      <Route path="/full-access/:patientId" component={FullAccess} />
      <Route path="/chatbot" component={Chatbot} />
      <Route path="/audit" component={AuditLogs} />
      <Route path="/view-record" component={ViewRecord} />
      <Route path="/patient-requests" component={PatientRequests} />
      <Route path="/guardian-requests" component={PatientRequests} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
