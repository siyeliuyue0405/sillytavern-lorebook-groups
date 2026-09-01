import { describe, expect, it } from 'vitest';

import { buildLorebookCatalog } from '../src/core/lorebook-catalog';

describe('lorebook catalog', () => {
  it('keeps every host lorebook and derives independent automatic statuses', () => {
    const catalog = buildLorebookCatalog({
      worldNames: ['全局书', '角色主书', '角色附加书', '聊天书', '未绑定书', '多状态书'],
      globalWorldNames: ['全局书', '多状态书', '不存在的旧绑定'],
      characters: [
        { data: { extensions: { world: '角色主书' } } },
        { data: { extensions: { world: '多状态书' } } },
      ],
      worldInfoSettings: {
        charLore: [{ name: 'character-a', extraBooks: ['角色附加书', '多状态书'] }],
      },
      chatWorldName: '多状态书',
    });

    expect(catalog).toEqual([
      { name: '全局书', statuses: ['global'] },
      { name: '角色主书', statuses: ['character'] },
      { name: '角色附加书', statuses: ['character'] },
      { name: '聊天书', statuses: [] },
      { name: '未绑定书', statuses: [] },
      { name: '多状态书', statuses: ['global', 'character', 'chat'] },
    ]);
  });

  it('marks the current chat book without changing host order or duplicating names', () => {
    const catalog = buildLorebookCatalog({
      worldNames: ['B', '聊天书', 'B', '', 42],
      globalWorldNames: 'invalid',
      characters: null,
      worldInfoSettings: { charLore: [{ extraBooks: 'invalid' }] },
      chatWorldName: '聊天书',
    });

    expect(catalog).toEqual([
      { name: 'B', statuses: [] },
      { name: '聊天书', statuses: ['chat'] },
    ]);
  });
});
