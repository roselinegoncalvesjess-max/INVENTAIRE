import pg from "pg";
import { readFile } from "node:fs/promises";

// Les colonnes DATE sont renvoyées telles quelles ("2026-10-08"), sans conversion de fuseau horaire
pg.types.setTypeParser(1082, v => v);
// Les montants NUMERIC sont renvoyés en nombres (et non en texte)
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)));

// La connexion lit PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD depuis le fichier .env
export const pool = new pg.Pool();

export async function initSchema() {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

// Exécute une fonction dans une transaction (BEGIN / COMMIT / ROLLBACK)
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
