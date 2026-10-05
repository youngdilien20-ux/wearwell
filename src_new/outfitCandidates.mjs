const CATEGORY_ALIASES = {
  top: new Set(["top", "shirt", "blouse", "t-shirt", "tee"]),
  bottom: new Set(["bottom", "trouser", "trousers", "pants", "jeans", "skirt", "shorts"]),
  onePiece: new Set(["dress", "one-piece", "one piece", "onepiece", "jumpsuit", "romper"]),
  layer: new Set(["layer", "jacket", "coat", "cardigan", "blazer", "outerwear"]),
  shoes: new Set(["shoe", "shoes", "footwear", "boot", "boots", "sneaker", "sneakers", "loafer", "loafers"]),
  accessory: new Set(["accessory", "accessories", "scarf", "belt", "hat", "bag"]),
};
const MAX_CORE_COMBINATIONS = 80;
const MAX_ITEMS_PER_OPTIONAL_TYPE = 24;
const MAX_CANDIDATES = 240;

function categoryFor(item) {
  const type = typeof item?.type === "string" ? item.type.trim().toLowerCase().replace(/[_]+/g, " ") : "";
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.has(type)) return category;
  }
  return "";
}

function buildCoreCombinations(groups) {
  const separates = [];
  const topCount = groups.top.length;
  const bottomCount = groups.bottom.length;
  const pairCount = topCount * bottomCount;

  for (let round = 0; separates.length < Math.min(pairCount, MAX_CORE_COMBINATIONS); round += 1) {
    for (let topIndex = 0; topIndex < topCount && separates.length < MAX_CORE_COMBINATIONS; topIndex += 1) {
      const bottomIndex = (topIndex + round) % bottomCount;
      separates.push([groups.top[topIndex], groups.bottom[bottomIndex]]);
    }
  }

  const cores = [];
  const onePieceCores = groups.onePiece.map((item) => [item]);
  const roundCount = Math.max(separates.length, onePieceCores.length);
  for (let index = 0; index < roundCount && cores.length < MAX_CORE_COMBINATIONS; index += 1) {
    if (separates[index]) cores.push(separates[index]);
    if (onePieceCores[index] && cores.length < MAX_CORE_COMBINATIONS) cores.push(onePieceCores[index]);
  }
  return cores;
}

function variantsForCore(core, groups) {
  const optionGroups = [
    { items: groups.shoes.slice(0, MAX_ITEMS_PER_OPTIONAL_TYPE), defaultItem: groups.shoes[0] || null },
    { items: groups.layer.slice(0, MAX_ITEMS_PER_OPTIONAL_TYPE), defaultItem: null },
    { items: groups.accessory.slice(0, MAX_ITEMS_PER_OPTIONAL_TYPE), defaultItem: null },
  ];
  const defaults = optionGroups.map((group) => group.defaultItem);
  const variants = [];
  const seen = new Set();
  const addVariant = (selection) => {
    const items = [...core, ...selection.filter(Boolean)];
    const itemIds = [...new Set(items.map((item) => item.id))];
    if (itemIds.length === 0) return;
    const signature = [...itemIds].sort().join("\u001f");
    if (seen.has(signature)) return;
    seen.add(signature);
    variants.push({ items, itemIds });
  };

  addVariant(defaults);
  optionGroups.forEach((group, groupIndex) => {
    const current = defaults[groupIndex];
    for (const item of group.items) {
      if (item.id === current?.id) continue;
      const next = defaults.slice();
      next[groupIndex] = item;
      addVariant(next);
    }
    if (current) {
      const without = defaults.slice();
      without[groupIndex] = null;
      addVariant(without);
    }
  });
  return variants;
}

function toCandidate(variant, index) {
  const { items, itemIds } = variant;
  const palette = [...new Set(items.map((item) => item.color).filter((color) => typeof color === "string" && color.trim()))];
  return {
    id: "wardrobe-" + [...itemIds].sort().map((id) => encodeURIComponent(id)).join("--"),
    name: "Look " + String(index + 1).padStart(2, "0"),
    level: "Wardrobe combination · " + itemIds.length + (itemIds.length === 1 ? " piece" : " pieces"),
    itemIds,
    palette,
    reason: "Uses " + itemIds.length + " pieces from your current wardrobe.",
    weather: "Weather fit is not scored yet.",
    formality: "Occasion fit is not scored yet.",
    swap: "Regenerate to see another wardrobe combination.",
  };
}

export function generateOutfitCandidatePool(wardrobe) {
  if (!Array.isArray(wardrobe)) return [];

  const groups = { top: [], bottom: [], onePiece: [], layer: [], shoes: [], accessory: [] };
  for (const item of wardrobe) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) continue;
    const category = categoryFor(item);
    if (category) groups[category].push(item);
  }

  const hasSeparates = groups.top.length > 0 && groups.bottom.length > 0;
  if (!hasSeparates && groups.onePiece.length === 0) return [];

  const cores = buildCoreCombinations(groups);
  const variantsByCore = cores.map((core) => variantsForCore(core, groups));
  const allVariants = [];
  const rounds = Math.max(0, ...variantsByCore.map((variants) => variants.length));
  for (let round = 0; round < rounds && allVariants.length < MAX_CANDIDATES; round += 1) {
    for (const variants of variantsByCore) {
      if (variants[round]) allVariants.push(variants[round]);
      if (allVariants.length >= MAX_CANDIDATES) break;
    }
  }

  return allVariants.map(toCandidate);
}

export function generateOutfitCandidates(wardrobe, limit = 3, offset = 0) {
  const count = Number.isInteger(limit) ? Math.max(0, Math.min(limit, 6)) : 3;
  if (count === 0) return [];

  const candidates = generateOutfitCandidatePool(wardrobe);
  if (candidates.length === 0) return [];
  const start = Number.isInteger(offset) ? ((offset % candidates.length) + candidates.length) % candidates.length : 0;
  const visibleCount = Math.min(count, candidates.length);
  return Array.from({ length: visibleCount }, (_, index) =>
    candidates[(start + index) % candidates.length],
  );
}
