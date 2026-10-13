"use client";

import { notFound } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Activities from "@/views/Activities";

export default function ActivitiesPage() {
  const { enableWipPages } = useAuth();
  if (!enableWipPages) {
    notFound();
  }

  return <Activities />;
}
