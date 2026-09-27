import { useLocalSearchParams } from "expo-router";
import { RecurringEditorScreen } from "@/features/recurring/recurring-editor-screen";
export default function RecurringEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecurringEditorScreen editId={id} />;
}
