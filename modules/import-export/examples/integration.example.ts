import { StreamParser, StreamSerializer } from '../index';

async function runExample() {
  console.log('--- Import / Export Module Example ---');

  // 1. Parsing CSV
  const csvData = 'id,title,status\n1,Task One,active\n2,Task Two,pending';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(csvData));
      controller.close();
    },
  });

  const parser = new StreamParser();
  const records = await parser.parseStream(stream, {
    format: 'csv',
    hasHeader: true,
  });

  console.log('Parsed Records:', records);

  // 2. Serializing to CSV
  const serializer = new StreamSerializer();
  const exportResult = serializer.serialize(
    records.map((r) => r.value!),
    {
      format: 'csv',
      columns: ['id', 'title', 'status'],
      includeHeader: true,
      escapeFormulas: true,
    }
  );

  console.log('Exported CSV Result:\n', exportResult.data);
}

runExample().catch(console.error);
