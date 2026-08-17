import { useNavigate, useParams, Navigate } from "react-router-dom";
import { Building2, GitBranch, Users, Stethoscope, Shield, MessageSquare } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ClinicProfileTab } from "@/features/clinic/settings/ClinicProfileTab";
import { BranchesTab } from "@/features/clinic/settings/BranchesTab";
import { StaffTab } from "@/features/clinic/settings/StaffTab";
import { TreatmentTypesTab } from "@/features/clinic/settings/TreatmentTypesTab";
import { SubscriptionTab } from "@/features/clinic/settings/SubscriptionTab";
import { WhatsAppTab } from "@/features/clinic/settings/WhatsAppTab";

export function SettingsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  // Guardrail: Owner Only access
  if (profile?.role !== "owner") {
    return <Navigate to="/app" replace />;
  }

  const activeTab = tab && ["profile", "branches", "staff", "treatments", "subscription", "whatsapp"].includes(tab) ? tab : "profile";

  function handleTabChange(value: string) {
    navigate(`/app/settings/${value}`);
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-medium text-foreground">Clinic Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage clinic details, physical branches, staff accounts, treatment types, subscription, and WhatsApp configuration
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 max-w-4xl">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Clinic Profile</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Branches</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Staff</span>
          </TabsTrigger>
          <TabsTrigger value="treatments" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Treatment Types</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Subscription</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {activeTab === "profile" && <ClinicProfileTab />}
          {activeTab === "branches" && <BranchesTab />}
          {activeTab === "staff" && <StaffTab />}
          {activeTab === "treatments" && <TreatmentTypesTab />}
          {activeTab === "subscription" && <SubscriptionTab />}
          {activeTab === "whatsapp" && <WhatsAppTab />}
        </div>
      </Tabs>
    </div>
  );
}
