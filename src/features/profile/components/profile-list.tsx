import { Button } from "heroui-native";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { useTranslation } from "react-i18next";

import { useLocalData } from "@/data/local-data-provider";
import { selectProfileRecordCounts } from "@/data/selectors/document-selectors";
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

type ProfileCardProps = Omit<ProfileListProps, "profiles" | "onCreate"> & {
  profile: UserProfile;
};

function ProfileCard({
  activeProfileId,
  profile,
  onSelect,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const { t } = useTranslation();
  const { document } = useLocalData();
  const isActive = profile.id === activeProfileId;
  const counts = selectProfileRecordCounts(document, profile.id);
  const roleLabel =
    profile.role === "Personal"
      ? t("profile.manage.roles.personal")
      : profile.role === "Shared budget"
        ? t("profile.manage.roles.sharedBudget")
        : profile.role;

  return (
    <Pressable
      accessibilityLabel={t("profile.manage.select", { name: profile.name })}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={() => onSelect(profile.id)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      className={`gap-4 rounded-3xl border bg-surface p-4 ${
        isActive ? "border-accent" : "border-border"
      }`}
    >
      <View className="flex-row items-center gap-3">
        <ProfileAvatar
          color={profile.color}
          imageUri={profile.imageUri}
          initials={profile.initials}
          size="md"
        />
        <View className="flex-1">
          <Text
            numberOfLines={1}
            className="font-manrope-bold text-base text-foreground"
          >
            {profile.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 font-sans text-sm text-muted">
            {`${roleLabel} · ${profile.currencyCode.toUpperCase()}`}
          </Text>
        </View>
        {isActive ? (
          <View className="flex-row items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1">
            <FilledIcon name="check" size={14} tone="accent" />
            <Text className="font-manrope-semibold text-xs text-accent">
              {t("profile.manage.card.active")}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center justify-between border-t border-border pt-3">
        <View className="flex-1 flex-row items-center gap-4">
          <Text className="font-sans text-xs text-muted">
            {t("profile.manage.card.accounts", { count: counts.accounts })}
          </Text>
          <Text className="font-sans text-xs text-muted">
            {t("profile.manage.card.transactions", {
              count: counts.transactions,
            })}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Button
            accessibilityLabel={t("profile.manage.edit", { name: profile.name })}
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
      </View>
    </Pressable>
  );
}

export function ProfileList({
  profiles,
  activeProfileId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: ProfileListProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("profile.manage.profiles")}
          </Text>
          <Text className="mt-1 font-sans text-sm text-muted">
            {t("profile.manage.description")}
          </Text>
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
      </View>

      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          activeProfileId={activeProfileId}
          profile={profile}
          onDelete={onDelete}
          onEdit={onEdit}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
