const fs = require('node:fs/promises');
const path = require('node:path');
const { sha256File } = require('./backup/backupUtils');
async function main(){
  const file=path.resolve(process.argv[2]||'');
  if(!process.argv[2]) throw new Error('Cách dùng: node scripts/verifyDatabaseBackup.js <backup.jsonl.gz>');
  const expectedText=await fs.readFile(`${file}.sha256`,'utf8');
  const expected=expectedText.trim().split(/\s+/)[0];
  const actual=await sha256File(file);
  if(expected!==actual) throw new Error(`Checksum không khớp. expected=${expected} actual=${actual}`);
  const manifest=JSON.parse(await fs.readFile(`${file}.manifest.json`,'utf8'));
  console.log(JSON.stringify({success:true,file,sha256:actual,created_at:manifest.created_at,tables:manifest.tables},null,2));
}
main().catch((e)=>{console.error('[KTC] Backup verify failed:',e.message);process.exitCode=1;});
