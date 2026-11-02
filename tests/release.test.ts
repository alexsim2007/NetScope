import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/version.mjs');
const temporary: string[] = [];
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'netscope-release-'));
  temporary.push(cwd);
  mkdirSync(join(cwd, 'src-tauri'));
  const files = {
    'package.json': '{"name":"netscope","version":"0.0.0"}',
    'package-lock.json': '{"version":"0.0.0","packages":{"":{"version":"0.0.0"}}}',
    'src-tauri/tauri.conf.json': '{"version":"0.0.0"}',
    'src-tauri/Cargo.toml': '[package]\nname = "netscope"\nversion = "0.0.0"\n',
    'Cargo.lock':
      '[[package]]\nname = "netscope"\nversion = "0.0.0"\n\n[[package]]\nname = "dependency"\nversion = "2.0.0"\n',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(cwd, name), text);
  return { cwd, files };
}
const run = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
afterEach(() => {
  for (const cwd of temporary.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

describe('release version gate', () => {
  it('updates all app versions without changing a dependency and validates the tag', () => {
    const { cwd } = fixture();
    expect(run(cwd, '0.1.0').status).toBe(0);
    expect(run(cwd, '--check-tag', 'v0.1.0').status).toBe(0);
    expect(readFileSync(join(cwd, 'Cargo.lock'), 'utf8')).toContain(
      'name = "dependency"\nversion = "2.0.0"',
    );
    expect(run(cwd, '--check-tag', 'v0.2.0').status).not.toBe(0);
  });

  it.each(['package-lock.json', 'Cargo.lock'])('rejects a stale %s', (name) => {
    const { cwd } = fixture();
    expect(run(cwd, '0.1.0').status).toBe(0);
    const file = join(cwd, name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('0.1.0', '0.0.0'));
    expect(run(cwd, '--check-tag', 'v0.1.0').status).not.toBe(0);
  });

  it('requires a v-prefixed tag and rejects invalid versions without writing files', () => {
    const { cwd, files } = fixture();
    expect(run(cwd, '--check-tag', '0.0.0').status).not.toBe(0);
    for (const version of ['01.2.3', '1.2.3-01', '1.2.3-..', 'X.Y.Z'])
      expect(run(cwd, version).status).not.toBe(0);
    for (const [name, text] of Object.entries(files))
      expect(readFileSync(join(cwd, name), 'utf8')).toBe(text);
  });

  it('detects a missing app lock entry before changing any manifest', () => {
    const { cwd, files } = fixture();
    writeFileSync(join(cwd, 'Cargo.lock'), '[[package]]\nname = "dependency"\nversion = "2.0.0"\n');
    expect(run(cwd, '0.1.0').status).not.toBe(0);
    expect(readFileSync(join(cwd, 'package.json'), 'utf8')).toBe(files['package.json']);
    expect(readFileSync(join(cwd, 'src-tauri/Cargo.toml'), 'utf8')).toBe(
      files['src-tauri/Cargo.toml'],
    );
  });
});
