import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), 'utf8'));
}

function assertSafeRelativeFile(relativePath, fieldName) {
  assert.equal(typeof relativePath, 'string', `${fieldName} must be a string`);
  assert(relativePath.length > 0, `${fieldName} must not be empty`);
  assert(!path.isAbsolute(relativePath), `${fieldName} must be relative`);
  assert(!relativePath.split(/[\\/]/u).includes('..'), `${fieldName} must stay in the extension`);
}

const [manifest, packageJson] = await Promise.all([
  readJson('manifest.json'),
  readJson('package.json'),
]);

assert.equal(manifest.version, packageJson.version, 'manifest and package versions must match');
assert.equal(manifest.display_name, 'Lorebook Groups / 世界书分组');
assert.equal(manifest.author, '似夜流月');
assert.equal(manifest.minimum_client_version, '1.18.0');
assert.equal(manifest.auto_update, true);
assert.equal(manifest.hooks?.activate, 'onActivate');
assert.equal(manifest.hooks?.disable, 'onDisable');

for (const fieldName of ['js', 'css']) {
  const relativePath = manifest[fieldName];
  assertSafeRelativeFile(relativePath, `manifest.${fieldName}`);
  await access(path.join(projectRoot, relativePath));
}

for (const relativePath of Object.values(manifest.i18n ?? {})) {
  assertSafeRelativeFile(relativePath, 'manifest.i18n entry');
  await access(path.join(projectRoot, relativePath));
}

const entryUrl = pathToFileURL(path.join(projectRoot, manifest.js));
entryUrl.searchParams.set('verify', String(Date.now()));
const entryModule = await import(entryUrl.href);

for (const hookName of ['activate', 'disable']) {
  const exportName = manifest.hooks[hookName];
  assert.equal(
    typeof entryModule[exportName],
    'function',
    `dist entry must export ${exportName} for the ${hookName} hook`,
  );
}

await entryModule.onActivate();
assert.deepEqual(entryModule.getRuntimeStatus(), {
  extensionId: 'sillytavern_lorebook_groups',
  version: manifest.version,
  active: true,
});
entryModule.onDisable();
assert.equal(entryModule.getRuntimeStatus(), undefined);
