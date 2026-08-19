const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function pad(value) { return String(value).padStart(2, '0'); }
function stamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function backupRoot() {
  return path.resolve(process.env.KTC_BACKUP_DIR || path.join(os.homedir(), 'Documents', 'KTC', 'Backup', 'Database'));
}
function backupFileName(date = new Date(), encrypted = false) { return `ktc-db-${stamp(date)}.jsonl.gz${encrypted ? '.enc' : ''}`; }
function parseBackupDate(fileName) {
  const match = String(fileName).match(/^ktc-db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.jsonl\.gz(?:\.enc)?$/);
  if (!match) return null;
  const [, y,m,d,h,mi,s] = match;
  const value = new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(value.getTime()) ? null : value;
}
function mondayKey(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay()+6)%7;
  copy.setDate(copy.getDate()-day);
  return `${copy.getFullYear()}-${pad(copy.getMonth()+1)}-${pad(copy.getDate())}`;
}
function dayKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function pruneRetention(root, { daily = 14, weekly = 8, monthly = 12 } = {}) {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  const backups = entries.filter((e) => e.isFile()).map((e) => ({ name:e.name, date:parseBackupDate(e.name) })).filter((x) => x.date).sort((a,b) => b.date-a.date);
  const keep = new Set();
  const keepBy = (keyFn, limit) => {
    const seen = new Set();
    for (const item of backups) {
      const key = keyFn(item.date);
      if (seen.has(key)) continue;
      if (seen.size >= limit) continue;
      seen.add(key); keep.add(item.name);
    }
  };
  keepBy(dayKey, daily); keepBy(mondayKey, weekly); keepBy(monthKey, monthly);
  const removed=[];
  for (const item of backups) {
    if (keep.has(item.name)) continue;
    await fsp.rm(path.join(root,item.name),{force:true});
    await fsp.rm(path.join(root,`${item.name}.sha256`),{force:true});
    await fsp.rm(path.join(root,`${item.name}.manifest.json`),{force:true});
    await fsp.rm(path.join(root,`${item.name}.crypto.json`),{force:true});
    removed.push(item.name);
  }
  return { total:backups.length, kept:keep.size, removed };
}

module.exports={backupRoot,backupFileName,sha256File,pruneRetention,stamp};
