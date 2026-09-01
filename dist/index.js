const EXTENSION_ID = "sillytavern_lorebook_groups";
const EXTENSION_NAME = "Lorebook Groups";
const EXTENSION_VERSION = "0.1.0";
function getExtensionIdentity() {
  return `${EXTENSION_NAME} ${EXTENSION_VERSION} (${EXTENSION_ID})`;
}
const LOREBOOK_STATUS_ORDER = ["global", "character", "chat"];
function asRecord$2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function uniqueStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}
function collectCharacterWorldNames(characters, worldInfoSettings) {
  const names = /* @__PURE__ */ new Set();
  if (Array.isArray(characters)) {
    for (const characterValue of characters) {
      const character = asRecord$2(characterValue);
      const data = asRecord$2(character?.data);
      const extensions = asRecord$2(data?.extensions);
      const primaryWorld = extensions?.world;
      if (typeof primaryWorld === "string" && primaryWorld.length > 0) {
        names.add(primaryWorld);
      }
    }
  }
  const settings = asRecord$2(worldInfoSettings);
  const characterLore = settings?.charLore;
  if (Array.isArray(characterLore)) {
    for (const bindingValue of characterLore) {
      const binding = asRecord$2(bindingValue);
      for (const extraWorld of uniqueStrings(binding?.extraBooks)) {
        names.add(extraWorld);
      }
    }
  }
  return names;
}
function buildLorebookCatalog(source) {
  const globalWorlds = new Set(uniqueStrings(source.globalWorldNames));
  const characterWorlds = collectCharacterWorldNames(source.characters, source.worldInfoSettings);
  const chatWorld = typeof source.chatWorldName === "string" ? source.chatWorldName : void 0;
  return uniqueStrings(source.worldNames).map((name) => {
    const statuses = LOREBOOK_STATUS_ORDER.filter((status) => {
      switch (status) {
        case "global":
          return globalWorlds.has(name);
        case "character":
          return characterWorlds.has(name);
        case "chat":
          return chatWorld === name;
      }
    });
    return Object.freeze({
      name,
      statuses: Object.freeze(statuses)
    });
  });
}
const WORLD_INFO_MODULE_URL = "/scripts/world-info.js";
const GROUP_SETTINGS_CHANGED_EVENT = `${EXTENSION_ID}:settings-changed`;
const LOREBOOK_EVENT_KEYS = [
  "WORLDINFO_SETTINGS_UPDATED",
  "WORLDINFO_UPDATED",
  "CHAT_CHANGED",
  "CHARACTER_EDITED",
  "CHARACTER_PAGE_LOADED"
];
function asRecord$1(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function getDefaultContext() {
  const getContext = globalThis.SillyTavern?.getContext;
  if (typeof getContext !== "function") {
    throw new Error("SillyTavern.getContext() is unavailable.");
  }
  return getContext();
}
async function loadDefaultWorldInfoModule() {
  return await import(
    /* @vite-ignore */
    WORLD_INFO_MODULE_URL
  );
}
function isSillyTavernHostAvailable() {
  return typeof document !== "undefined" && typeof globalThis.SillyTavern?.getContext === "function";
}
function createLorebookHost(dependencies = {
  getContext: getDefaultContext,
  loadWorldInfoModule: loadDefaultWorldInfoModule
}) {
  return {
    async readCatalog() {
      const context = dependencies.getContext();
      if (typeof context.getWorldInfoNames !== "function") {
        throw new Error("SillyTavern.getContext().getWorldInfoNames() is unavailable.");
      }
      const worldInfoModule = await dependencies.loadWorldInfoModule();
      const chatMetadata = asRecord$1(context.chatMetadata);
      return buildLorebookCatalog({
        worldNames: context.getWorldInfoNames(),
        globalWorldNames: worldInfoModule.selected_world_info,
        characters: context.characters,
        worldInfoSettings: worldInfoModule.world_info,
        chatWorldName: chatMetadata?.world_info
      });
    },
    readGroupSettings() {
      return dependencies.getContext().extensionSettings?.[EXTENSION_ID];
    },
    writeGroupSettings(settings) {
      const context = dependencies.getContext();
      if (!context.extensionSettings || typeof context.saveSettingsDebounced !== "function") {
        throw new Error("SillyTavern extension settings persistence is unavailable.");
      }
      const hadPreviousSettings = Object.prototype.hasOwnProperty.call(
        context.extensionSettings,
        EXTENSION_ID
      );
      const previousSettings = context.extensionSettings[EXTENSION_ID];
      context.extensionSettings[EXTENSION_ID] = settings;
      try {
        context.saveSettingsDebounced();
        if (typeof window !== "undefined") {
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
        throw new Error("SillyTavern eventSource/eventTypes are unavailable.");
      }
      const eventNames = Array.from(
        new Set(
          LOREBOOK_EVENT_KEYS.map((key) => eventTypes[key]).filter(
            (eventName) => typeof eventName === "string" && eventName.length > 0
          )
        )
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
      if (typeof worldInfoModule.onWorldInfoChange !== "function") {
        throw new Error("SillyTavern world info activation API is unavailable.");
      }
      worldInfoModule.onWorldInfoChange({ state: active ? "on" : "off", silent: true }, worldName);
    },
    async openWorldInfoEditor(worldName) {
      const worldInfoModule = await dependencies.loadWorldInfoModule();
      if (typeof worldInfoModule.openWorldInfoEditor !== "function") {
        throw new Error("SillyTavern world info editor API is unavailable.");
      }
      worldInfoModule.openWorldInfoEditor(worldName);
    }
  };
}
const GROUP_SETTINGS_SCHEMA_VERSION = 1;
const DEFAULT_GROUPS = Object.freeze([
  Object.freeze({ id: "character-lorebooks", name: "角色卡世界书" }),
  Object.freeze({ id: "functional-lorebooks", name: "功能性世界书" })
]);
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function normalizedText(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function exactNonBlankText(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return void 0;
  }
  return value;
}
function parseUniqueNames(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of value) {
    const name = exactNonBlankText(item);
    if (!name || seen.has(name)) {
      return void 0;
    }
    seen.add(name);
    names.push(name);
  }
  return Object.freeze(names);
}
function freezeSettings(groups) {
  return Object.freeze({
    schemaVersion: GROUP_SETTINGS_SCHEMA_VERSION,
    groups: Object.freeze(
      groups.map(
        (group) => Object.freeze({
          id: group.id,
          name: group.name,
          bookNames: Object.freeze([...group.bookNames])
        })
      )
    )
  });
}
function createDefaultGroupSettings() {
  return freezeSettings(
    DEFAULT_GROUPS.map((group) => ({
      ...group,
      bookNames: []
    }))
  );
}
function parseGroups(value, bookNamesKey) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const groups = [];
  const ids = /* @__PURE__ */ new Set();
  const normalizedNames = /* @__PURE__ */ new Set();
  for (const item of value) {
    const record = asRecord(item);
    const id = normalizedText(record?.id);
    const name = normalizedText(record?.name);
    const bookNames = parseUniqueNames(record?.[bookNamesKey]);
    const normalizedName = name?.toLocaleLowerCase();
    if (!id || !name || !bookNames || !normalizedName || ids.has(id) || normalizedNames.has(normalizedName)) {
      return void 0;
    }
    ids.add(id);
    normalizedNames.add(normalizedName);
    groups.push({ id, name, bookNames });
  }
  return groups;
}
function parseCurrentSettings(value) {
  if (value.schemaVersion !== GROUP_SETTINGS_SCHEMA_VERSION) {
    return void 0;
  }
  const groups = parseGroups(value.groups, "bookNames");
  return groups ? freezeSettings(groups) : void 0;
}
function parseLegacySettings(value) {
  if (value.schemaVersion !== 0) {
    return void 0;
  }
  const groups = parseGroups(value.groups, "worldNames");
  if (!groups) {
    return void 0;
  }
  return {
    schemaVersion: 0,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      worldNames: group.bookNames
    }))
  };
}
function loadGroupSettings(value) {
  if (value === void 0) {
    return Object.freeze({
      settings: createDefaultGroupSettings(),
      source: "missing",
      shouldPersist: true
    });
  }
  const record = asRecord(value);
  if (record) {
    const current = parseCurrentSettings(record);
    if (current) {
      return Object.freeze({ settings: current, source: "current", shouldPersist: false });
    }
    const legacy = parseLegacySettings(record);
    if (legacy) {
      return Object.freeze({
        settings: freezeSettings(
          legacy.groups.map((group) => ({
            id: group.id,
            name: group.name,
            bookNames: group.worldNames
          }))
        ),
        source: "migrated",
        shouldPersist: true
      });
    }
  }
  return Object.freeze({
    settings: createDefaultGroupSettings(),
    source: "invalid",
    shouldPersist: false,
    issue: "分组数据格式异常，已停止写入以保护原数据。"
  });
}
function assertNonEmpty(value, label) {
  const normalized = normalizedText(value);
  if (!normalized) {
    throw new Error(`${label}不能为空。`);
  }
  return normalized;
}
function assertExactNonBlank(value, label) {
  const exactValue = exactNonBlankText(value);
  if (!exactValue) {
    throw new Error(`${label}不能为空。`);
  }
  return exactValue;
}
function assertGroupExists(settings, groupId) {
  const index = settings.groups.findIndex((group) => group.id === groupId);
  if (index < 0) {
    throw new Error("找不到指定分组。");
  }
  return index;
}
function assertUniqueGroupName(settings, name, exceptGroupId) {
  const normalizedName = name.toLocaleLowerCase();
  if (settings.groups.some(
    (group) => group.id !== exceptGroupId && group.name.toLocaleLowerCase() === normalizedName
  )) {
    throw new Error("分组名称不能重复。");
  }
}
function createGroup(settings, input) {
  const id = assertNonEmpty(input.id, "分组编号");
  const name = assertNonEmpty(input.name, "分组名称");
  if (settings.groups.some((group) => group.id === id)) {
    throw new Error("分组编号不能重复。");
  }
  assertUniqueGroupName(settings, name);
  return freezeSettings([...settings.groups, { id, name, bookNames: [] }]);
}
function renameGroup(settings, groupId, nextNameValue) {
  const groupIndex = assertGroupExists(settings, groupId);
  const nextName = assertNonEmpty(nextNameValue, "分组名称");
  assertUniqueGroupName(settings, nextName, groupId);
  return freezeSettings(
    settings.groups.map(
      (group, index) => index === groupIndex ? { ...group, name: nextName } : group
    )
  );
}
function deleteGroup(settings, groupId) {
  const groupIndex = assertGroupExists(settings, groupId);
  return freezeSettings(settings.groups.filter((_, index) => index !== groupIndex));
}
function moveGroup(settings, groupId, destinationIndex) {
  const sourceIndex = assertGroupExists(settings, groupId);
  if (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex >= settings.groups.length) {
    throw new Error("分组排序位置无效。");
  }
  const groups = [...settings.groups];
  const [group] = groups.splice(sourceIndex, 1);
  if (!group) {
    throw new Error("找不到指定分组。");
  }
  groups.splice(destinationIndex, 0, group);
  return freezeSettings(groups);
}
function setBookGroupMembership(settings, groupId, bookNameValue, assigned) {
  return setBookGroupMemberships(settings, groupId, [bookNameValue], assigned);
}
function setBookGroupMemberships(settings, groupId, bookNameValues, assigned) {
  const groupIndex = assertGroupExists(settings, groupId);
  const bookNames = [
    ...new Set(bookNameValues.map((name) => assertExactNonBlank(name, "世界书名称")))
  ];
  if (bookNames.length === 0) {
    throw new Error("至少选择一本世界书。");
  }
  const selectedBookNames = new Set(bookNames);
  return freezeSettings(
    settings.groups.map((group, index) => {
      if (index !== groupIndex) {
        return group;
      }
      return {
        ...group,
        bookNames: assigned ? [
          ...group.bookNames,
          ...bookNames.filter((bookName) => !group.bookNames.includes(bookName))
        ] : group.bookNames.filter((name) => !selectedBookNames.has(name))
      };
    })
  );
}
function createLorebookGroupStore(persistence) {
  const loaded = loadGroupSettings(persistence.read());
  let settings = loaded.settings;
  const issue = loaded.issue;
  const listeners = /* @__PURE__ */ new Set();
  if (loaded.shouldPersist) {
    persistence.write(settings);
  }
  const commit = (nextSettings) => {
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
    }
  };
}
function element$1(tagName, className) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}
function createUniqueGroupId(settings) {
  const base = `custom-${Date.now().toString(36)}`;
  const ids = new Set(settings.groups.map((group) => group.id));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}-${String(suffix)}`;
    suffix += 1;
  }
  return candidate;
}
function submitFormOnEnter(event) {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }
  event.preventDefault();
  const input = event.currentTarget;
  input.form?.requestSubmit();
}
function createGroupManager(store) {
  const root = element$1("section", "lbg-manager");
  root.setAttribute("aria-labelledby", `${EXTENSION_ID}-manager-heading`);
  const heading = element$1("h3", "lbg-manager__heading");
  heading.id = `${EXTENSION_ID}-manager-heading`;
  heading.textContent = "管理分组";
  const description = element$1("p", "lbg-manager__description");
  description.textContent = "新建、改名、排序或删除分组。删除分组不会删除其中的世界书。";
  const createForm = element$1("form", "lbg-create-form");
  const createLabel = element$1("label", "lbg-field");
  const createLabelText = element$1("span", "lbg-field__label");
  createLabelText.textContent = "新分组名称";
  const createInput = element$1("input", "lbg-field__input");
  createInput.type = "text";
  createInput.maxLength = 100;
  createInput.autocomplete = "off";
  createInput.setAttribute("aria-describedby", `${EXTENSION_ID}-manager-message`);
  createLabel.append(createLabelText, createInput);
  const createButton = element$1("button", "lbg-action lbg-action--primary");
  createButton.type = "submit";
  createButton.textContent = "新建分组";
  createForm.append(createLabel, createButton);
  const message = element$1("p", "lbg-manager__message");
  message.id = `${EXTENSION_ID}-manager-message`;
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const groupList = element$1("ul", "lbg-group-list");
  groupList.setAttribute("aria-label", "自定义分组");
  root.append(heading, description, createForm, message, groupList);
  const expandedGroupIds = /* @__PURE__ */ new Set();
  const renameDrafts = /* @__PURE__ */ new Map();
  let deleteConfirmationId;
  let focusAfterRender;
  let disposed = false;
  const clearMessage = () => {
    message.textContent = "";
    message.classList.remove("lbg-manager__message--error");
  };
  const showMessage = (text2, isError, input) => {
    message.textContent = text2;
    message.classList.toggle("lbg-manager__message--error", isError);
    input?.setAttribute("aria-invalid", String(isError));
  };
  const runMutation = (mutation, successMessage, input) => {
    clearMessage();
    input?.setAttribute("aria-invalid", "false");
    try {
      mutation();
      showMessage(successMessage, false);
      return true;
    } catch (error) {
      focusAfterRender = void 0;
      const detail = error instanceof Error ? error.message : "未知错误";
      showMessage(`操作没有保存：${detail}`, true, input);
      return false;
    }
  };
  const render = () => {
    const settings = store.getSnapshot();
    const groupIds = new Set(settings.groups.map((group) => group.id));
    for (const groupId of expandedGroupIds) {
      if (!groupIds.has(groupId)) {
        expandedGroupIds.delete(groupId);
      }
    }
    for (const groupId of renameDrafts.keys()) {
      if (!groupIds.has(groupId)) {
        renameDrafts.delete(groupId);
      }
    }
    if (deleteConfirmationId && !groupIds.has(deleteConfirmationId)) {
      deleteConfirmationId = void 0;
    }
    const issue = store.getIssue();
    const readOnly = Boolean(issue);
    createInput.disabled = readOnly;
    createButton.disabled = readOnly;
    groupList.replaceChildren();
    let focusNode = focusAfterRender?.kind === "create" ? createInput : void 0;
    if (settings.groups.length === 0) {
      const emptyItem = element$1("li", "lbg-group-list__empty");
      emptyItem.textContent = "还没有自定义分组。新建一个开始整理。";
      groupList.append(emptyItem);
    }
    settings.groups.forEach((group, index) => {
      const item = element$1("li", "lbg-group-item");
      item.dataset.groupId = group.id;
      const isExpanded = expandedGroupIds.has(group.id);
      const toggle = element$1("button", "lbg-group-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(isExpanded));
      toggle.setAttribute("aria-controls", `${EXTENSION_ID}-group-body-${String(index)}`);
      toggle.setAttribute("aria-label", `${isExpanded ? "折叠" : "展开"}分组 ${group.name}`);
      toggle.title = "可以把世界书拖到这个分组";
      const groupName = element$1("span", "lbg-group-toggle__name");
      groupName.textContent = group.name;
      const groupCount = element$1("span", "lbg-group-toggle__count");
      groupCount.textContent = `${String(group.bookNames.length)} 本`;
      const toggleIcon = element$1(
        "span",
        `lbg-group-toggle__icon fa-solid ${isExpanded ? "fa-chevron-up" : "fa-chevron-down"}`
      );
      toggleIcon.setAttribute("aria-hidden", "true");
      toggle.append(groupName, groupCount, toggleIcon);
      const body = element$1("div", "lbg-group-body");
      body.id = `${EXTENSION_ID}-group-body-${String(index)}`;
      body.hidden = !isExpanded;
      toggle.addEventListener("click", () => {
        const nextExpanded = !expandedGroupIds.has(group.id);
        if (nextExpanded) {
          expandedGroupIds.add(group.id);
        } else {
          expandedGroupIds.delete(group.id);
        }
        toggle.setAttribute("aria-expanded", String(nextExpanded));
        toggle.setAttribute("aria-label", `${nextExpanded ? "折叠" : "展开"}分组 ${group.name}`);
        toggleIcon.classList.toggle("fa-chevron-up", nextExpanded);
        toggleIcon.classList.toggle("fa-chevron-down", !nextExpanded);
        body.hidden = !nextExpanded;
      });
      const renameForm = element$1("form", "lbg-group-editor");
      const renameLabel = element$1("label", "lbg-field lbg-field--grow");
      const renameLabelText = element$1("span", "lbg-field__label");
      renameLabelText.textContent = "分组名称";
      const renameInput = element$1("input", "lbg-field__input");
      renameInput.type = "text";
      renameInput.maxLength = 100;
      renameInput.autocomplete = "off";
      renameInput.value = renameDrafts.get(group.id) ?? group.name;
      renameInput.disabled = readOnly;
      renameInput.setAttribute("aria-describedby", message.id);
      renameInput.addEventListener("input", () => {
        renameDrafts.set(group.id, renameInput.value);
        renameInput.setAttribute("aria-invalid", "false");
      });
      renameInput.addEventListener("keydown", submitFormOnEnter);
      renameLabel.append(renameLabelText, renameInput);
      const saveName = element$1("button", "lbg-action");
      saveName.type = "submit";
      saveName.textContent = "保存名称";
      saveName.disabled = readOnly;
      renameForm.append(renameLabel, saveName);
      renameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        focusAfterRender = { kind: "rename", groupId: group.id };
        if (runMutation(
          () => {
            store.rename(group.id, renameInput.value);
          },
          `已将分组改名为“${renameInput.value.trim()}”。`,
          renameInput
        )) {
          renameDrafts.delete(group.id);
        }
      });
      const actions = element$1("div", "lbg-group-actions");
      const moveUp = element$1("button", "lbg-action");
      moveUp.type = "button";
      moveUp.textContent = "上移";
      moveUp.disabled = readOnly || index === 0;
      moveUp.setAttribute("aria-label", `将${group.name}上移`);
      moveUp.addEventListener("click", () => {
        focusAfterRender = { kind: "toggle", groupId: group.id };
        runMutation(() => {
          store.move(group.id, index - 1);
        }, `已上移“${group.name}”。`);
      });
      const moveDown = element$1("button", "lbg-action");
      moveDown.type = "button";
      moveDown.textContent = "下移";
      moveDown.disabled = readOnly || index === settings.groups.length - 1;
      moveDown.setAttribute("aria-label", `将${group.name}下移`);
      moveDown.addEventListener("click", () => {
        focusAfterRender = { kind: "toggle", groupId: group.id };
        runMutation(() => {
          store.move(group.id, index + 1);
        }, `已下移“${group.name}”。`);
      });
      const requestDelete = element$1("button", "lbg-action lbg-action--danger");
      requestDelete.type = "button";
      requestDelete.textContent = "删除分组";
      requestDelete.disabled = readOnly;
      requestDelete.setAttribute("aria-label", `删除分组 ${group.name}`);
      requestDelete.addEventListener("click", () => {
        deleteConfirmationId = group.id;
        expandedGroupIds.add(group.id);
        focusAfterRender = { kind: "confirm-delete", groupId: group.id };
        render();
      });
      actions.append(moveUp, moveDown, requestDelete);
      body.append(renameForm, actions);
      if (deleteConfirmationId === group.id) {
        const confirmation = element$1("div", "lbg-delete-confirmation");
        confirmation.setAttribute("role", "group");
        confirmation.setAttribute("aria-label", `确认删除分组 ${group.name}`);
        const confirmationText = element$1("p");
        confirmationText.textContent = `确定删除“${group.name}”吗？只会删除分组，不会删除世界书。`;
        const confirmationActions = element$1("div", "lbg-delete-confirmation__actions");
        const confirmDelete = element$1("button", "lbg-action lbg-action--danger");
        confirmDelete.type = "button";
        confirmDelete.textContent = "确认删除";
        confirmDelete.addEventListener("click", () => {
          const previousConfirmationId = deleteConfirmationId;
          deleteConfirmationId = void 0;
          focusAfterRender = { kind: "create" };
          if (!runMutation(() => {
            store.delete(group.id);
          }, `已删除分组“${group.name}”。`)) {
            deleteConfirmationId = previousConfirmationId;
          }
        });
        const cancelDelete = element$1("button", "lbg-action");
        cancelDelete.type = "button";
        cancelDelete.textContent = "取消";
        cancelDelete.addEventListener("click", () => {
          deleteConfirmationId = void 0;
          focusAfterRender = { kind: "delete", groupId: group.id };
          render();
        });
        confirmationActions.append(confirmDelete, cancelDelete);
        confirmation.append(confirmationText, confirmationActions);
        body.append(confirmation);
        if (focusAfterRender?.kind === "confirm-delete" && focusAfterRender.groupId === group.id) {
          focusNode = confirmDelete;
        }
      }
      const currentFocusTarget = focusAfterRender;
      if (currentFocusTarget && currentFocusTarget.kind !== "create" && currentFocusTarget.groupId === group.id) {
        switch (currentFocusTarget.kind) {
          case "rename":
            focusNode = renameInput;
            break;
          case "toggle":
            focusNode = toggle;
            break;
          case "delete":
            focusNode = requestDelete;
            break;
        }
      }
      item.append(toggle, body);
      groupList.append(item);
    });
    focusAfterRender = void 0;
    if (focusNode) {
      queueMicrotask(() => {
        if (!disposed && focusNode?.isConnected) {
          focusNode.focus();
        }
      });
    }
  };
  createInput.addEventListener("input", () => {
    createInput.setAttribute("aria-invalid", "false");
  });
  createInput.addEventListener("keydown", submitFormOnEnter);
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const groupId = createUniqueGroupId(store.getSnapshot());
    expandedGroupIds.add(groupId);
    focusAfterRender = { kind: "rename", groupId };
    if (runMutation(
      () => {
        store.create({ id: groupId, name: createInput.value });
      },
      `已创建分组“${createInput.value.trim()}”。`,
      createInput
    )) {
      createInput.value = "";
    } else {
      expandedGroupIds.delete(groupId);
    }
  });
  render();
  const unsubscribe = store.subscribe(render);
  return {
    element: root,
    dispose() {
      disposed = true;
      unsubscribe();
    }
  };
}
const NATIVE_ROOT_ID = "sillytavern-lorebook-groups-native";
function make(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function isEnglish() {
  return (document.documentElement.lang || "").toLowerCase().startsWith("en");
}
function text(language, chinese, english) {
  return language ? english : chinese;
}
function renderGroup(group, catalog, activeNames, english, host) {
  const details = make("details", "lbg-native-group");
  details.open = true;
  const summary = make("summary", "lbg-native-group__summary");
  const title = make("span", "lbg-native-group__name");
  title.textContent = group.name;
  const count = make("span", "lbg-native-group__count");
  const books = group.bookNames.map((name) => catalog.find((item) => item.name === name)).filter((item) => Boolean(item));
  count.textContent = text(english, `${String(books.length)} 本`, `${String(books.length)} books`);
  summary.append(title, count);
  details.append(summary);
  const list = make("ul", "lbg-native-group__list");
  if (books.length === 0) {
    const empty = make("li", "lbg-native-group__empty");
    empty.textContent = text(english, "此分组暂无世界书。", "No worldbooks in this group.");
    list.append(empty);
  }
  for (const book of books) {
    const row = make("li", "lbg-native-book");
    const toggleLabel = make("label", "lbg-native-book__toggle");
    const toggle = make("input");
    toggle.type = "checkbox";
    toggle.checked = activeNames.has(book.name);
    toggle.setAttribute(
      "aria-label",
      text(english, `启用世界书 ${book.name}`, `Enable worldbook ${book.name}`)
    );
    toggle.addEventListener("change", () => {
      const operation = host.setWorldInfoActive?.(book.name, toggle.checked);
      void operation?.catch((error) => {
        toggle.checked = !toggle.checked;
        row.title = error instanceof Error ? error.message : text(english, "操作失败。", "Operation failed.");
      });
    });
    toggleLabel.append(toggle);
    const name = make("span", "lbg-native-book__name");
    name.textContent = book.name;
    const edit = make("button", "lbg-native-book__edit");
    edit.type = "button";
    edit.textContent = text(english, "编辑原件", "Edit original");
    edit.setAttribute(
      "aria-label",
      text(english, `编辑世界书 ${book.name}`, `Edit worldbook ${book.name}`)
    );
    edit.addEventListener("click", () => {
      const operation = host.openWorldInfoEditor?.(book.name);
      void operation?.catch((error) => {
        row.title = error instanceof Error ? error.message : text(english, "打开失败。", "Unable to open.");
      });
    });
    row.append(toggleLabel, name, edit);
    list.append(row);
  }
  details.append(list);
  return details;
}
function mountNativeWorldbookEnhancement(host) {
  const initialContainer = document.querySelector("#WIMultiSelector");
  if (!initialContainer) return void 0;
  let nativeContainer = initialContainer;
  const observeRoot = document.querySelector("#wi-holder") ?? document.body;
  document.getElementById(NATIVE_ROOT_ID)?.remove();
  const root = make("section", "lbg-native");
  root.id = NATIVE_ROOT_ID;
  root.setAttribute("aria-labelledby", `${NATIVE_ROOT_ID}-title`);
  const heading = make("h4", "lbg-native__title");
  heading.id = `${NATIVE_ROOT_ID}-title`;
  heading.textContent = text(isEnglish(), "按分组浏览", "Browse by group");
  const message = make("p", "lbg-native__message");
  message.setAttribute("role", "status");
  const groups = make("div", "lbg-native__groups");
  root.append(heading, message, groups);
  const markContainer = (container) => {
    container.classList.add("lbg-native-host");
    container.append(root);
  };
  markContainer(nativeContainer);
  let disposed = false;
  let sequence = 0;
  let refreshQueued = false;
  const refresh = async () => {
    const currentSequence = ++sequence;
    try {
      const [catalog, rawSettings] = await Promise.all([
        host.readCatalog(),
        Promise.resolve(host.readGroupSettings())
      ]);
      if (disposed || currentSequence !== sequence) return;
      const loaded = loadGroupSettings(rawSettings);
      const english = isEnglish();
      heading.textContent = text(english, "按分组浏览", "Browse by group");
      const activeNames = new Set(
        catalog.filter((item) => item.statuses.includes("global")).map((item) => item.name)
      );
      groups.replaceChildren();
      for (const group of loaded.settings.groups) {
        groups.append(renderGroup(group, catalog, activeNames, english, host));
      }
      message.textContent = loaded.issue ?? "";
    } catch (error) {
      if (disposed || currentSequence !== sequence) return;
      message.textContent = error instanceof Error ? error.message : text(isEnglish(), "无法读取分组。", "Unable to read groups.");
    }
  };
  const onChanged = () => void refresh();
  const queueRefresh = () => {
    if (refreshQueued || disposed) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) void refresh();
    });
  };
  const unsubscribe = host.subscribe(queueRefresh);
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === "childList" || mutation.type === "attributes"))
      return;
    if (mutations.some((mutation) => mutation.type === "attributes")) queueRefresh();
    const currentContainer = document.querySelector("#WIMultiSelector");
    if (currentContainer && currentContainer !== nativeContainer) {
      nativeContainer.classList.remove("lbg-native-host");
      nativeContainer = currentContainer;
      markContainer(nativeContainer);
      queueRefresh();
      return;
    }
    if (currentContainer === nativeContainer && !nativeContainer.contains(root)) {
      markContainer(nativeContainer);
      queueRefresh();
    }
  });
  observer.observe(observeRoot, { childList: true, subtree: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  window.addEventListener(GROUP_SETTINGS_CHANGED_EVENT, onChanged);
  void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      sequence += 1;
      window.removeEventListener(GROUP_SETTINGS_CHANGED_EVENT, onChanged);
      unsubscribe();
      observer.disconnect();
      nativeContainer.classList.remove("lbg-native-host");
      root.remove();
    }
  };
}
const PANEL_ID = `${EXTENSION_ID}-panel`;
const VISIBLE_REFRESH_INTERVAL_MS = 2e3;
const LOREBOOK_DRAG_TYPE = "application/x-sillytavern-lorebook-name";
const STATUS_LABELS = Object.freeze({
  global: "全局启用",
  character: "角色绑定",
  chat: "聊天绑定"
});
function element(tagName, className) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}
function renderCatalog(list, catalog, options) {
  list.replaceChildren();
  for (const item of catalog) {
    const row = element("li", "lbg-book");
    const rowControls = element("span", "lbg-book__controls");
    const selectionLabel = element("label", "lbg-book__selection");
    const selection = element("input");
    selection.type = "checkbox";
    selection.checked = options.selectedBookNames.has(item.name);
    selection.setAttribute("aria-label", `选择世界书 ${item.name}`);
    selection.addEventListener("change", () => {
      options.onSelectionChange(item.name, selection.checked);
    });
    selectionLabel.append(selection);
    const dragHandle = element("span", "lbg-book__drag fa-solid fa-grip-vertical");
    dragHandle.draggable = !options.groupSettingsIssue;
    dragHandle.title = `拖动“${item.name}”到上方分组`;
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.classList.toggle("lbg-book__drag--disabled", Boolean(options.groupSettingsIssue));
    dragHandle.addEventListener("dragstart", (event) => {
      options.onDragStart(event, item.name, row);
    });
    dragHandle.addEventListener("dragend", () => {
      options.onDragEnd(row);
    });
    rowControls.append(selectionLabel, dragHandle);
    row.append(rowControls);
    const name = element("span", "lbg-book__name");
    name.textContent = item.name;
    row.append(name);
    const statuses = element("span", "lbg-book__statuses");
    const labels = item.statuses.length > 0 ? item.statuses.map((status) => STATUS_LABELS[status]) : ["无绑定"];
    for (const label of labels) {
      const badge = element("span", "lbg-status");
      badge.textContent = label;
      statuses.append(badge);
    }
    row.append(statuses);
    const assignedGroups = options.groupSettings.groups.filter(
      (group) => group.bookNames.includes(item.name)
    );
    if (assignedGroups.length === 0) {
      const ungrouped = element("span", "lbg-status lbg-status--ungrouped");
      ungrouped.textContent = "未分组";
      statuses.append(ungrouped);
    }
    const assignments = element("fieldset", "lbg-book__groups");
    const legend = element("legend", "lbg-visually-hidden");
    legend.textContent = `${item.name}的自定义分组`;
    assignments.append(legend);
    for (const group of options.groupSettings.groups) {
      const label = element("label", "lbg-group-choice");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = group.bookNames.includes(item.name);
      checkbox.disabled = Boolean(options.groupSettingsIssue);
      checkbox.setAttribute("aria-label", `将${item.name}加入${group.name}`);
      checkbox.addEventListener("change", () => {
        options.onMembershipChange(group.id, item.name, checkbox.checked);
      });
      const groupName = element("span");
      groupName.textContent = group.name;
      label.append(checkbox, groupName);
      assignments.append(label);
    }
    row.append(assignments);
    list.append(row);
  }
}
async function mountLorebookPanel(host) {
  document.getElementById(PANEL_ID)?.remove();
  const groupStore = createLorebookGroupStore({
    read: () => host.readGroupSettings(),
    write: (settings) => {
      host.writeGroupSettings(settings);
    }
  });
  const nativeEnhancement = mountNativeWorldbookEnhancement(host);
  const container = document.getElementById("extensions_settings");
  if (!container) {
    throw new Error("SillyTavern extension settings container is unavailable.");
  }
  const root = element("section", "lbg-panel inline-drawer");
  root.id = PANEL_ID;
  const toggle = element("div", "lbg-panel__toggle inline-drawer-toggle inline-drawer-header");
  toggle.setAttribute("role", "button");
  toggle.tabIndex = 0;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", `${PANEL_ID}-content`);
  const title = element("b", "lbg-panel__title");
  title.textContent = "世界书分组";
  const icon = element(
    "div",
    "lbg-panel__icon inline-drawer-icon fa-solid fa-circle-chevron-down down"
  );
  icon.setAttribute("aria-hidden", "true");
  toggle.append(title, icon);
  const content = element("div", "lbg-panel__content inline-drawer-content");
  content.id = `${PANEL_ID}-content`;
  content.hidden = true;
  const summary = element("p", "lbg-panel__summary");
  summary.setAttribute("role", "status");
  summary.textContent = "正在读取世界书…";
  const refresh = element("button", "lbg-panel__refresh");
  refresh.type = "button";
  refresh.textContent = "刷新清单";
  const list = element("ul", "lbg-book-list");
  list.setAttribute("aria-label", "世界书清单");
  const warning = element("p", "lbg-panel__warning");
  warning.setAttribute("role", "alert");
  warning.hidden = true;
  const organizer = element("section", "lbg-organizer");
  organizer.setAttribute("aria-labelledby", `${EXTENSION_ID}-organizer-heading`);
  const organizerHeading = element("h3", "lbg-organizer__heading");
  organizerHeading.id = `${EXTENSION_ID}-organizer-heading`;
  organizerHeading.textContent = "整理世界书";
  const searchLabel = element("label", "lbg-field");
  const searchLabelText = element("span", "lbg-field__label");
  searchLabelText.textContent = "搜索世界书";
  const searchInput = element("input", "lbg-field__input lbg-organizer__search");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "输入名称筛选";
  searchLabel.append(searchLabelText, searchInput);
  const batchControls = element("div", "lbg-batch-controls");
  const selectVisibleLabel = element("label", "lbg-select-visible");
  const selectVisible = element("input");
  selectVisible.type = "checkbox";
  const selectVisibleText = element("span");
  selectVisibleText.textContent = "全选当前结果";
  selectVisibleLabel.append(selectVisible, selectVisibleText);
  const selectionSummary = element("span", "lbg-selection-summary");
  selectionSummary.setAttribute("role", "status");
  selectionSummary.setAttribute("aria-live", "polite");
  const targetLabel = element("label", "lbg-field lbg-field--grow");
  const targetLabelText = element("span", "lbg-field__label");
  targetLabelText.textContent = "目标分组";
  const targetSelect = element("select", "lbg-field__input lbg-batch-target");
  targetLabel.append(targetLabelText, targetSelect);
  const batchActions = element("div", "lbg-batch-actions");
  const batchAdd = element("button", "lbg-action lbg-action--primary");
  batchAdd.type = "button";
  batchAdd.textContent = "批量加入";
  const batchRemove = element("button", "lbg-action");
  batchRemove.type = "button";
  batchRemove.textContent = "批量移出";
  batchActions.append(batchAdd, batchRemove);
  const organizerMessage = element("p", "lbg-organizer__message");
  organizerMessage.setAttribute("role", "status");
  organizerMessage.setAttribute("aria-live", "polite");
  batchControls.append(selectVisibleLabel, selectionSummary, targetLabel, batchActions);
  organizer.append(organizerHeading, searchLabel, batchControls, organizerMessage);
  const assignmentHint = element("p", "lbg-panel__hint");
  assignmentHint.textContent = "可勾选或批量整理，也可把书名旁的手柄拖到上方分组；这些操作不会修改世界书原件。";
  const groupManager = createGroupManager(groupStore);
  content.append(summary, warning, groupManager.element, organizer, assignmentHint, refresh, list);
  root.append(toggle, content);
  container.append(root);
  let disposed = false;
  let refreshSequence = 0;
  let currentCatalog = [];
  const selectedBookNames = /* @__PURE__ */ new Set();
  let selectedTargetGroupId;
  let draggedBookName;
  const showWarning = (message) => {
    warning.hidden = !message;
    warning.textContent = message ?? "";
  };
  const showOrganizerMessage = (text2, isError) => {
    organizerMessage.textContent = text2;
    organizerMessage.classList.toggle("lbg-organizer__message--error", isError);
  };
  const getVisibleCatalog = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    return query.length === 0 ? currentCatalog : currentCatalog.filter((item) => item.name.toLocaleLowerCase().includes(query));
  };
  const clearDropTargets = () => {
    for (const target of groupManager.element.querySelectorAll(".lbg-group-item--drop-target")) {
      target.classList.remove("lbg-group-item--drop-target");
    }
  };
  const updateOrganizerControls = (visibleCatalog, settings, issue) => {
    const currentBookNames = new Set(currentCatalog.map((item) => item.name));
    for (const bookName of selectedBookNames) {
      if (!currentBookNames.has(bookName)) {
        selectedBookNames.delete(bookName);
      }
    }
    const visibleBookNames = visibleCatalog.map((item) => item.name);
    const selectedVisibleCount = visibleBookNames.filter(
      (name) => selectedBookNames.has(name)
    ).length;
    selectVisible.checked = visibleBookNames.length > 0 && selectedVisibleCount === visibleBookNames.length;
    selectVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleBookNames.length;
    selectVisible.disabled = visibleBookNames.length === 0;
    selectionSummary.textContent = `已选 ${String(selectedBookNames.size)} 本，当前结果 ${String(visibleBookNames.length)} 本`;
    if (!settings.groups.some((group) => group.id === selectedTargetGroupId)) {
      selectedTargetGroupId = settings.groups[0]?.id;
    }
    targetSelect.replaceChildren();
    for (const group of settings.groups) {
      const option = element("option");
      option.value = group.id;
      option.textContent = group.name;
      targetSelect.append(option);
    }
    if (selectedTargetGroupId) {
      targetSelect.value = selectedTargetGroupId;
    }
    const cannotMutate = Boolean(issue) || !selectedTargetGroupId || selectedVisibleCount === 0;
    targetSelect.disabled = Boolean(issue) || settings.groups.length === 0;
    batchAdd.disabled = cannotMutate;
    batchRemove.disabled = cannotMutate;
  };
  const renderCurrentCatalog = () => {
    const issue = groupStore.getIssue();
    const settings = groupStore.getSnapshot();
    const visibleCatalog = getVisibleCatalog();
    showWarning(issue);
    renderCatalog(list, visibleCatalog, {
      groupSettings: settings,
      groupSettingsIssue: issue,
      selectedBookNames,
      onMembershipChange: (groupId, bookName, assigned) => {
        try {
          groupStore.setMembership(groupId, bookName, assigned);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "未知错误";
          renderCurrentCatalog();
          showWarning(`无法保存分组，未应用此次更改：${detail}`);
        }
      },
      onSelectionChange: (bookName, selected) => {
        if (selected) {
          selectedBookNames.add(bookName);
        } else {
          selectedBookNames.delete(bookName);
        }
        updateOrganizerControls(visibleCatalog, settings, issue);
      },
      onDragStart: (event, bookName, row) => {
        if (issue) {
          event.preventDefault();
          return;
        }
        draggedBookName = bookName;
        row.classList.add("lbg-book--dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(LOREBOOK_DRAG_TYPE, bookName);
        }
      },
      onDragEnd: (row) => {
        row.classList.remove("lbg-book--dragging");
        draggedBookName = void 0;
        clearDropTargets();
      }
    });
    if (currentCatalog.length > 0 && visibleCatalog.length === 0) {
      const emptyItem = element("li", "lbg-book-list__empty");
      emptyItem.textContent = "没有匹配的世界书。";
      list.append(emptyItem);
    }
    updateOrganizerControls(visibleCatalog, settings, issue);
    summary.textContent = currentCatalog.length === 0 ? "还没有世界书。" : visibleCatalog.length === currentCatalog.length ? `共 ${String(currentCatalog.length)} 本世界书` : `共 ${String(currentCatalog.length)} 本，当前显示 ${String(visibleCatalog.length)} 本`;
  };
  const unsubscribeGroupStore = groupStore.subscribe(renderCurrentCatalog);
  const refreshCatalog = async () => {
    const sequence = ++refreshSequence;
    refresh.disabled = true;
    summary.textContent = "正在读取世界书…";
    try {
      const catalog = await host.readCatalog();
      if (disposed || sequence !== refreshSequence) {
        return;
      }
      currentCatalog = catalog;
      renderCurrentCatalog();
    } catch (error) {
      if (disposed || sequence !== refreshSequence) {
        return;
      }
      console.error("[Lorebook Groups] Failed to read lorebook catalog.", error);
      currentCatalog = [];
      selectedBookNames.clear();
      list.replaceChildren();
      updateOrganizerControls([], groupStore.getSnapshot(), groupStore.getIssue());
      summary.textContent = "无法读取世界书清单，请刷新后重试。";
    } finally {
      if (!disposed && sequence === refreshSequence) {
        refresh.disabled = false;
      }
    }
  };
  const runBatchMembershipChange = (assigned) => {
    const visibleSelectedBookNames = getVisibleCatalog().map((item) => item.name).filter((name) => selectedBookNames.has(name));
    const settings = groupStore.getSnapshot();
    const targetGroup = settings.groups.find((group) => group.id === selectedTargetGroupId);
    if (!targetGroup || visibleSelectedBookNames.length === 0) {
      showOrganizerMessage("请先选择当前结果中的世界书和目标分组。", true);
      return;
    }
    try {
      groupStore.setMemberships(targetGroup.id, visibleSelectedBookNames, assigned);
      showOrganizerMessage(
        `已将 ${String(visibleSelectedBookNames.length)} 本世界书${assigned ? "加入" : "移出"}“${targetGroup.name}”。`,
        false
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      renderCurrentCatalog();
      showOrganizerMessage(`批量操作没有保存：${detail}`, true);
    }
  };
  const searchCatalog = () => {
    renderCurrentCatalog();
  };
  const toggleVisibleSelection = () => {
    for (const item of getVisibleCatalog()) {
      if (selectVisible.checked) {
        selectedBookNames.add(item.name);
      } else {
        selectedBookNames.delete(item.name);
      }
    }
    renderCurrentCatalog();
  };
  const changeBatchTarget = () => {
    selectedTargetGroupId = targetSelect.value || void 0;
  };
  const findGroupDropTarget = (eventTarget) => {
    if (!(eventTarget instanceof Element)) {
      return void 0;
    }
    const target = eventTarget.closest(".lbg-group-item[data-group-id]");
    return target && groupManager.element.contains(target) ? target : void 0;
  };
  const dragOverGroup = (event) => {
    const target = findGroupDropTarget(event.target);
    if (!target || !draggedBookName || groupStore.getIssue()) {
      return;
    }
    event.preventDefault();
    clearDropTargets();
    target.classList.add("lbg-group-item--drop-target");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const leaveGroupDropArea = (event) => {
    if (event.relatedTarget instanceof Node && groupManager.element.contains(event.relatedTarget)) {
      return;
    }
    clearDropTargets();
  };
  const dropIntoGroup = (event) => {
    const target = findGroupDropTarget(event.target);
    const bookName = draggedBookName;
    const groupId = target?.dataset.groupId;
    const settings = groupStore.getSnapshot();
    const group = settings.groups.find((item) => item.id === groupId);
    if (!target || !bookName || !group || groupStore.getIssue() || !currentCatalog.some((item) => item.name === bookName)) {
      clearDropTargets();
      draggedBookName = void 0;
      return;
    }
    event.preventDefault();
    clearDropTargets();
    try {
      groupStore.setMemberships(group.id, [bookName], true);
      showOrganizerMessage(`已将“${bookName}”加入“${group.name}”，原有分组保持不变。`, false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      renderCurrentCatalog();
      showOrganizerMessage(`拖动操作没有保存：${detail}`, true);
    } finally {
      draggedBookName = void 0;
    }
  };
  let refreshTimer;
  const stopVisibleRefresh = () => {
    if (refreshTimer !== void 0) {
      clearInterval(refreshTimer);
      refreshTimer = void 0;
    }
  };
  const startVisibleRefresh = () => {
    stopVisibleRefresh();
    queueRefresh();
    refreshTimer = setInterval(queueRefresh, VISIBLE_REFRESH_INTERVAL_MS);
  };
  const togglePanel = (event) => {
    event.stopPropagation();
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    content.hidden = expanded;
    icon.classList.toggle("down", expanded);
    icon.classList.toggle("up", !expanded);
    icon.classList.toggle("fa-circle-chevron-down", expanded);
    icon.classList.toggle("fa-circle-chevron-up", !expanded);
    if (expanded) {
      stopVisibleRefresh();
    } else {
      startVisibleRefresh();
    }
  };
  const togglePanelFromKeyboard = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggle.click();
  };
  let refreshQueued = false;
  const queueRefresh = () => {
    if (refreshQueued || disposed) {
      return;
    }
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) {
        void refreshCatalog();
      }
    });
  };
  const refreshFromButton = () => {
    void refreshCatalog();
  };
  const addSelectedToGroup = () => {
    runBatchMembershipChange(true);
  };
  const removeSelectedFromGroup = () => {
    runBatchMembershipChange(false);
  };
  toggle.addEventListener("click", togglePanel);
  toggle.addEventListener("keydown", togglePanelFromKeyboard);
  refresh.addEventListener("click", refreshFromButton);
  searchInput.addEventListener("input", searchCatalog);
  selectVisible.addEventListener("change", toggleVisibleSelection);
  targetSelect.addEventListener("change", changeBatchTarget);
  batchAdd.addEventListener("click", addSelectedToGroup);
  batchRemove.addEventListener("click", removeSelectedFromGroup);
  groupManager.element.addEventListener("dragover", dragOverGroup);
  groupManager.element.addEventListener("dragleave", leaveGroupDropArea);
  groupManager.element.addEventListener("drop", dropIntoGroup);
  const unsubscribe = host.subscribe(queueRefresh);
  await refreshCatalog();
  return () => {
    disposed = true;
    refreshSequence += 1;
    stopVisibleRefresh();
    groupManager.dispose();
    nativeEnhancement?.dispose();
    unsubscribeGroupStore();
    unsubscribe();
    toggle.removeEventListener("click", togglePanel);
    toggle.removeEventListener("keydown", togglePanelFromKeyboard);
    refresh.removeEventListener("click", refreshFromButton);
    searchInput.removeEventListener("input", searchCatalog);
    selectVisible.removeEventListener("change", toggleVisibleSelection);
    targetSelect.removeEventListener("change", changeBatchTarget);
    batchAdd.removeEventListener("click", addSelectedToGroup);
    batchRemove.removeEventListener("click", removeSelectedFromGroup);
    groupManager.element.removeEventListener("dragover", dragOverGroup);
    groupManager.element.removeEventListener("dragleave", leaveGroupDropArea);
    groupManager.element.removeEventListener("drop", dropIntoGroup);
    root.remove();
  };
}
const RUNTIME_STATUS_KEY = Symbol.for(`${EXTENSION_ID}.runtimeStatus`);
let cleanupRuntime;
function runtimeGlobal() {
  return globalThis;
}
function getRuntimeStatus() {
  return runtimeGlobal()[RUNTIME_STATUS_KEY];
}
async function onActivate() {
  cleanupRuntime?.();
  cleanupRuntime = void 0;
  runtimeGlobal()[RUNTIME_STATUS_KEY] = Object.freeze({
    extensionId: EXTENSION_ID,
    version: EXTENSION_VERSION,
    active: true
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
function onDisable() {
  cleanupRuntime?.();
  cleanupRuntime = void 0;
  Reflect.deleteProperty(runtimeGlobal(), RUNTIME_STATUS_KEY);
  console.info(`[${getExtensionIdentity()}] disabled`);
}
export {
  getRuntimeStatus,
  onActivate,
  onDisable
};
//# sourceMappingURL=index.js.map
