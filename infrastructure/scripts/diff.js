const fs = require('fs');
const bpmnModdleImport = require('bpmn-moddle');
const differImport = require('bpmn-js-differ');

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
  console.error('Помилка: не вдалося ініціалізувати BpmnModdle.');
  process.exit(1);
}

const moddle = new BpmnModdle();

const TYPE_TRANSLATIONS = {
  'bpmn:Task': 'Абстрактна задача (Task)',
  'bpmn:UserTask': 'Користувацька задача (User Task)',
  'bpmn:ServiceTask': 'Сервісна задача (Service Task)',
  'bpmn:SendTask': 'Задача відправки повідомлення (Send Task)',
  'bpmn:ReceiveTask': 'Задача отримання повідомлення (Receive Task)',
  'bpmn:ScriptTask': 'Скриптова задача (Script Task)',
  'bpmn:BusinessRuleTask': 'Задача бізнес-правил (Business Rule Task)',
  'bpmn:ManualTask': 'Ручна задача (Manual Task)',
  'bpmn:SubProcess': 'Підпроцес (Sub-Process)',
  'bpmn:CallActivity': 'Виклик підпроцесу (Call Activity)',
  'bpmn:ExclusiveGateway': 'Виключна розвилка (Exclusive Gateway "XOR")',
  'bpmn:ParallelGateway': 'Паралельна розвилка (Parallel Gateway "AND")',
  'bpmn:InclusiveGateway': 'Включна розвилка (Inclusive Gateway "OR")',
  'bpmn:EventBasedGateway': 'Розвилка за подіями (Event-Based Gateway)',
  'bpmn:StartEvent': 'Початкова подія (Start Event)',
  'bpmn:EndEvent': 'Кінцева подія (End Event)',
  'bpmn:IntermediateCatchEvent': 'Проміжна подія-обробник (Catch Event)',
  'bpmn:IntermediateThrowEvent': 'Проміжна подія-ініціатор (Throw Event)',
  'bpmn:BoundaryEvent': 'Гранична подія (Boundary Event)',
  'bpmn:SequenceFlow': 'Потік управління (Sequence Flow)',
  'bpmn:MessageFlow': 'Потік повідомлень (Message Flow)',
  'bpmn:DataObjectReference': 'Об\'єкт даних (Data Object)',
  'bpmn:DataStoreReference': 'Сховище даних (Data Store)'
};

function formatType(type) {
  return TYPE_TRANSLATIONS[type] || type;
}

// Побудова індексу всіх елементів моделі для пошуку за id
function buildElementIndex(definitions) {
  const map = new Map();
  function traverse(element) {
    if (!element) return;
    if (element.id) map.set(element.id, element);
    if (element.flowElements) element.flowElements.forEach(traverse);
    if (element.rootElements) element.rootElements.forEach(traverse);
    if (element.artifacts) element.artifacts.forEach(traverse);
    if (element.laneSets) {
      element.laneSets.forEach(ls => ls.lanes && ls.lanes.forEach(traverse));
    }
  }
  traverse(definitions);
  return map;
}

function getElementName(element, index) {
  if (!element) return '(елемент видалено)';
  const el = (typeof element === 'string' && index) ? index.get(element) : element;
  if (!el) return '(невідомий елемент)';
  if (el.name && el.name.trim() !== '') {
    return `"${el.name.trim().replace(/\n/g, ' ')}"`;
  }
  return `(без назви [${formatType(el.$type)}])`;
}

function formatFlowEndpoint(endpoint, index) {
  if (!endpoint) return '(не визначено)';
  const target = (typeof endpoint === 'string' && index) ? index.get(endpoint) : endpoint;
  if (!target) return '(невідомий вузол)';
  const name = target.name && target.name.trim() ? `"${target.name.trim().replace(/\n/g, ' ')}"` : '(без назви)';
  return `${name} [${formatType(target.$type)}]`;
}

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

    const oldIndex = buildElementIndex(oldDefs);
    const newIndex = buildElementIndex(newDefs);

    const changes = diff(oldDefs, newDefs);

    console.log('========================================================');
    console.log('       СЕМАНТИЧНИЙ АНАЛІЗ ЗМІН У СХЕМІ BPMN 2.0         ');
    console.log('========================================================\n');

    // 1. ДОДАНІ ЕЛЕМЕНТИ
    const added = Object.values(changes._added || {});
    if (added.length > 0) {
      console.log(`[+] ДОДАНО ЕЛЕМЕНТІВ: ${added.length}`);
      for (const item of added) {
        if (item.$type === 'bpmn:SequenceFlow') {
          const from = formatFlowEndpoint(item.sourceRef, newIndex);
          const to = formatFlowEndpoint(item.targetRef, newIndex);
          console.log(`  + Потік управління: ${getElementName(item, newIndex)}`);
          console.log(`      ↳ Маршрут: ${from}  --->  ${to}`);
        } else {
          console.log(`  + ${formatType(item.$type)}: ${getElementName(item, newIndex)}`);
        }
      }
      console.log('');
    }

    // 2. ВИДАЛЕНІ ЕЛЕМЕНТИ
    const removed = Object.values(changes._removed || {});
    if (removed.length > 0) {
      console.log(`[-] ВИДАЛЕНО ЕЛЕМЕНТІВ: ${removed.length}`);
      for (const item of removed) {
        if (item.$type === 'bpmn:SequenceFlow') {
          const from = formatFlowEndpoint(item.sourceRef, oldIndex);
          const to = formatFlowEndpoint(item.targetRef, oldIndex);
          console.log(`  - Потік управління: ${getElementName(item, oldIndex)}`);
          console.log(`      ↳ Був маршрут: ${from}  --->  ${to}`);
        } else {
          console.log(`  - ${formatType(item.$type)}: ${getElementName(item, oldIndex)}`);
        }
      }
      console.log('');
    }

    // 3. МОДИФІКОВАНІ ЕЛЕМЕНТИ
    const changed = Object.values(changes._changed || {});
    if (changed.length > 0) {
      console.log(`[*] МОДИФІКОВАНО ЕЛЕМЕНТІВ: ${changed.length}`);
      for (const change of changed) {
        const elem = change.model;
        const attrs = change.attrs || {};

        console.log(`\n  • Вузол: ${getElementName(elem, newIndex)} [${formatType(elem.$type)}]`);

        for (const [attrName, diffDetails] of Object.entries(attrs)) {
          // bpmn-js-differ 3.x returns these two values in reverse order.
          const oldVal = diffDetails.newValue;
          const newVal = diffDetails.oldValue;

          if (attrName === 'outgoing') {
            console.log(`      ↳ Топологія: змінено список вихідних потоків управління`);
          } else if (attrName === 'incoming') {
            console.log(`      ↳ Топологія: змінено список вхідних потоків управління`);
          } else if (attrName === '$type') {
            console.log(`      ↳ ЗМІНА ТИПУ: було ${formatType(oldVal)} → стало ${formatType(newVal)}`);
          } else if (attrName === 'name') {
            console.log(`      ↳ Зміна найменування: "${oldVal || ''}" → "${newVal || ''}"`);
          } else if (attrName === 'default') {
            const defName = newVal ? getElementName(newVal, newIndex) : '(знято)';
            console.log(`      ↳ Потік за замовчуванням (Default Flow): ${defName}`);
          } else if (attrName === 'conditionExpression') {
            console.log(`      ↳ Оновлено логіку умовного виразу Sequence Flow`);
          } else {
            console.log(`      ↳ Атрибут "${attrName}": значення оновлено`);
          }
        }
      }
      console.log('\n');
    }

    // 4. ЗМІНИ РОЗТАШУВАННЯ
    const layout = Object.keys(changes._layoutChanged || {});
    if (layout.length > 0) {
      console.log(`[~] Графічне переміщення на полотні (DI): ${layout.length} елементів (логіку не змінено)`);
    }

    if (added.length === 0 && removed.length === 0 && changed.length === 0 && layout.length === 0) {
      console.log('Жодних змін між схемами не виявлено.');
    }

    console.log('========================================================\n');

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
  console.error('Помилка: не вказано файли для порівняння.');
  process.exit(1);
}

runDiff(oldPath, newPath);