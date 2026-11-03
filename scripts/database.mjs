import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { stays } from '../public/stays.js';

const derive = promisify(scrypt);
const N = 32768, r = 8, p = 3;
export const sessionAge = 7 * 24 * 60 * 60 * 1000;
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N, r, p, maxmem:64*1024*1024 });
  return `scrypt$${N}$${r}$${p}$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  const valid = parts.length === 6 && parts[0] === 'scrypt' && parts[1] === String(N) && parts[2] === String(r) && parts[3] === String(p) && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  const key = await derive(password, valid ? parts[4] : '00000000000000000000000000000000',64,{N,r,p,maxmem:64*1024*1024});
  return timingSafeEqual(key,valid ? Buffer.from(parts[5],'hex') : Buffer.alloc(64)) && valid;
}
export function validCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length=9; length<=10; length++) {
    let sum=0;
    for(let i=0; i<length; i++) sum += Number(cpf[i])*(length+1-i);
    if ((sum*10)%11%10 !== Number(cpf[length])) return false;
  }
  return true;
}
export function openDatabase(databasePath = fileURLToPath(new URL('../database/aori.sqlite3',import.meta.url))) {
  if(databasePath !== ':memory:') mkdirSync(dirname(databasePath),{recursive:true});
  const db=new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;');
    try {
      db.exec(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
      const save=db.prepare('INSERT INTO Hospedagens (ID,Nome,Localidade,Regiao,Valor_Diaria) VALUES (?,?,?,?,?) ON CONFLICT(ID) DO UPDATE SET Nome=excluded.Nome,Localidade=excluded.Localidade,Regiao=excluded.Regiao,Valor_Diaria=excluded.Valor_Diaria');
      for(const stay of stays) save.run(stay.id,stay.name,stay.location,stay.destination,Math.round(stay.price*100));
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    return db;
  } catch(error) { db.close(); throw error; }
}
export function newSession(db,clientId) {
  const token=randomBytes(32).toString('hex');
  db.prepare('DELETE FROM Sessoes_Clientes WHERE Expira_Em<=?').run(Date.now());
  db.prepare('INSERT INTO Sessoes_Clientes (Token_Hash,ID_Cliente,Expira_Em) VALUES (?,?,?)').run(digest(token),clientId,Date.now()+sessionAge);
  return token;
}
