import { EXTENSION_ID, EXTENSION_VERSION, getExtensionIdentity } from './identity';
import { createLorebookHost, isSillyTavernHostAvailable } from './host/sillytavern';
import { mountLorebookPanel } from './ui/lorebook-panel';

export interface RuntimeStatus {
  readonly extensionId: typeof EXTENSION_ID;
  readonly version: typeof EXTENSION_VERSION;
  readonly active: true;
}

const RUNTIME_STATUS_KEY = Symbol.for(`${EXTENSION_ID}.runtimeStatus`);
let cleanupRuntime: (() => void) | undefined;

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_STATUS_KEY]?: RuntimeStatus;
};

function runtimeGlobal(): RuntimeGlobal {
  return globalThis as RuntimeGlobal;
}

export function getRuntimeStatus(): RuntimeStatus | undefined {
  return runtimeGlobal()[RUNTIME_STATUS_KEY];
}

export async function onActivate(): Promise<void> {
  cleanupRuntime?.();
  cleanupRuntime = undefined;
  runtimeGlobal()[RUNTIME_STATUS_KEY] = Object.freeze({
    extensionId: EXTENSION_ID,
    version: EXTENSION_VERSION,
    active: true,
  });

  if (isSillyTavernHostAvailable()) {
    try {
      cleanupRuntime = await mountLorebookPanel(createLorebookHost());
    } catch (error) {
      Reflect.deleteProperty(runtimeGlobal(), RUNTIME_STATUS_KEY);
      throw error;
    }
  }

  console.info(`[${getExtensionIdentity()}] activated`);
}

export function onDisable(): void {
  cleanupRuntime?.();
  cleanupRuntime = undefined;
  Reflect.deleteProperty(runtimeGlobal(), RUNTIME_STATUS_KEY);
  console.info(`[${getExtensionIdentity()}] disabled`);
}
