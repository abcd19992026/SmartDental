import { useNavigate, useParams, Navigate } from "react-router-dom";
import { Building2, GitBranch, Users, Stethoscope, Pill, FileText, Shield, MessageSquare } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ClinicProfileTab } from "@/features/clinic/settings/ClinicProfileTab";
import { BranchesTab } from "@/features/clinic/settings/BranchesTab";
import { StaffTab } from "@/features/clinic/settings/StaffTab";
import { TreatmentTypesTab } from "@/features/clinic/settings/TreatmentTypesTab";
import { MedicinesTab } from "@/features/clinic/settings/MedicinesTab";
import { LetterheadTab } from "@/features/clinic/settings/LetterheadTab";
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

  const activeTab =
    tab && ["profile", "branches", "staff", "treatments", "medicines", "letterhead", "subscription", "whatsapp"].includes(tab)
      ? tab
      : "profile";

  function handleTabChange(value: string) {
    navigate(`/app/settings/${value}`);
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-medium text-foreground">Clinic Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage clinic details, physical branches, staff accounts, treatment types, medicines, letterhead branding, subscription, and WhatsApp configuration
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:grid-cols-8 h-auto p-1.5 gap-1.5 max-w-5xl">
          <TabsTrigger value="profile" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">Clinic Profile</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <GitBranch className="h-4 w-4 shrink-0" />
            <span className="truncate">Branches</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">Staff</span>
          </TabsTrigger>
          <TabsTrigger value="treatments" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <Stethoscope className="h-4 w-4 shrink-0" />
            <span className="truncate">Treatment Types</span>
          </TabsTrigger>
          <TabsTrigger value="medicines" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <Pill className="h-4 w-4 shrink-0" />
            <span className="truncate">Medicines</span>
          </TabsTrigger>
          <TabsTrigger value="letterhead" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">Letterhead</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="truncate">Subscription</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center justify-center sm:justify-start gap-2 py-2 px-2.5 min-h-[38px] text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate">WhatsApp</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {activeTab === "profile" && <ClinicProfileTab />}
          {activeTab === "branches" && <BranchesTab />}
          {activeTab === "staff" && <StaffTab />}
          {activeTab === "treatments" && <TreatmentTypesTab />}
          {activeTab === "medicines" && <MedicinesTab />}
          {activeTab === "letterhead" && <LetterheadTab />}
          {activeTab === "subscription" && <SubscriptionTab />}
          {activeTab === "whatsapp" && <WhatsAppTab />}
        </div>
      </Tabs>
    </div>
  );
}
