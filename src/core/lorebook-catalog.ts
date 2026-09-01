export const LOREBOOK_STATUS_ORDER = ['global', 'character', 'chat'] as const;

export type LorebookStatus = (typeof LOREBOOK_STATUS_ORDER)[number];

export interface LorebookCatalogItem {
  readonly name: string;
  readonly statuses: readonly LorebookStatus[];
}

export interface LorebookCatalogSource {
  readonly worldNames: unknown;
  readonly globalWorldNames: unknown;
  readonly characters: unknown;
  readonly worldInfoSettings: unknown;
  readonly chatWorldName: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) {
      continue;
    }

    seen.add(item);
    result.push(item);
  }

  return result;
}

function collectCharacterWorldNames(characters: unknown, worldInfoSettings: unknown): Set<string> {
  const names = new Set<string>();

  if (Array.isArray(characters)) {
    for (const characterValue of characters) {
      const character = asRecord(characterValue);
      const data = asRecord(character?.data);
      const extensions = asRecord(data?.extensions);
      const primaryWorld = extensions?.world;
      if (typeof primaryWorld === 'string' && primaryWorld.length > 0) {
        names.add(primaryWorld);
      }
    }
  }

  const settings = asRecord(worldInfoSettings);
  const characterLore = settings?.charLore;
  if (Array.isArray(characterLore)) {
    for (const bindingValue of characterLore) {
      const binding = asRecord(bindingValue);
      for (const extraWorld of uniqueStrings(binding?.extraBooks)) {
        names.add(extraWorld);
      }
    }
  }

  return names;
}

export function buildLorebookCatalog(source: LorebookCatalogSource): LorebookCatalogItem[] {
  const globalWorlds = new Set(uniqueStrings(source.globalWorldNames));
  const characterWorlds = collectCharacterWorldNames(source.characters, source.worldInfoSettings);
  const chatWorld = typeof source.chatWorldName === 'string' ? source.chatWorldName : undefined;

  return uniqueStrings(source.worldNames).map((name) => {
    const statuses = LOREBOOK_STATUS_ORDER.filter((status) => {
      switch (status) {
        case 'global':
          return globalWorlds.has(name);
        case 'character':
          return characterWorlds.has(name);
        case 'chat':
          return chatWorld === name;
      }
    });

    return Object.freeze({
      name,
      statuses: Object.freeze(statuses),
    });
  });
}
