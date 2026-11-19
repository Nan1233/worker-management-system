'use strict';
const mysql = require('mysql2/promise');
const host = process.env.KTC_IT_DB_HOST;
const port = Number(process.env.KTC_IT_DB_PORT || 4000);
const name = process.env.KTC_IT_DB_NAME || '';
if (host !== '127.0.0.1' || port !== 4000 || !/^ktc_it_[a-z0-9_]+$/i.test(name) || process.env.DATABASE_URL) {
  console.error('Refusing acceptance against a non-local or non-disposable database.');
  process.exit(2);
}
(async () => {
  let last;
  for (let i=0;i<75;i++) {
    try {
      const db = await mysql.createConnection({host,port,user:'root',connectTimeout:3000});
      const [[row]] = await db.query('SELECT VERSION() AS version');
      await db.end();
      if (!/tidb/i.test(String(row.version))) throw Error('Unexpected database engine: ' + row.version);
      console.log('Isolated test-only TiDB ready:',row.version,'database:',name);
      return;
    } catch (error) {
      last=error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw last;
})().catch(error => { console.error(error); process.exitCode = 1; });
