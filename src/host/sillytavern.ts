import { buildLorebookCatalog, type LorebookCatalogItem } from '../core/lorebook-catalog';
import type { LorebookGroupSettings } from '../core/group-settings';
import { EXTENSION_ID } from '../identity';

const WORLD_INFO_MODULE_URL = '/scripts/world-info.js';
export const GROUP_SETTINGS_CHANGED_EVENT = `${EXTENSION_ID}:settings-changed`;

const LOREBOOK_EVENT_KEYS = [
  'WORLDINFO_SETTINGS_UPDATED',
  'WORLDINFO_UPDATED',
  'CHAT_CHANGED',
  'CHARACTER_EDITED',
  'CHARACTER_PAGE_LOADED',
] as const;

interface EventSourceLike {
  on(eventName: string, listener: () => void): unknown;
  removeListener(eventName: string, listener: () => void): unknown;
}

interface SillyTavernContextLike {
  readonly characters?: unknown;
  readonly chatMetadata?: unknown;
  readonly eventSource?: EventSourceLike;
  readonly eventTypes?: Record<string, unknown>;
  readonly extensionSettings?: Record<string, unknown>;
  readonly getWorldInfoNames?: () => unknown;
  readonly saveSettingsDebounced?: () => void;
}

interface WorldInfoModuleLike {
  readonly selected_world_info?: unknown;
  readonly world_info?: unknown;
  readonly onWorldInfoChange?: (
    args: { readonly state: 'on' | 'off'; readonly silent: boolean },
    text: string,
  ) => unknown;
  readonly openWorldInfoEditor?: (worldName: string) => unknown;
}

interface SillyTavernGlobalLike {
  readonly getContext?: () => SillyTavernContextLike;
}

type HostGlobal = typeof globalThis & {
  readonly SillyTavern?: SillyTavernGlobalLike;
};

export interface LorebookHost {
  readCatalog(): Promise<LorebookCatalogItem[]>;
  readGroupSettings(): unknown;
  writeGroupSettings(settings: LorebookGroupSettings): void;
  subscribe(listener: () => void): () => void;
  readonly setWorldInfoActive?: (worldName: string, active: boolean) => Promise<void>;
  readonly openWorldInfoEditor?: (worldName: string) => Promise<void>;
}

export interface LorebookHostDependencies {
  readonly getContext: () => SillyTavernContextLike;
  readonly loadWorldInfoModule: () => Promise<WorldInfoModuleLike>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getDefaultContext(): SillyTavernContextLike {
  const getContext = (globalThis as HostGlobal).SillyTavern?.getContext;
  if (typeof getContext !== 'function') {
    throw new Error('SillyTavern.getContext() is unavailable.');
  }

  return getContext();
}

async function loadDefaultWorldInfoModule(): Promise<WorldInfoModuleLike> {
  return (await import(/* @vite-ignore */ WORLD_INFO_MODULE_URL)) as WorldInfoModuleLike;
}

export function isSillyTavernHostAvailable(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (globalThis as HostGlobal).SillyTavern?.getContext === 'function'
  );
}

export function createLorebookHost(
  dependencies: LorebookHostDependencies = {
    getContext: getDefaultContext,
    loadWorldInfoModule: loadDefaultWorldInfoModule,
  },
): LorebookHost {
  return {
    async readCatalog() {
      const context = dependencies.getContext();
      if (typeof context.getWorldInfoNames !== 'function') {
        throw new Error('SillyTavern.getContext().getWorldInfoNames() is unavailable.');
      }

      const worldInfoModule = await dependencies.loadWorldInfoModule();
      const chatMetadata = asRecord(context.chatMetadata);

      return buildLorebookCatalog({
        worldNames: context.getWorldInfoNames(),
        globalWorldNames: worldInfoModule.selected_world_info,
        characters: context.characters,
        worldInfoSettings: worldInfoModule.world_info,
        chatWorldName: chatMetadata?.world_info,
      });
    },

    readGroupSettings() {
      return dependencies.getContext().extensionSettings?.[EXTENSION_ID];
    },

    writeGroupSettings(settings) {
      const context = dependencies.getContext();
      if (!context.extensionSettings || typeof context.saveSettingsDebounced !== 'function') {
        throw new Error('SillyTavern extension settings persistence is unavailable.');
      }

      const hadPreviousSettings = Object.prototype.hasOwnProperty.call(
        context.extensionSettings,
        EXTENSION_ID,
      );
      const previousSettings = context.extensionSettings[EXTENSION_ID];
      context.extensionSettings[EXTENSION_ID] = settings;
      try {
        context.saveSettingsDebounced();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(GROUP_SETTINGS_CHANGED_EVENT));
        }
      } catch (error) {
        if (hadPreviousSettings) {
          context.extensionSettings[EXTENSION_ID] = previousSettings;
        } else {
          Reflect.deleteProperty(context.extensionSettings, EXTENSION_ID);
        }
        throw error;
      }
    },

    subscribe(listener) {
      const context = dependencies.getContext();
      const eventSource = context.eventSource;
      const eventTypes = context.eventTypes;
      if (!eventSource || !eventTypes) {
        throw new Error('SillyTavern eventSource/eventTypes are unavailable.');
      }

      const eventNames = Array.from(
        new Set(
          LOREBOOK_EVENT_KEYS.map((key) => eventTypes[key]).filter(
            (eventName): eventName is string =>
              typeof eventName === 'string' && eventName.length > 0,
          ),
        ),
      );

      for (const eventName of eventNames) {
        eventSource.on(eventName, listener);
      }

      return () => {
        for (const eventName of eventNames) {
          eventSource.removeListener(eventName, listener);
        }
      };
    },

    async setWorldInfoActive(worldName, active) {
      const worldInfoModule = await dependencies.loadWorldInfoModule();
      if (typeof worldInfoModule.onWorldInfoChange !== 'function') {
        throw new Error('SillyTavern world info activation API is unavailable.');
      }
      worldInfoModule.onWorldInfoChange({ state: active ? 'on' : 'off', silent: true }, worldName);
    },

    async openWorldInfoEditor(worldName) {
      const worldInfoModule = await dependencies.loadWorldInfoModule();
      if (typeof worldInfoModule.openWorldInfoEditor !== 'function') {
        throw new Error('SillyTavern world info editor API is unavailable.');
      }
      worldInfoModule.openWorldInfoEditor(worldName);
    },
  };
}
