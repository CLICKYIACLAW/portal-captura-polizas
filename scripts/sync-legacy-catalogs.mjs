import { migrateLegacyCatalogsToDb, readSeed } from '../dist-server/bootstrap.js';

const seed = await readSeed();
await migrateLegacyCatalogsToDb(seed);

console.log('Legacy catalogs synced to MySQL');
