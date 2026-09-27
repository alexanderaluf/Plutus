import { useLocalSearchParams } from "expo-router";

import { TransactionEditorScreen } from "@/features/transactions/transaction-editor-screen";

export default function EditTransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionEditorScreen editId={id} />;
}