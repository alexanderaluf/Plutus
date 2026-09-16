import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProfileList } from "./components/profile-list";
import { ProfileDeleteSheet } from "./components/profile-delete-sheet";
import { ProfileScreenHeader } from "./components/profile-screen-header";
import { useProfiles } from "./profile-provider";
import type { UserProfile } from "./types";

export function ManageProfilesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profiles, activeProfileId, selectProfile } = useProfiles();
  const [profileToDelete, setProfileToDelete] = useState<UserProfile | null>(
    null,
  );

  function openEditor(profile?: UserProfile) {
    router.push({
      pathname: "/profile/user",
      params: profile
        ? { mode: "edit", profileId: profile.id }
        : { mode: "create" },
    });
  }

  return (
    <EdgeToEdgeLayout
      header={<ProfileScreenHeader title={t("profile.manage.title")} />}
    >
      <EdgeToEdgeScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <ProfileList
          activeProfileId={activeProfileId}
          profiles={profiles}
          onCreate={() => openEditor()}
          onDelete={setProfileToDelete}
          onEdit={openEditor}
          onSelect={selectProfile}
        />
      </EdgeToEdgeScrollView>
      <ProfileDeleteSheet
        profile={profileToDelete}
        isOpen={profileToDelete !== null}
        onDismiss={() => setProfileToDelete(null)}
      />
    </EdgeToEdgeLayout>
  );
}
