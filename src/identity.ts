export const EXTENSION_ID = 'sillytavern_lorebook_groups' as const;
export const EXTENSION_NAME = 'Lorebook Groups' as const;
export const EXTENSION_VERSION = '0.1.0' as const;

export function getExtensionIdentity(): string {
  return `${EXTENSION_NAME} ${EXTENSION_VERSION} (${EXTENSION_ID})`;
}
