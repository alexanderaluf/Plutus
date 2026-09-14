import { Button, Card } from "heroui-native";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { useTranslation } from "react-i18next";

import { FilledIcon } from "@/shared/ui/filled-icon";

import type { UserProfile } from "../types";
import { ProfileAvatar } from "./profile-avatar";

type ProfileListProps = {
  profiles: UserProfile[];
  activeProfileId: string;
  onSelect: (profileId: string) => void;
  onEdit: (profile: UserProfile) => void;
  onDelete: (profile: UserProfile) => void;
  onCreate: () => void;
};

export function ProfileList({
  profiles,
  activeProfileId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: ProfileListProps) {
  const { t } = useTranslation();

  function getRoleLabel(role: string) {
    if (role === "Personal") return t("profile.manage.roles.personal");
    if (role === "Shared budget") {
      return t("profile.manage.roles.sharedBudget");
    }
    return role;
  }

  return (
    <Card className="border border-border bg-surface p-0">
      <Card.Header className="flex-row items-center justify-between px-5 pb-2 pt-5">
        <View>
          <Card.Title className="font-manrope-bold text-lg text-foreground">
            {t("profile.manage.profiles")}
          </Card.Title>
          <Card.Description className="mt-1 font-sans text-muted">
            {t("profile.manage.description")}
          </Card.Description>
        </View>
        <Button
          accessibilityLabel={t("profile.manage.create")}
          isIconOnly
          size="sm"
          variant="primary"
          onPress={onCreate}
        >
          <FilledIcon name="plus" size={20} tone="accent-foreground" />
        </Button>
      </Card.Header>

      <Card.Body className="px-5 pb-3">
        {profiles.map((profile, index) => {
          const isActive = profile.id === activeProfileId;

          return (
            <View
              key={profile.id}
              className={`flex-row items-center py-3 ${
                index < profiles.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Pressable
                accessibilityLabel={t("profile.manage.select", {
                  name: profile.name,
                })}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className="flex-1 flex-row items-center"
                onPress={() => onSelect(profile.id)}
              >
                <ProfileAvatar
                  color={profile.color}
                  imageUri={profile.imageUri}
                  initials={profile.initials}
                  size="md"
                />
                <View className="ms-3 flex-1">
                  <Text className="font-manrope-bold text-sm text-foreground">
                    {profile.name}
                  </Text>
                  <Text className="mt-0.5 font-sans text-xs text-muted">
                    {getRoleLabel(profile.role)}
                  </Text>
                </View>

                {isActive ? (
                  <View className="me-1 size-7 items-center justify-center rounded-full bg-accent/15">
                    <FilledIcon name="check" size={18} tone="accent" />
                  </View>
                ) : null}
              </Pressable>
              <Button
                accessibilityLabel={t("profile.manage.edit", {
                  name: profile.name,
                })}
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => onEdit(profile)}
              >
                <FilledIcon name="pencil" size={18} tone="muted" />
              </Button>
              <Button
                accessibilityLabel={t("profile.manage.delete.accessibility", {
                  name: profile.name,
                })}
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => onDelete(profile)}
              >
                <FilledIcon name="delete" size={18} tone="danger" />
              </Button>
            </View>
          );
        })}
      </Card.Body>
    </Card>
  );
}
