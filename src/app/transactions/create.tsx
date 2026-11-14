import { useLocalSearchParams } from "expo-router";

import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionEditorScreen } from "@/features/transactions/transaction-editor-screen";

export default function CreateTransactionRoute() {
  const { activeProfileId } = useProfiles();
  const params = useLocalSearchParams<{ type?: string; profileId?: string }>();
  return (
    <TransactionEditorScreen
      key={`${activeProfileId}:${params.type ?? ""}:${params.profileId ?? ""}`}
    />
  );
}
