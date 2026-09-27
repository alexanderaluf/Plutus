import { useLocalSearchParams } from "expo-router";
import { BudgetDetailsScreen } from "@/features/budgets/budget-details-screen";
export default function BudgetDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetDetailsScreen key={id} id={id} />;
}
