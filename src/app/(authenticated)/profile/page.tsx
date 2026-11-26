"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Profile from "@/views/Profile";
import { useAuth } from "@/context/AuthContext";

function ProfilePageContent() {
  const { user, setUser, enableMcpServer } = useAuth();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");

  return (
    <Profile
      user={user}
      onProfileUpdated={setUser}
      enableMcpServer={enableMcpServer}
      requestedTab={requestedTab}
    />
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
