"use client";

import Profile from "@/views/Profile";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const { user, setUser, enableMcpServer } = useAuth();
  return (
    <Profile
      user={user}
      onProfileUpdated={setUser}
      enableMcpServer={enableMcpServer}
    />
  );
}
