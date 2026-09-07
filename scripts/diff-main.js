const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const workingFile = process.argv[2];
if (!workingFile) {
  console.error('Помилка: не вибрано BPMN-файл.');
  process.exit(1);
}

const absoluteFile = path.resolve(workingFile);
if (path.extname(absoluteFile).toLowerCase() !== '.bpmn') {
  console.error('Помилка: для порівняння потрібно вибрати BPMN-файл, а не SVG.');
  process.exit(1);
}

let repositoryRoot;
try {
  repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: path.dirname(absoluteFile),
    encoding: 'utf8'
  }).trim();
} catch (error) {
  console.error('Помилка: файл не належить Git-репозиторію.');
  process.exit(1);
}

const relativeFile = path.relative(repositoryRoot, absoluteFile).replace(/\\/g, '/');
let mainRef = 'main';
try {
  mainRef = execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim() || mainRef;
} catch (error) {
  // Якщо origin/HEAD не налаштований, використовуємо локальну гілку main.
}

let baseXml;
try {
  baseXml = execFileSync('git', ['show', `${mainRef}:${relativeFile}`], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });
} catch (error) {
  console.error(`Помилка: файл не знайдено в основній гілці (${mainRef}): ${relativeFile}`);
  process.exit(1);
}

const temporaryFile = path.join(os.tmpdir(), `bpmn-main-${process.pid}-${Date.now()}.bpmn`);
try {
  fs.writeFileSync(temporaryFile, baseXml, 'utf8');
  const result = spawnSync(process.execPath, [
    path.join(repositoryRoot, 'scripts', 'diff.js'),
    temporaryFile,
    absoluteFile
  ], { stdio: 'inherit' });
  process.exit(result.status === null ? 1 : result.status);
} finally {
  try {
    fs.unlinkSync(temporaryFile);
  } catch (error) {
    // Тимчасовий файл уже видалено або він недоступний.
  }
}
