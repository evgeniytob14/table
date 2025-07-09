const { workerData, parentPort } = require('worker_threads');
const parserService = require('./parserService');

const { parserName, config } = workerData;

async function runParser() {
  try {
    // Имитируем циклическое выполнение с интервалом
    while (true) {
      try {
        const result = await parserService.parseSingle(parserName);
        parentPort.postMessage({
          type: 'update',
          itemsCount: result.count
        });
      } catch (error) {
        parentPort.postMessage({
          type: 'error',
          error: error.message
        });
      }

      // Ожидаем указанный интервал перед следующим обновлением
      await new Promise(resolve => 
        setTimeout(resolve, config.intervals[parserName] || config.intervals.default)
      );
    }
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      error: `Worker fatal error: ${error.message}`
    });
    process.exit(1);
  }
}

// Отправляем статус при запуске
parentPort.postMessage({
  type: 'status',
  isActive: true
});

runParser().catch(error => {
  parentPort.postMessage({
    type: 'error',
    error: `Worker failed: ${error.message}`
  });
  process.exit(1);
});