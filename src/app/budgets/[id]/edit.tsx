import { useLocalSearchParams } from "expo-router";
import { BudgetEditorScreen } from "@/features/budgets/budget-editor-screen";
export default function BudgetEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetEditorScreen key={id} editId={id} />;
}
