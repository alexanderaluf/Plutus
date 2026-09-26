import type { ReactNode } from "react";
import { View } from "react-native";

import type { Transaction } from "@/features/home/types";

import type { ChatCard } from "../tools/tool-context";
import { ChatEntityCard, type useEntityData } from "./chat-entity-cards";

/**
 * Cards render from the live document by id, so they always show current
 * values (including changes the user just confirmed) rather than numbers the
 * model wrote.
 */
export function ChatCards({
  cards,
  data,
  onTransaction,
  renderProposal,
}: {
  cards: ChatCard[];
  /** Live projections, built once by the chat screen. */
  data: ReturnType<typeof useEntityData>;
  onTransaction: (transaction: Transaction) => void;
  renderProposal: (proposalId: string) => ReactNode;
}) {
  return (
    <View className="gap-2">
      {cards.map((card) =>
        card.kind === "change_proposal" ? (
          <View key={`proposal-${card.proposalId}`}>{renderProposal(card.proposalId)}</View>
        ) : (
          <ChatEntityCard key={`${card.kind}-${card.id}`} card={card} data={data} onTransaction={onTransaction} />
        ),
      )}
    </View>
  );
}
