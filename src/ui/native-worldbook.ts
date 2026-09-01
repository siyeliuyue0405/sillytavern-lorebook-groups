import { loadGroupSettings, type LorebookGroupSettings } from '../core/group-settings';
import type { LorebookCatalogItem } from '../core/lorebook-catalog';
import { GROUP_SETTINGS_CHANGED_EVENT, type LorebookHost } from '../host/sillytavern';

const NATIVE_ROOT_ID = 'sillytavern-lorebook-groups-native';

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function isEnglish(): boolean {
  return (document.documentElement.lang || '').toLowerCase().startsWith('en');
}

function text(language: boolean, chinese: string, english: string): string {
  return language ? english : chinese;
}

function renderGroup(
  group: LorebookGroupSettings['groups'][number],
  catalog: readonly LorebookCatalogItem[],
  activeNames: ReadonlySet<string>,
  english: boolean,
  host: LorebookHost,
): HTMLDetailsElement {
  const details = make('details', 'lbg-native-group');
  details.open = true;
  const summary = make('summary', 'lbg-native-group__summary');
  const title = make('span', 'lbg-native-group__name');
  title.textContent = group.name;
  const count = make('span', 'lbg-native-group__count');
  const books = group.bookNames
    .map((name) => catalog.find((item) => item.name === name))
    .filter((item): item is LorebookCatalogItem => Boolean(item));
  count.textContent = text(english, `${String(books.length)} 本`, `${String(books.length)} books`);
  summary.append(title, count);
  details.append(summary);

  const list = make('ul', 'lbg-native-group__list');
  if (books.length === 0) {
    const empty = make('li', 'lbg-native-group__empty');
    empty.textContent = text(english, '此分组暂无世界书。', 'No worldbooks in this group.');
    list.append(empty);
  }

  for (const book of books) {
    const row = make('li', 'lbg-native-book');
    const toggleLabel = make('label', 'lbg-native-book__toggle');
    const toggle = make('input');
    toggle.type = 'checkbox';
    toggle.checked = activeNames.has(book.name);
    toggle.setAttribute(
      'aria-label',
      text(english, `启用世界书 ${book.name}`, `Enable worldbook ${book.name}`),
    );
    toggle.addEventListener('change', () => {
      const operation = host.setWorldInfoActive?.(book.name, toggle.checked);
      void operation?.catch((error: unknown) => {
        toggle.checked = !toggle.checked;
        row.title =
          error instanceof Error ? error.message : text(english, '操作失败。', 'Operation failed.');
      });
    });
    toggleLabel.append(toggle);

    const name = make('span', 'lbg-native-book__name');
    name.textContent = book.name;
    const edit = make('button', 'lbg-native-book__edit');
    edit.type = 'button';
    edit.textContent = text(english, '编辑原件', 'Edit original');
    edit.setAttribute(
      'aria-label',
      text(english, `编辑世界书 ${book.name}`, `Edit worldbook ${book.name}`),
    );
    edit.addEventListener('click', () => {
      const operation = host.openWorldInfoEditor?.(book.name);
      void operation?.catch((error: unknown) => {
        row.title =
          error instanceof Error ? error.message : text(english, '打开失败。', 'Unable to open.');
      });
    });
    row.append(toggleLabel, name, edit);
    list.append(row);
  }
  details.append(list);
  return details;
}

export interface NativeWorldbookEnhancement {
  refresh(): Promise<void>;
  dispose(): void;
}

export function mountNativeWorldbookEnhancement(
  host: LorebookHost,
): NativeWorldbookEnhancement | undefined {
  const initialContainer = document.querySelector<HTMLElement>('#WIMultiSelector');
  if (!initialContainer) return undefined;
  let nativeContainer: HTMLElement = initialContainer;
  const observeRoot = document.querySelector<HTMLElement>('#wi-holder') ?? document.body;

  document.getElementById(NATIVE_ROOT_ID)?.remove();
  const root = make('section', 'lbg-native');
  root.id = NATIVE_ROOT_ID;
  root.setAttribute('aria-labelledby', `${NATIVE_ROOT_ID}-title`);
  const heading = make('h4', 'lbg-native__title');
  heading.id = `${NATIVE_ROOT_ID}-title`;
  heading.textContent = text(isEnglish(), '按分组浏览', 'Browse by group');
  const message = make('p', 'lbg-native__message');
  message.setAttribute('role', 'status');
  const groups = make('div', 'lbg-native__groups');
  root.append(heading, message, groups);
  const markContainer = (container: HTMLElement): void => {
    container.classList.add('lbg-native-host');
    container.append(root);
  };
  markContainer(nativeContainer);

  let disposed = false;
  let sequence = 0;
  let refreshQueued = false;
  const refresh = async (): Promise<void> => {
    const currentSequence = ++sequence;
    try {
      const [catalog, rawSettings] = await Promise.all([
        host.readCatalog(),
        Promise.resolve(host.readGroupSettings()),
      ]);
      if (disposed || currentSequence !== sequence) return;
      const loaded = loadGroupSettings(rawSettings);
      const english = isEnglish();
      heading.textContent = text(english, '按分组浏览', 'Browse by group');
      const activeNames = new Set(
        catalog.filter((item) => item.statuses.includes('global')).map((item) => item.name),
      );
      groups.replaceChildren();
      for (const group of loaded.settings.groups) {
        groups.append(renderGroup(group, catalog, activeNames, english, host));
      }
      message.textContent = loaded.issue ?? '';
    } catch (error) {
      if (disposed || currentSequence !== sequence) return;
      message.textContent =
        error instanceof Error
          ? error.message
          : text(isEnglish(), '无法读取分组。', 'Unable to read groups.');
    }
  };

  const onChanged = (): void => void refresh();
  const queueRefresh = (): void => {
    if (refreshQueued || disposed) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) void refresh();
    });
  };
  const unsubscribe = host.subscribe(queueRefresh);
  const observer = new MutationObserver((mutations) => {
    if (
      !mutations.some((mutation) => mutation.type === 'childList' || mutation.type === 'attributes')
    )
      return;
    if (mutations.some((mutation) => mutation.type === 'attributes')) queueRefresh();
    const currentContainer = document.querySelector<HTMLElement>('#WIMultiSelector');
    if (currentContainer && currentContainer !== nativeContainer) {
      nativeContainer.classList.remove('lbg-native-host');
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
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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
      nativeContainer.classList.remove('lbg-native-host');
      root.remove();
    },
  };
}
