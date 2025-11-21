import 'dotenv/config';
export const QUEUE_KEY = process.env.QUEUE_KEY || 'queue:scores';
export const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10);
