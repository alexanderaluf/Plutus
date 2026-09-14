import { createContext, type PropsWithChildren, useContext } from "react";

import {
  deleteAttachment,
    getAttachmentFile,
    persistAttachment,
} from "@/data/attachments/attachment-store";
import { useLocalData } from "@/data/local-data-provider";
import type { JsonObject } from "@/data/model/json";
import { deleteProfileData } from "@/data/model/profile-record";

import { profileFromRecord } from "./lib/profile-record-codec";
import { getProfileColor, getProfileInitials } from "./lib/profile-utils";
import type { ProfileValues, UserProfile } from "./types";

type ProfileContextValue = {
  profiles: UserProfile[];
  activeProfile: UserProfile;
  activeProfileId: string;
  selectProfile: (profileId: string) => Promise<void>;
  createProfile: (values: ProfileValues) => Promise<void>;
  updateProfile: (profileId: string, values: ProfileValues) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const { document, replaceDocument, updateDocument } = useLocalData();
  const profiles = document.users.map(profileFromRecord);
  const selectedRecord = document.users.find(
    (record) => record.isSelected === true,
  );
  const activeProfileId =
    document._local.selectedProfileId ??
    (typeof selectedRecord?.uuid === "string"
      ? selectedRecord.uuid
      : profiles[0].id);
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  async function persistImage(imageUri?: string) {
    if (!imageUri) return { image: null, attachment: null };

    const existing = document._local.attachments.find((item) => {
      try {
        return getAttachmentFile(item.relativePath).uri === imageUri;
      } catch {
        return false;
      }
    });

    if (existing) return { image: existing.relativePath, attachment: existing };
    const attachment = await persistAttachment(imageUri, "image/jpeg");
    return { image: attachment.relativePath, attachment };
  }

  async function selectProfile(profileId: string) {
    await updateDocument((current) => ({
      ...current,
      users: current.users.map((record) => ({
        ...record,
        isSelected: record.uuid === profileId,
      })),
      _local: { ...current._local, selectedProfileId: profileId },
    }));
  }

  async function createProfile(values: ProfileValues) {
    const id = `profile-${Date.now()}`;
    const now = new Date().toISOString();
    const { image, attachment } = await persistImage(values.imageUri);
    const record: JsonObject = {
      id: document.users.length + 1,
      uuid: id,
      name: values.name,
      email: values.email,
      role: values.role,
      currency: values.currencyCode,
      currencyName: values.currencyName,
      currencySymbol: values.currencySymbol,
      initials: getProfileInitials(values.name),
      color: getProfileColor(profiles.length),
      image,
      isSelected: true,
      createdAt: now,
      updatedAt: now,
    };

    await updateDocument((current) => ({
      ...current,
      users: [
        ...current.users.map((user) => ({ ...user, isSelected: false })),
        record,
      ],
      _local: {
        ...current._local,
        selectedProfileId: id,
        attachments: attachment
          ? [...current._local.attachments, attachment]
          : current._local.attachments,
      },
    }));
  }

  async function updateProfile(profileId: string, values: ProfileValues) {
    const { image, attachment } = await persistImage(values.imageUri);
    await updateDocument((current) => ({
      ...current,
      users: current.users.map((record) =>
        record.uuid === profileId
          ? {
              ...record,
              name: values.name,
              email: values.email,
              role: values.role,
              currency: values.currencyCode,
              currencyName: values.currencyName,
              currencySymbol: values.currencySymbol,
              initials: getProfileInitials(values.name),
              image,
              updatedAt: new Date().toISOString(),
            }
          : record,
      ),
      _local: {
        ...current._local,
        attachments:
          attachment &&
          !current._local.attachments.some((item) => item.id === attachment.id)
            ? [...current._local.attachments, attachment]
            : current._local.attachments,
      },
    }));
  }

  async function deleteProfile(profileId: string) {
    let attachmentPaths: string[] = [];
    if (document.users.length === 1) {
      const result = deleteProfileData(document, profileId);
      attachmentPaths = result.attachmentPaths;
      await replaceDocument(result.document);
    } else {
      await updateDocument((current) => {
        const result = deleteProfileData(current, profileId);
        attachmentPaths = result.attachmentPaths;
        return result.document;
      });
    }
    for (const path of attachmentPaths) {
      try {
        deleteAttachment(path);
      } catch {
        // The canonical manifest is already committed without this orphan.
      }
    }
  }

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        activeProfileId,
        selectProfile,
        createProfile,
        updateProfile,
        deleteProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfiles must be used within ProfileProvider");
  }

  return context;
}
