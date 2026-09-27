import { Avatar } from "heroui-native";
import { useTranslation } from "react-i18next";

import { colorForeground } from "@/shared/icons/colors";
import { useAppThemeColors } from "@/shared/theme/app-theme";

type ProfileAvatarProps = {
  initials: string;
  color?: string;
  imageUri?: string;
  size?: "sm" | "md" | "lg";
  dimension?: number;
};

export function ProfileAvatar({
  initials,
  color,
  imageUri,
  size = "md",
  dimension,
}: ProfileAvatarProps) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const backgroundColor = imageUri
    ? theme.surfaceTertiary
    : (color ?? theme.accent);

  return (
    <Avatar
      accessibilityLabel={t("profile.avatarAccessibility", { initials })}
      color="accent"
      size={size}
      style={{
        backgroundColor,
        ...(dimension ? { width: dimension, height: dimension } : null),
      }}
    >
      {imageUri ? <Avatar.Image source={{ uri: imageUri }} /> : null}
      <Avatar.Fallback
        textProps={{
          allowFontScaling: false,
          style: {
            color: colorForeground(backgroundColor),
            fontFamily: "Huninn_400Regular",
          },
        }}
      >
        {initials}
      </Avatar.Fallback>
    </Avatar>
  );
}
