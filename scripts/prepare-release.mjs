import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [target, output = 'artifacts/release'] = process.argv.slice(2);
if (!['x86_64-pc-windows-msvc', 'aarch64-apple-darwin'].includes(target))
  throw new Error('Укажите поддерживаемый target.');
const directory = `target/${target}/release/bundle/${target.includes('windows') ? 'nsis' : 'dmg'}`;
const extension = target.includes('windows') ? '.exe' : '.dmg';
const candidates = fs.readdirSync(directory).filter((name) => name.endsWith(extension));
if (candidates.length !== 1)
  throw new Error('Ожидался один установщик. Очистите старые установщики перед сборкой.');
fs.mkdirSync(output, { recursive: true });
const name = target.includes('windows')
  ? 'NetScope-Windows-x64-setup.exe'
  : 'NetScope-macOS-arm64.dmg';
const file = path.join(output, name);
fs.copyFileSync(path.join(directory, candidates[0]), file);
const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(output, `${name}.sha256`), `${hash}  ${name}\n`);
process.stdout.write(`${file}\n`);
