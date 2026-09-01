import {
  createGroup,
  deleteGroup,
  loadGroupSettings,
  moveGroup,
  renameGroup,
  setBookGroupMembership,
  setBookGroupMemberships,
  type LorebookGroupSettings,
} from './group-settings';

export interface GroupSettingsPersistence {
  read(): unknown;
  write(settings: LorebookGroupSettings): void;
}

export interface LorebookGroupStore {
  getSnapshot(): LorebookGroupSettings;
  getIssue(): string | undefined;
  create(input: { readonly id: string; readonly name: string }): void;
  rename(groupId: string, nextName: string): void;
  delete(groupId: string): void;
  move(groupId: string, destinationIndex: number): void;
  setMembership(groupId: string, bookName: string, assigned: boolean): void;
  setMemberships(groupId: string, bookNames: readonly string[], assigned: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createLorebookGroupStore(
  persistence: GroupSettingsPersistence,
): LorebookGroupStore {
  const loaded = loadGroupSettings(persistence.read());
  let settings = loaded.settings;
  const issue = loaded.issue;
  const listeners = new Set<() => void>();

  if (loaded.shouldPersist) {
    persistence.write(settings);
  }

  const commit = (nextSettings: LorebookGroupSettings): void => {
    if (issue) {
      throw new Error(issue);
    }

    persistence.write(nextSettings);
    settings = nextSettings;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => settings,
    getIssue: () => issue,
    create: (input) => {
      commit(createGroup(settings, input));
    },
    rename: (groupId, nextName) => {
      commit(renameGroup(settings, groupId, nextName));
    },
    delete: (groupId) => {
      commit(deleteGroup(settings, groupId));
    },
    move: (groupId, destinationIndex) => {
      commit(moveGroup(settings, groupId, destinationIndex));
    },
    setMembership: (groupId, bookName, assigned) => {
      commit(setBookGroupMembership(settings, groupId, bookName, assigned));
    },
    setMemberships: (groupId, bookNames, assigned) => {
      commit(setBookGroupMemberships(settings, groupId, bookNames, assigned));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
