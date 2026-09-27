import { AppAlert } from "@/shared/ui/app-alert";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { ProfileAvatar } from "./profile-avatar";

type ProfilePhotoPickerProps = {
  color: string;
  imageUri?: string;
  initials: string;
  onChange: (imageUri: string) => void;
};

export function ProfilePhotoPicker({
  color,
  imageUri,
  initials,
  onChange,
}: ProfilePhotoPickerProps) {
  const { t } = useTranslation();

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      AppAlert.alert(
        t("profile.photo.permissionTitle"),
        t("profile.photo.permissionMessage"),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled) {
      onChange(result.assets[0].uri);
    }
  }

  return (
    <View className="items-center">
      <Pressable
        accessibilityLabel={t("profile.photo.accessibilityLabel")}
        accessibilityRole="button"
        onPress={pickPhoto}
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        <ProfileAvatar
          color={imageUri ? "#242424" : color}
          dimension={92}
          imageUri={imageUri}
          initials={initials}
          size="lg"
        />
        <View
          className="absolute bottom-0 size-9 items-center justify-center rounded-full border-4 border-background bg-accent"
          style={{ end: 0 }}
        >
          <FilledIcon name="camera" size={19} tone="accent-foreground" />
        </View>
      </Pressable>
      <Text className="mt-4 font-sans text-sm text-muted">
        {t("profile.photo.optional")}
      </Text>
    </View>
  );
}
