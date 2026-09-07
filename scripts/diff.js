const fs = require('fs');
const BpmnModdle = require('bpmn-moddle');
const diff = require('bpmn-js-differ');

const moddle = new BpmnModdle();

async function parseBPMN(xmlString) {
  return new Promise((resolve, reject) => {
    moddle.fromXML(xmlString, (err, definitions) => {
      if (err) return reject(err);
      resolve(definitions);
    });
  });
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

    console.log('=== СЕМАНТИЧНИЙ АНАЛІЗ ЗМІН BPMN ===\n');

    // 1. Додані елементи
    console.log(`Додано елементів: ${Object.keys(changes._added).length}`);
    for (const [id, item] of Object.entries(changes._added)) {
      console.log(`  + [${item.$type}] "${item.name || '(без назви)'}"`);
    }

    // 2. Видалені елементи
    console.log(`\nВидалено елементів: ${Object.keys(changes._removed).length}`);
    for (const [id, item] of Object.entries(changes._removed)) {
      console.log(`  - [${item.$type}] "${item.name || '(без назви)'}"`);
    }

    // 3. Змінені елементи (властивості, атрибути, назви)
    console.log(`\nЗмінено елементів: ${Object.keys(changes._changed).length}`);
    for (const [id, change] of Object.entries(changes._changed)) {
      const modelElement = change.model;
      console.log(`  * [${modelElement.$type}] "${modelElement.name || id}":`, change.attrs);
    }

    // 4. Тільки візуальне зміщення (без зміни логіки)
    console.log(`\nЗміщення координат (DI): ${Object.keys(changes._layoutChanged).length} елементів`);

  } catch (error) {
    console.error('Помилка аналізу схем:', error.message);
  }
}

// Запуск: node diff.js old_process.bpmn new_process.bpmn
const [,, oldPath, newPath] = process.argv;
runDiff(oldPath, newPath);