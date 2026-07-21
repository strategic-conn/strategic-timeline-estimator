"use client";

import { useMemo } from "react";
import { useAuthStore, type UserRole } from "@/store/auth-store";

interface Permissions {
  role: UserRole;
  canCreateProject: boolean;
  canEditProject: boolean;
  canDeleteProject: boolean;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  canManageTeam: boolean;
  /** Log PTO / availability for people other than yourself (demo: admin + manager). */
  canEditOthersAvailability: boolean;
  canExportProposals: boolean;
  /** Edit another person's skill profile (self-edit is always allowed via RLS). */
  canEditMemberSkills: boolean;
  isViewer: boolean;
}

const PERMISSION_MAP: Record<UserRole, Omit<Permissions, "role" | "isViewer">> = {
  admin: {
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: true,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canManageTeam: true,
    canEditOthersAvailability: true,
    canExportProposals: true,
    canEditMemberSkills: true,
  },
  manager: {
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: false,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: true,
    canManageTeam: false,
    canEditOthersAvailability: true,
    canExportProposals: true,
    canEditMemberSkills: true,
  },
  member: {
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canCreateTask: true,
    canEditTask: true,
    canDeleteTask: false,
    canManageTeam: false,
    canEditOthersAvailability: false,
    canExportProposals: false,
    canEditMemberSkills: false,
  },
  viewer: {
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canCreateTask: false,
    canEditTask: false,
    canDeleteTask: false,
    canManageTeam: false,
    canEditOthersAvailability: false,
    canExportProposals: false,
    canEditMemberSkills: false,
  },
};

export function usePermissions(): Permissions {
  const role = useAuthStore((s) => s.user.role);
  return useMemo(
    () => ({
      role,
      ...PERMISSION_MAP[role],
      isViewer: role === "viewer",
    }),
    [role]
  );
}
