import fs from 'node:fs';
const json = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const pkg = json('package.json');
const lock = json('package-lock.json');
const tauri = json('src-tauri/tauri.conf.json');
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const rustLock = fs.readFileSync('Cargo.lock', 'utf8');
const rustPackage = /(\[\[package\]\]\r?\nname = "netscope"\r?\nversion = ")([^"]+)("\r?\n)/;
const rustVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const lockedRustVersion = rustLock.match(rustPackage)?.[2];
if (!rustVersion || !lockedRustVersion || !lock.packages?.['']?.version)
  throw new Error('Не найдена версия NetScope в манифестах или lock-файлах.');
const check = process.argv[2] === '--check-tag';
const tag = process.argv[3] ?? '';
const version = (check ? tag.slice(1) : process.argv[2]) ?? '';
const numeric = '(?:0|[1-9]\\d*)';
const identifier = `(?:${numeric}|\\d*[a-zA-Z-][\\da-zA-Z-]*)`;
const versionPattern = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`,
);
if ((check && !tag.startsWith('v')) || !versionPattern.test(version))
  throw new Error('Укажите версию в формате X.Y.Z.');
if (check) {
  if (
    [
      pkg.version,
      tauri.version,
      rustVersion,
      lock.version,
      lock.packages[''].version,
      lockedRustVersion,
    ].some((v) => v !== version)
  )
    throw new Error('Тег, версии манифестов и lock-файлов должны совпадать.');
} else {
  pkg.version = version;
  tauri.version = version;
  write('package.json', pkg);
  write('src-tauri/tauri.conf.json', tauri);
  lock.version = version;
  lock.packages[''].version = version;
  write('package-lock.json', lock);
  fs.writeFileSync(
    'src-tauri/Cargo.toml',
    cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
  );
  fs.writeFileSync(
    'Cargo.lock',
    rustLock.replace(rustPackage, (_match, start, _old, end) => start + version + end),
  );
}
process.stdout.write(
  check ? `Версия ${version} проверена.\n` : `Версия ${version} записана во все манифесты.\n`,
);
