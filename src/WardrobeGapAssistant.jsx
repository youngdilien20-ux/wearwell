import { useState } from "react";
import {
  budgetGuidanceFor,
  WARDROBE_BUDGET_OPTIONS,
} from "./wardrobeGapPlanning.mjs";
import { categoryFor } from "./outfitCandidates.mjs";

const categoryLabel = {
  top: "Top",
  bottom: "Bottom",
  onePiece: "One-piece",
  layer: "Layer",
  shoes: "Shoes",
  accessory: "Accessory",
};

function UserMessage({ children }) {
  return <div className="assistant-chat-message user">{children}</div>;
}

function AssistantMessage({ children }) {
  return <div className="assistant-chat-message assistant">{children}</div>;
}

export default function WardrobeGapAssistant({
  plan,
  brief,
  onOpenWardrobe,
  onReviewBrief,
}) {
  const [step, setStep] = useState("choice");
  const [budgetId, setBudgetId] = useState("");
  const budget = WARDROBE_BUDGET_OPTIONS.find((option) => option.id === budgetId);

  return (
    <section className="assistant-gap-followup" aria-label="Plan for missing wardrobe pieces">
      {step === "choice" && (
        <>
          <AssistantMessage>
            I couldn’t confirm a complete outfit from your available wardrobe for this brief. Would you like a buying plan, or should we start with the clothes you already own?
          </AssistantMessage>
          <div className="assistant-gap-choices" role="group" aria-label="Choose how to continue">
            <button type="button" className="assistant-gap-choice" onClick={() => setStep("budget")}>
              <strong>Plan what to buy</strong>
              <span>Choose a budget and see which wardrobe pieces could help.</span>
            </button>
            <button type="button" className="assistant-gap-choice" onClick={() => setStep("wardrobe")}>
              <strong>Use what I own</strong>
              <span>Review available pieces and the gaps in this outfit.</span>
            </button>
          </div>
        </>
      )}

      {step === "budget" && (
        <>
          <UserMessage>Plan what to buy</UserMessage>
          <AssistantMessage>What budget should I use for your shopping plan?</AssistantMessage>
          <div className="assistant-gap-budgets" role="group" aria-label="Choose a shopping budget">
            {WARDROBE_BUDGET_OPTIONS.map((option) => (
              <button
                type="button"
                className="assistant-gap-budget"
                key={option.id}
                onClick={() => {
                  setBudgetId(option.id);
                  setStep("shopping");
                }}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "shopping" && budget && (
        <>
          <UserMessage>{budget.label}</UserMessage>
          <AssistantMessage>
            Here’s a shopping direction based on the gaps I can see. These are clothing categories and fit checks, not live products or store prices.
          </AssistantMessage>
          <div className="assistant-gap-result">
            <div className="assistant-gap-result-heading">
              <strong>What to look for</strong>
              <button type="button" className="text-button" onClick={() => setStep("budget")}>Change budget</button>
            </div>
            <p className="assistant-gap-budget-guidance">{budgetGuidanceFor(budget.id)}</p>
            <ul className="assistant-gap-route-list">
              {plan.shoppingRoutes.map((route) => (
                <li key={route.id}>
                  <strong>{route.title}</strong>
                  <span>{route.detail}</span>
                </li>
              ))}
            </ul>
            {plan.requirements.length > 0 ? (
              <div className="assistant-gap-requirements">
                <strong>Check these needs when shopping</strong>
                <ul>
                  {plan.requirements.map(({ label, value }) => (
                    <li key={label}><b>{label}:</b> {value}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="assistant-gap-note">No specific fit requirements were recorded. Check comfort and fit before buying.</p>
            )}
            <p className="assistant-gap-note">Wearwell doesn’t have a product catalog or current prices, so this plan won’t invent store listings or costs.</p>
          </div>
        </>
      )}

      {step === "wardrobe" && (
        <>
          <UserMessage>Show me what I can use from my wardrobe</UserMessage>
          <AssistantMessage>
            I won’t label these as a complete outfit when they don’t meet the brief yet. Here are the real pieces currently marked available.
          </AssistantMessage>
          <div className="assistant-gap-result">
            {plan.availableItems.length > 0 ? (
              <ul className="assistant-gap-owned-list">
                {plan.availableItems.map((item) => (
                  <li key={item.id}>
                    <span className="assistant-gap-item-type">{categoryLabel[categoryFor(item)] || item.type || "Wardrobe item"}</span>
                    <strong>{item.name}</strong>
                    <span>{item.tone || item.note || item.color || "Saved in your wardrobe"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="assistant-gap-note">There are no pieces marked available yet. Add a few items to your wardrobe and we can build from them.</p>
            )}
            {!plan.hasCompleteBase && (
              <p className="assistant-gap-note">
                {plan.missingCategories.includes("top") && plan.missingCategories.includes("bottom")
                  ? "A top-and-bottom pair or one-piece item is still needed for a complete outfit."
                  : `Your wardrobe still needs ${plan.missingCategories.map((category) => category === "onePiece" ? "a one-piece outfit" : `a ${category}`).join(" or ")} for a complete outfit.`}
              </p>
            )}
            {plan.requirements.length > 0 && (
              <div className="assistant-gap-requirements">
                <strong>Needs in your brief</strong>
                <ul>
                  {plan.requirements.map(({ label, value }) => (
                    <li key={label}><b>{label}:</b> {value}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="assistant-gap-actions">
              <button type="button" className="understand-button" onClick={onOpenWardrobe}>Open my wardrobe</button>
              <button type="button" className="text-button" onClick={onReviewBrief}>Review outfit needs</button>
            </div>
          </div>
        </>
      )}

      {step !== "choice" && (
        <button type="button" className="text-button assistant-gap-back" onClick={() => setStep("choice")}>
          Back to choices
        </button>
      )}
    </section>
  );
}