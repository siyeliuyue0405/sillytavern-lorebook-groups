import type { LorebookCatalogItem, LorebookStatus } from '../core/lorebook-catalog';
import { createLorebookGroupStore } from '../core/group-store';
import type { LorebookGroupSettings } from '../core/group-settings';
import type { LorebookHost } from '../host/sillytavern';
import { EXTENSION_ID } from '../identity';
import { createGroupManager } from './group-manager';
import { mountNativeWorldbookEnhancement } from './native-worldbook';

const PANEL_ID = `${EXTENSION_ID}-panel`;
const VISIBLE_REFRESH_INTERVAL_MS = 2_000;
const LOREBOOK_DRAG_TYPE = 'application/x-sillytavern-lorebook-name';

const STATUS_LABELS: Readonly<Record<LorebookStatus, string>> = Object.freeze({
  global: '全局启用',
  character: '角色绑定',
  chat: '聊天绑定',
});

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

interface CatalogRenderOptions {
  readonly groupSettings: LorebookGroupSettings;
  readonly groupSettingsIssue: string | undefined;
  readonly selectedBookNames: ReadonlySet<string>;
  readonly onMembershipChange: (groupId: string, bookName: string, assigned: boolean) => void;
  readonly onSelectionChange: (bookName: string, selected: boolean) => void;
  readonly onDragStart: (event: DragEvent, bookName: string, row: HTMLLIElement) => void;
  readonly onDragEnd: (row: HTMLLIElement) => void;
}

function renderCatalog(
  list: HTMLUListElement,
  catalog: readonly LorebookCatalogItem[],
  options: CatalogRenderOptions,
): void {
  list.replaceChildren();

  for (const item of catalog) {
    const row = element('li', 'lbg-book');

    const rowControls = element('span', 'lbg-book__controls');
    const selectionLabel = element('label', 'lbg-book__selection');
    const selection = element('input');
    selection.type = 'checkbox';
    selection.checked = options.selectedBookNames.has(item.name);
    selection.setAttribute('aria-label', `选择世界书 ${item.name}`);
    selection.addEventListener('change', () => {
      options.onSelectionChange(item.name, selection.checked);
    });
    selectionLabel.append(selection);

    const dragHandle = element('span', 'lbg-book__drag fa-solid fa-grip-vertical');
    dragHandle.draggable = !options.groupSettingsIssue;
    dragHandle.title = `拖动“${item.name}”到上方分组`;
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.classList.toggle('lbg-book__drag--disabled', Boolean(options.groupSettingsIssue));
    dragHandle.addEventListener('dragstart', (event) => {
      options.onDragStart(event, item.name, row);
    });
    dragHandle.addEventListener('dragend', () => {
      options.onDragEnd(row);
    });
    rowControls.append(selectionLabel, dragHandle);
    row.append(rowControls);

    const name = element('span', 'lbg-book__name');
    name.textContent = item.name;
    row.append(name);

    const statuses = element('span', 'lbg-book__statuses');
    const labels =
      item.statuses.length > 0 ? item.statuses.map((status) => STATUS_LABELS[status]) : ['无绑定'];
    for (const label of labels) {
      const badge = element('span', 'lbg-status');
      badge.textContent = label;
      statuses.append(badge);
    }
    row.append(statuses);

    const assignedGroups = options.groupSettings.groups.filter((group) =>
      group.bookNames.includes(item.name),
    );
    if (assignedGroups.length === 0) {
      const ungrouped = element('span', 'lbg-status lbg-status--ungrouped');
      ungrouped.textContent = '未分组';
      statuses.append(ungrouped);
    }

    const assignments = element('fieldset', 'lbg-book__groups');
    const legend = element('legend', 'lbg-visually-hidden');
    legend.textContent = `${item.name}的自定义分组`;
    assignments.append(legend);

    for (const group of options.groupSettings.groups) {
      const label = element('label', 'lbg-group-choice');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = group.bookNames.includes(item.name);
      checkbox.disabled = Boolean(options.groupSettingsIssue);
      checkbox.setAttribute('aria-label', `将${item.name}加入${group.name}`);
      checkbox.addEventListener('change', () => {
        options.onMembershipChange(group.id, item.name, checkbox.checked);
      });

      const groupName = element('span');
      groupName.textContent = group.name;
      label.append(checkbox, groupName);
      assignments.append(label);
    }
    row.append(assignments);
    list.append(row);
  }
}

export async function mountLorebookPanel(host: LorebookHost): Promise<() => void> {
  document.getElementById(PANEL_ID)?.remove();

  const groupStore = createLorebookGroupStore({
    read: () => host.readGroupSettings(),
    write: (settings) => {
      host.writeGroupSettings(settings);
    },
  });
  const nativeEnhancement = mountNativeWorldbookEnhancement(host);

  const container = document.getElementById('extensions_settings');
  if (!container) {
    throw new Error('SillyTavern extension settings container is unavailable.');
  }

  const root = element('section', 'lbg-panel inline-drawer');
  root.id = PANEL_ID;

  const toggle = element('div', 'lbg-panel__toggle inline-drawer-toggle inline-drawer-header');
  toggle.setAttribute('role', 'button');
  toggle.tabIndex = 0;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${PANEL_ID}-content`);

  const title = element('b', 'lbg-panel__title');
  title.textContent = '世界书分组';

  const icon = element(
    'div',
    'lbg-panel__icon inline-drawer-icon fa-solid fa-circle-chevron-down down',
  );
  icon.setAttribute('aria-hidden', 'true');
  toggle.append(title, icon);

  const content = element('div', 'lbg-panel__content inline-drawer-content');
  content.id = `${PANEL_ID}-content`;
  content.hidden = true;

  const summary = element('p', 'lbg-panel__summary');
  summary.setAttribute('role', 'status');
  summary.textContent = '正在读取世界书…';

  const refresh = element('button', 'lbg-panel__refresh');
  refresh.type = 'button';
  refresh.textContent = '刷新清单';

  const list = element('ul', 'lbg-book-list');
  list.setAttribute('aria-label', '世界书清单');

  const warning = element('p', 'lbg-panel__warning');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;

  const organizer = element('section', 'lbg-organizer');
  organizer.setAttribute('aria-labelledby', `${EXTENSION_ID}-organizer-heading`);
  const organizerHeading = element('h3', 'lbg-organizer__heading');
  organizerHeading.id = `${EXTENSION_ID}-organizer-heading`;
  organizerHeading.textContent = '整理世界书';

  const searchLabel = element('label', 'lbg-field');
  const searchLabelText = element('span', 'lbg-field__label');
  searchLabelText.textContent = '搜索世界书';
  const searchInput = element('input', 'lbg-field__input lbg-organizer__search');
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  searchInput.placeholder = '输入名称筛选';
  searchLabel.append(searchLabelText, searchInput);

  const batchControls = element('div', 'lbg-batch-controls');
  const selectVisibleLabel = element('label', 'lbg-select-visible');
  const selectVisible = element('input');
  selectVisible.type = 'checkbox';
  const selectVisibleText = element('span');
  selectVisibleText.textContent = '全选当前结果';
  selectVisibleLabel.append(selectVisible, selectVisibleText);

  const selectionSummary = element('span', 'lbg-selection-summary');
  selectionSummary.setAttribute('role', 'status');
  selectionSummary.setAttribute('aria-live', 'polite');

  const targetLabel = element('label', 'lbg-field lbg-field--grow');
  const targetLabelText = element('span', 'lbg-field__label');
  targetLabelText.textContent = '目标分组';
  const targetSelect = element('select', 'lbg-field__input lbg-batch-target');
  targetLabel.append(targetLabelText, targetSelect);

  const batchActions = element('div', 'lbg-batch-actions');
  const batchAdd = element('button', 'lbg-action lbg-action--primary');
  batchAdd.type = 'button';
  batchAdd.textContent = '批量加入';
  const batchRemove = element('button', 'lbg-action');
  batchRemove.type = 'button';
  batchRemove.textContent = '批量移出';
  batchActions.append(batchAdd, batchRemove);

  const organizerMessage = element('p', 'lbg-organizer__message');
  organizerMessage.setAttribute('role', 'status');
  organizerMessage.setAttribute('aria-live', 'polite');
  batchControls.append(selectVisibleLabel, selectionSummary, targetLabel, batchActions);
  organizer.append(organizerHeading, searchLabel, batchControls, organizerMessage);

  const assignmentHint = element('p', 'lbg-panel__hint');
  assignmentHint.textContent =
    '可勾选或批量整理，也可把书名旁的手柄拖到上方分组；这些操作不会修改世界书原件。';

  const groupManager = createGroupManager(groupStore);

  content.append(summary, warning, groupManager.element, organizer, assignmentHint, refresh, list);
  root.append(toggle, content);
  container.append(root);

  let disposed = false;
  let refreshSequence = 0;
  let currentCatalog: readonly LorebookCatalogItem[] = [];
  const selectedBookNames = new Set<string>();
  let selectedTargetGroupId: string | undefined;
  let draggedBookName: string | undefined;

  const showWarning = (message: string | undefined): void => {
    warning.hidden = !message;
    warning.textContent = message ?? '';
  };

  const showOrganizerMessage = (text: string, isError: boolean): void => {
    organizerMessage.textContent = text;
    organizerMessage.classList.toggle('lbg-organizer__message--error', isError);
  };

  const getVisibleCatalog = (): readonly LorebookCatalogItem[] => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    return query.length === 0
      ? currentCatalog
      : currentCatalog.filter((item) => item.name.toLocaleLowerCase().includes(query));
  };

  const clearDropTargets = (): void => {
    for (const target of groupManager.element.querySelectorAll('.lbg-group-item--drop-target')) {
      target.classList.remove('lbg-group-item--drop-target');
    }
  };

  const updateOrganizerControls = (
    visibleCatalog: readonly LorebookCatalogItem[],
    settings: LorebookGroupSettings,
    issue: string | undefined,
  ): void => {
    const currentBookNames = new Set(currentCatalog.map((item) => item.name));
    for (const bookName of selectedBookNames) {
      if (!currentBookNames.has(bookName)) {
        selectedBookNames.delete(bookName);
      }
    }

    const visibleBookNames = visibleCatalog.map((item) => item.name);
    const selectedVisibleCount = visibleBookNames.filter((name) =>
      selectedBookNames.has(name),
    ).length;
    selectVisible.checked =
      visibleBookNames.length > 0 && selectedVisibleCount === visibleBookNames.length;
    selectVisible.indeterminate =
      selectedVisibleCount > 0 && selectedVisibleCount < visibleBookNames.length;
    selectVisible.disabled = visibleBookNames.length === 0;
    selectionSummary.textContent = `已选 ${String(selectedBookNames.size)} 本，当前结果 ${String(visibleBookNames.length)} 本`;

    if (!settings.groups.some((group) => group.id === selectedTargetGroupId)) {
      selectedTargetGroupId = settings.groups[0]?.id;
    }
    targetSelect.replaceChildren();
    for (const group of settings.groups) {
      const option = element('option');
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

  const renderCurrentCatalog = (): void => {
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
          const detail = error instanceof Error ? error.message : '未知错误';
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
        row.classList.add('lbg-book--dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(LOREBOOK_DRAG_TYPE, bookName);
        }
      },
      onDragEnd: (row) => {
        row.classList.remove('lbg-book--dragging');
        draggedBookName = undefined;
        clearDropTargets();
      },
    });

    if (currentCatalog.length > 0 && visibleCatalog.length === 0) {
      const emptyItem = element('li', 'lbg-book-list__empty');
      emptyItem.textContent = '没有匹配的世界书。';
      list.append(emptyItem);
    }

    updateOrganizerControls(visibleCatalog, settings, issue);
    summary.textContent =
      currentCatalog.length === 0
        ? '还没有世界书。'
        : visibleCatalog.length === currentCatalog.length
          ? `共 ${String(currentCatalog.length)} 本世界书`
          : `共 ${String(currentCatalog.length)} 本，当前显示 ${String(visibleCatalog.length)} 本`;
  };

  const unsubscribeGroupStore = groupStore.subscribe(renderCurrentCatalog);

  const refreshCatalog = async (): Promise<void> => {
    const sequence = ++refreshSequence;
    refresh.disabled = true;
    summary.textContent = '正在读取世界书…';

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

      console.error('[Lorebook Groups] Failed to read lorebook catalog.', error);
      currentCatalog = [];
      selectedBookNames.clear();
      list.replaceChildren();
      updateOrganizerControls([], groupStore.getSnapshot(), groupStore.getIssue());
      summary.textContent = '无法读取世界书清单，请刷新后重试。';
    } finally {
      if (!disposed && sequence === refreshSequence) {
        refresh.disabled = false;
      }
    }
  };

  const runBatchMembershipChange = (assigned: boolean): void => {
    const visibleSelectedBookNames = getVisibleCatalog()
      .map((item) => item.name)
      .filter((name) => selectedBookNames.has(name));
    const settings = groupStore.getSnapshot();
    const targetGroup = settings.groups.find((group) => group.id === selectedTargetGroupId);
    if (!targetGroup || visibleSelectedBookNames.length === 0) {
      showOrganizerMessage('请先选择当前结果中的世界书和目标分组。', true);
      return;
    }

    try {
      groupStore.setMemberships(targetGroup.id, visibleSelectedBookNames, assigned);
      showOrganizerMessage(
        `已将 ${String(visibleSelectedBookNames.length)} 本世界书${assigned ? '加入' : '移出'}“${targetGroup.name}”。`,
        false,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      renderCurrentCatalog();
      showOrganizerMessage(`批量操作没有保存：${detail}`, true);
    }
  };

  const searchCatalog = (): void => {
    renderCurrentCatalog();
  };

  const toggleVisibleSelection = (): void => {
    for (const item of getVisibleCatalog()) {
      if (selectVisible.checked) {
        selectedBookNames.add(item.name);
      } else {
        selectedBookNames.delete(item.name);
      }
    }
    renderCurrentCatalog();
  };

  const changeBatchTarget = (): void => {
    selectedTargetGroupId = targetSelect.value || undefined;
  };

  const findGroupDropTarget = (eventTarget: EventTarget | null): HTMLElement | undefined => {
    if (!(eventTarget instanceof Element)) {
      return undefined;
    }
    const target = eventTarget.closest<HTMLElement>('.lbg-group-item[data-group-id]');
    return target && groupManager.element.contains(target) ? target : undefined;
  };

  const dragOverGroup = (event: DragEvent): void => {
    const target = findGroupDropTarget(event.target);
    if (!target || !draggedBookName || groupStore.getIssue()) {
      return;
    }

    event.preventDefault();
    clearDropTargets();
    target.classList.add('lbg-group-item--drop-target');
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const leaveGroupDropArea = (event: DragEvent): void => {
    if (event.relatedTarget instanceof Node && groupManager.element.contains(event.relatedTarget)) {
      return;
    }
    clearDropTargets();
  };

  const dropIntoGroup = (event: DragEvent): void => {
    const target = findGroupDropTarget(event.target);
    const bookName = draggedBookName;
    const groupId = target?.dataset.groupId;
    const settings = groupStore.getSnapshot();
    const group = settings.groups.find((item) => item.id === groupId);
    if (
      !target ||
      !bookName ||
      !group ||
      groupStore.getIssue() ||
      !currentCatalog.some((item) => item.name === bookName)
    ) {
      clearDropTargets();
      draggedBookName = undefined;
      return;
    }

    event.preventDefault();
    clearDropTargets();
    try {
      groupStore.setMemberships(group.id, [bookName], true);
      showOrganizerMessage(`已将“${bookName}”加入“${group.name}”，原有分组保持不变。`, false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      renderCurrentCatalog();
      showOrganizerMessage(`拖动操作没有保存：${detail}`, true);
    } finally {
      draggedBookName = undefined;
    }
  };

  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const stopVisibleRefresh = (): void => {
    if (refreshTimer !== undefined) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  };

  const startVisibleRefresh = (): void => {
    stopVisibleRefresh();
    queueRefresh();
    refreshTimer = setInterval(queueRefresh, VISIBLE_REFRESH_INTERVAL_MS);
  };

  const togglePanel = (event: Event): void => {
    // Keep SillyTavern's delegated drawer handler from toggling the same panel a second time.
    event.stopPropagation();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    content.hidden = expanded;
    icon.classList.toggle('down', expanded);
    icon.classList.toggle('up', !expanded);
    icon.classList.toggle('fa-circle-chevron-down', expanded);
    icon.classList.toggle('fa-circle-chevron-up', !expanded);

    if (expanded) {
      stopVisibleRefresh();
    } else {
      startVisibleRefresh();
    }
  };

  const togglePanelFromKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    toggle.click();
  };

  let refreshQueued = false;
  const queueRefresh = (): void => {
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

  const refreshFromButton = (): void => {
    void refreshCatalog();
  };

  const addSelectedToGroup = (): void => {
    runBatchMembershipChange(true);
  };

  const removeSelectedFromGroup = (): void => {
    runBatchMembershipChange(false);
  };

  toggle.addEventListener('click', togglePanel);
  toggle.addEventListener('keydown', togglePanelFromKeyboard);
  refresh.addEventListener('click', refreshFromButton);
  searchInput.addEventListener('input', searchCatalog);
  selectVisible.addEventListener('change', toggleVisibleSelection);
  targetSelect.addEventListener('change', changeBatchTarget);
  batchAdd.addEventListener('click', addSelectedToGroup);
  batchRemove.addEventListener('click', removeSelectedFromGroup);
  groupManager.element.addEventListener('dragover', dragOverGroup);
  groupManager.element.addEventListener('dragleave', leaveGroupDropArea);
  groupManager.element.addEventListener('drop', dropIntoGroup);
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
    toggle.removeEventListener('click', togglePanel);
    toggle.removeEventListener('keydown', togglePanelFromKeyboard);
    refresh.removeEventListener('click', refreshFromButton);
    searchInput.removeEventListener('input', searchCatalog);
    selectVisible.removeEventListener('change', toggleVisibleSelection);
    targetSelect.removeEventListener('change', changeBatchTarget);
    batchAdd.removeEventListener('click', addSelectedToGroup);
    batchRemove.removeEventListener('click', removeSelectedFromGroup);
    groupManager.element.removeEventListener('dragover', dragOverGroup);
    groupManager.element.removeEventListener('dragleave', leaveGroupDropArea);
    groupManager.element.removeEventListener('drop', dropIntoGroup);
    root.remove();
  };
}
