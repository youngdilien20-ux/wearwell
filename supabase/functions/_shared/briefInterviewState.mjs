const READY_FOR_OPTIONS =
  /\b(?:show|see|give|get|find|pick|suggest|display|view)\b[\s\S]{0,60}\b(?:outfits?|looks?|recommendations?|clothes|wardrobe|options?)\b|\b(?:i['’]?m|i am)\s+ready\b|\bthat['’]?s enough\b/i;

export function resolveInterviewTransition({
  action,
  currentField,
  latestAnswer,
  resolvedFields,
  proposedNextField,
  answers,
}) {
  const resolved = new Set(resolvedFields);
  if (action === "reply" && currentField && latestAnswer.trim()) {
    // A submitted answer ends this question even when extraction is uncertain.
    // Keep it unresolved as a fact if needed, but never make the user answer it again.
    resolved.add(currentField);
  }

  const readyToProceed = action !== "start" && READY_FOR_OPTIONS.test(latestAnswer);
  let nextField = proposedNextField;
  if (
    readyToProceed ||
    (nextField && (resolved.has(nextField) || answers[nextField]))
  ) {
    nextField = null;
  }

  return {
    resolvedFields: [...resolved],
    nextField,
    readyToProceed,
    suppressDuplicateQuestion:
      Boolean(proposedNextField && nextField === null && !readyToProceed),
  };
}