import 'dotenv/config';
import { consumeLoop } from './consumer.js';
import { ensureTableExists } from './db.js';

async function main() {
  console.log('Worker starting...');
  try {
    // ensure table exists before processing queue
    await ensureTableExists();
    console.log('Ensured leaderboard table exists');
  } catch (err) {
    console.error('Error ensuring leaderboard table', err);
    // continue — consumer will surface errors too, but table absence should be fixed here
  }
  await consumeLoop();
}

main().catch(err => {
  console.error('Worker crashed', err);
  process.exit(1);
});
