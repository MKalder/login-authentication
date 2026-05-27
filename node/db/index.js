import { Pool } from 'pg';
import { config } from '../config.js';
import { createRequire } from 'module';

console.log(config.db);

const pool = new Pool(config.db);

export default {
    query: (text, params) => pool.query(text, params),
};
