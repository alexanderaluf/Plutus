import { useLocalSearchParams } from "expo-router";
import { RecurringDetailsScreen } from "@/features/recurring/recurring-details-screen";
export default function RecurringDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecurringDetailsScreen id={id} />;
}
