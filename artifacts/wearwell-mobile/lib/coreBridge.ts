// The web and mobile apps share the same deterministic outfit rules.
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { extractDayBrief as extractDayBriefCore } from '../../../src/dayBrief.mjs';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { scoreOutfitCandidates as scoreOutfitCandidatesCore } from '../../../src/outfitScoring.mjs';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { selectRecommendation as selectRecommendationCore } from '../../../src/selectionState.mjs';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { restoreSelectedRecommendation as restoreSelectedRecommendationCore } from '../../../src/selectionState.mjs';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { swapOptionsFor as swapOptionsForCore } from '../../../src/selectionState.mjs';

export type DayBrief = Record<string, string>;

type ScoreOptions = {
  dayBrief?: DayBrief;
  weather?: { tempC?: number; isFallback?: boolean };
  wearHistory?: any[];
  regenerationReason?: string;
  excludedItemSets?: string[];
};

export const extractDayBrief: (
  rawText: string,
  selectedOccasion?: string,
) => DayBrief = extractDayBriefCore;

const scoreCore = scoreOutfitCandidatesCore as unknown as (
  wardrobe: any[],
  options?: ScoreOptions,
) => { candidates: any[]; generatedCount: number; excludedCount: number };

export function scoreOutfitCandidates(wardrobe: any[], options?: ScoreOptions) {
  return scoreCore(wardrobe, options);
}

export const selectRecommendation: (
  state: any,
  outfit: any,
  options?: {
    dayBrief?: DayBrief;
    wardrobeById?: Record<string, any>;
    now?: Date;
    eventId?: string;
    eventLabel?: string;
  },
) => any = selectRecommendationCore;

export const restoreSelectedRecommendation: (
  state: any,
  now?: Date,
  eventId?: string,
) => string | null = restoreSelectedRecommendationCore;

export function swapOptionsFor(
  outfit: any,
  candidates: any[],
): { candidate: any; removedId: string; addedId: string }[] {
  const getOptions = swapOptionsForCore as unknown as (
    outfit: any,
    candidates: any[],
  ) => Array<{ candidate: any; removedId: string; addedId: string } | null>;
  return getOptions(outfit, candidates).filter(
    (option): option is { candidate: any; removedId: string; addedId: string } =>
      Boolean(option),
  );
}