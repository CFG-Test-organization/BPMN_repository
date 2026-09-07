const fs = require('fs');
const bpmnModdleImport = require('bpmn-moddle');
const differImport = require('bpmn-js-differ');

// Безпечне отримання конструктора для будь-яких версій CJS/ESM
function resolveExport(importedModule, exportName) {
  if (typeof importedModule === 'function') return importedModule;
  if (importedModule && typeof importedModule[exportName] === 'function') return importedModule[exportName];
  if (importedModule && typeof importedModule.default === 'function') return importedModule.default;
  if (importedModule && importedModule.default && typeof importedModule.default[exportName] === 'function') {
    return importedModule.default[exportName];
  }
  return importedModule;
}

const BpmnModdle = resolveExport(bpmnModdleImport, 'BpmnModdle');
const diff = resolveExport(differImport, 'diff');

if (typeof BpmnModdle !== 'function') {
  console.error('Помилка: не вдалося завантажити конструктор BpmnModdle. Структура:', bpmnModdleImport);
  process.exit(1);
}

const moddle = new BpmnModdle();

async function parseBPMN(xmlString) {
  try {
    const result = await moddle.fromXML(xmlString);
    return result.rootElement || result;
  } catch (error) {
    return new Promise((resolve, reject) => {
      moddle.fromXML(xmlString, (err, definitions) => {
        if (err) return reject(err);
        resolve(definitions);
      });
    });
  }
}

async function runDiff(oldFilePath, newFilePath) {
  try {
    const oldXml = fs.readFileSync(oldFilePath, 'utf8');
    const newXml = fs.readFileSync(newFilePath, 'utf8');

    const [oldDefs, newDefs] = await Promise.all([
      parseBPMN(oldXml),
      parseBPMN(newXml)
    ]);

    const changes = diff(oldDefs, newDefs);

    console.log('=== СЕМАНТИЧНИЙ АНАЛІЗ ЗМІН BPMN 2.0 ===\n');

    // Додані елементи
    const added = Object.values(changes._added || {});
    console.log(`Додано елементів: ${added.length}`);
    for (const item of added) {
      console.log(`  + [${item.$type}] "${item.name || '(без назви)'}"`);
    }

    // Видалені елементи
    const removed = Object.values(changes._removed || {});
    console.log(`\nВидалено елементів: ${removed.length}`);
    for (const item of removed) {
      console.log(`  - [${item.$type}] "${item.name || '(без назви)'}"`);
    }

    // Модифіковані елементи
    const changed = Object.values(changes._changed || {});
    console.log(`\nЗмінено елементів: ${changed.length}`);
    for (const change of changed) {
      const modelElement = change.model;
      console.log(`  * [${modelElement.$type}] "${modelElement.name || modelElement.id}":`, change.attrs);
    }

    // Тільки зміна візуального розташування
    const layout = Object.keys(changes._layoutChanged || {});
    console.log(`\nЗміщення координат на полотні (DI): ${layout.length} елементів`);

  } catch (error) {
    console.error('Помилка під час аналізу схем:', error.message);
  }
}

let oldPath, newPath;
if (process.argv.length >= 8) {
  oldPath = process.argv[3];
  newPath = process.argv[6];
} else {
  oldPath = process.argv[2];
  newPath = process.argv[3];
}

if (!oldPath || !newPath) {
  console.error('Помилка: не вказано шляхи до файлів для порівняння.');
  process.exit(1);
}

runDiff(oldPath, newPath);