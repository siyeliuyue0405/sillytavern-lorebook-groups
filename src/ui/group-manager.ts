import type { LorebookGroupStore } from '../core/group-store';
import type { LorebookGroupSettings } from '../core/group-settings';
import { EXTENSION_ID } from '../identity';

export interface GroupManagerController {
  readonly element: HTMLElement;
  dispose(): void;
}

type FocusTarget =
  | { readonly kind: 'create' }
  | { readonly kind: 'rename' | 'toggle' | 'confirm-delete' | 'delete'; readonly groupId: string };

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}

function createUniqueGroupId(settings: LorebookGroupSettings): string {
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

function submitFormOnEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) {
    return;
  }

  event.preventDefault();
  const input = event.currentTarget as HTMLInputElement;
  input.form?.requestSubmit();
}

export function createGroupManager(store: LorebookGroupStore): GroupManagerController {
  const root = element('section', 'lbg-manager');
  root.setAttribute('aria-labelledby', `${EXTENSION_ID}-manager-heading`);

  const heading = element('h3', 'lbg-manager__heading');
  heading.id = `${EXTENSION_ID}-manager-heading`;
  heading.textContent = '管理分组';

  const description = element('p', 'lbg-manager__description');
  description.textContent = '新建、改名、排序或删除分组。删除分组不会删除其中的世界书。';

  const createForm = element('form', 'lbg-create-form');
  const createLabel = element('label', 'lbg-field');
  const createLabelText = element('span', 'lbg-field__label');
  createLabelText.textContent = '新分组名称';
  const createInput = element('input', 'lbg-field__input');
  createInput.type = 'text';
  createInput.maxLength = 100;
  createInput.autocomplete = 'off';
  createInput.setAttribute('aria-describedby', `${EXTENSION_ID}-manager-message`);
  createLabel.append(createLabelText, createInput);

  const createButton = element('button', 'lbg-action lbg-action--primary');
  createButton.type = 'submit';
  createButton.textContent = '新建分组';
  createForm.append(createLabel, createButton);

  const message = element('p', 'lbg-manager__message');
  message.id = `${EXTENSION_ID}-manager-message`;
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');

  const groupList = element('ul', 'lbg-group-list');
  groupList.setAttribute('aria-label', '自定义分组');
  root.append(heading, description, createForm, message, groupList);

  const expandedGroupIds = new Set<string>();
  const renameDrafts = new Map<string, string>();
  let deleteConfirmationId: string | undefined;
  let focusAfterRender: FocusTarget | undefined;
  let disposed = false;

  const clearMessage = (): void => {
    message.textContent = '';
    message.classList.remove('lbg-manager__message--error');
  };

  const showMessage = (text: string, isError: boolean, input?: HTMLInputElement): void => {
    message.textContent = text;
    message.classList.toggle('lbg-manager__message--error', isError);
    input?.setAttribute('aria-invalid', String(isError));
  };

  const runMutation = (
    mutation: () => void,
    successMessage: string,
    input?: HTMLInputElement,
  ): boolean => {
    clearMessage();
    input?.setAttribute('aria-invalid', 'false');
    try {
      mutation();
      showMessage(successMessage, false);
      return true;
    } catch (error) {
      focusAfterRender = undefined;
      const detail = error instanceof Error ? error.message : '未知错误';
      showMessage(`操作没有保存：${detail}`, true, input);
      return false;
    }
  };

  const render = (): void => {
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
      deleteConfirmationId = undefined;
    }

    const issue = store.getIssue();
    const readOnly = Boolean(issue);
    createInput.disabled = readOnly;
    createButton.disabled = readOnly;
    groupList.replaceChildren();

    let focusNode: HTMLElement | undefined =
      focusAfterRender?.kind === 'create' ? createInput : undefined;

    if (settings.groups.length === 0) {
      const emptyItem = element('li', 'lbg-group-list__empty');
      emptyItem.textContent = '还没有自定义分组。新建一个开始整理。';
      groupList.append(emptyItem);
    }

    settings.groups.forEach((group, index) => {
      const item = element('li', 'lbg-group-item');
      item.dataset.groupId = group.id;
      const isExpanded = expandedGroupIds.has(group.id);

      const toggle = element('button', 'lbg-group-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(isExpanded));
      toggle.setAttribute('aria-controls', `${EXTENSION_ID}-group-body-${String(index)}`);
      toggle.setAttribute('aria-label', `${isExpanded ? '折叠' : '展开'}分组 ${group.name}`);
      toggle.title = '可以把世界书拖到这个分组';

      const groupName = element('span', 'lbg-group-toggle__name');
      groupName.textContent = group.name;
      const groupCount = element('span', 'lbg-group-toggle__count');
      groupCount.textContent = `${String(group.bookNames.length)} 本`;
      const toggleIcon = element(
        'span',
        `lbg-group-toggle__icon fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`,
      );
      toggleIcon.setAttribute('aria-hidden', 'true');
      toggle.append(groupName, groupCount, toggleIcon);

      const body = element('div', 'lbg-group-body');
      body.id = `${EXTENSION_ID}-group-body-${String(index)}`;
      body.hidden = !isExpanded;

      toggle.addEventListener('click', () => {
        const nextExpanded = !expandedGroupIds.has(group.id);
        if (nextExpanded) {
          expandedGroupIds.add(group.id);
        } else {
          expandedGroupIds.delete(group.id);
        }
        toggle.setAttribute('aria-expanded', String(nextExpanded));
        toggle.setAttribute('aria-label', `${nextExpanded ? '折叠' : '展开'}分组 ${group.name}`);
        toggleIcon.classList.toggle('fa-chevron-up', nextExpanded);
        toggleIcon.classList.toggle('fa-chevron-down', !nextExpanded);
        body.hidden = !nextExpanded;
      });

      const renameForm = element('form', 'lbg-group-editor');
      const renameLabel = element('label', 'lbg-field lbg-field--grow');
      const renameLabelText = element('span', 'lbg-field__label');
      renameLabelText.textContent = '分组名称';
      const renameInput = element('input', 'lbg-field__input');
      renameInput.type = 'text';
      renameInput.maxLength = 100;
      renameInput.autocomplete = 'off';
      renameInput.value = renameDrafts.get(group.id) ?? group.name;
      renameInput.disabled = readOnly;
      renameInput.setAttribute('aria-describedby', message.id);
      renameInput.addEventListener('input', () => {
        renameDrafts.set(group.id, renameInput.value);
        renameInput.setAttribute('aria-invalid', 'false');
      });
      renameInput.addEventListener('keydown', submitFormOnEnter);
      renameLabel.append(renameLabelText, renameInput);

      const saveName = element('button', 'lbg-action');
      saveName.type = 'submit';
      saveName.textContent = '保存名称';
      saveName.disabled = readOnly;
      renameForm.append(renameLabel, saveName);
      renameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        focusAfterRender = { kind: 'rename', groupId: group.id };
        if (
          runMutation(
            () => {
              store.rename(group.id, renameInput.value);
            },
            `已将分组改名为“${renameInput.value.trim()}”。`,
            renameInput,
          )
        ) {
          renameDrafts.delete(group.id);
        }
      });

      const actions = element('div', 'lbg-group-actions');
      const moveUp = element('button', 'lbg-action');
      moveUp.type = 'button';
      moveUp.textContent = '上移';
      moveUp.disabled = readOnly || index === 0;
      moveUp.setAttribute('aria-label', `将${group.name}上移`);
      moveUp.addEventListener('click', () => {
        focusAfterRender = { kind: 'toggle', groupId: group.id };
        runMutation(() => {
          store.move(group.id, index - 1);
        }, `已上移“${group.name}”。`);
      });

      const moveDown = element('button', 'lbg-action');
      moveDown.type = 'button';
      moveDown.textContent = '下移';
      moveDown.disabled = readOnly || index === settings.groups.length - 1;
      moveDown.setAttribute('aria-label', `将${group.name}下移`);
      moveDown.addEventListener('click', () => {
        focusAfterRender = { kind: 'toggle', groupId: group.id };
        runMutation(() => {
          store.move(group.id, index + 1);
        }, `已下移“${group.name}”。`);
      });

      const requestDelete = element('button', 'lbg-action lbg-action--danger');
      requestDelete.type = 'button';
      requestDelete.textContent = '删除分组';
      requestDelete.disabled = readOnly;
      requestDelete.setAttribute('aria-label', `删除分组 ${group.name}`);
      requestDelete.addEventListener('click', () => {
        deleteConfirmationId = group.id;
        expandedGroupIds.add(group.id);
        focusAfterRender = { kind: 'confirm-delete', groupId: group.id };
        render();
      });
      actions.append(moveUp, moveDown, requestDelete);
      body.append(renameForm, actions);

      if (deleteConfirmationId === group.id) {
        const confirmation = element('div', 'lbg-delete-confirmation');
        confirmation.setAttribute('role', 'group');
        confirmation.setAttribute('aria-label', `确认删除分组 ${group.name}`);
        const confirmationText = element('p');
        confirmationText.textContent = `确定删除“${group.name}”吗？只会删除分组，不会删除世界书。`;

        const confirmationActions = element('div', 'lbg-delete-confirmation__actions');
        const confirmDelete = element('button', 'lbg-action lbg-action--danger');
        confirmDelete.type = 'button';
        confirmDelete.textContent = '确认删除';
        confirmDelete.addEventListener('click', () => {
          const previousConfirmationId = deleteConfirmationId;
          deleteConfirmationId = undefined;
          focusAfterRender = { kind: 'create' };
          if (
            !runMutation(() => {
              store.delete(group.id);
            }, `已删除分组“${group.name}”。`)
          ) {
            deleteConfirmationId = previousConfirmationId;
          }
        });

        const cancelDelete = element('button', 'lbg-action');
        cancelDelete.type = 'button';
        cancelDelete.textContent = '取消';
        cancelDelete.addEventListener('click', () => {
          deleteConfirmationId = undefined;
          focusAfterRender = { kind: 'delete', groupId: group.id };
          render();
        });
        confirmationActions.append(confirmDelete, cancelDelete);
        confirmation.append(confirmationText, confirmationActions);
        body.append(confirmation);

        if (focusAfterRender?.kind === 'confirm-delete' && focusAfterRender.groupId === group.id) {
          focusNode = confirmDelete;
        }
      }

      const currentFocusTarget = focusAfterRender;
      if (
        currentFocusTarget &&
        currentFocusTarget.kind !== 'create' &&
        currentFocusTarget.groupId === group.id
      ) {
        switch (currentFocusTarget.kind) {
          case 'rename':
            focusNode = renameInput;
            break;
          case 'toggle':
            focusNode = toggle;
            break;
          case 'delete':
            focusNode = requestDelete;
            break;
        }
      }

      item.append(toggle, body);
      groupList.append(item);
    });

    focusAfterRender = undefined;
    if (focusNode) {
      queueMicrotask(() => {
        if (!disposed && focusNode?.isConnected) {
          focusNode.focus();
        }
      });
    }
  };

  createInput.addEventListener('input', () => {
    createInput.setAttribute('aria-invalid', 'false');
  });
  createInput.addEventListener('keydown', submitFormOnEnter);
  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const groupId = createUniqueGroupId(store.getSnapshot());
    expandedGroupIds.add(groupId);
    focusAfterRender = { kind: 'rename', groupId };
    if (
      runMutation(
        () => {
          store.create({ id: groupId, name: createInput.value });
        },
        `已创建分组“${createInput.value.trim()}”。`,
        createInput,
      )
    ) {
      createInput.value = '';
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
    },
  };
}
