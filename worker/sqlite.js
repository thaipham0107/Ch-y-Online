// Bộ chuyển SQLite của Durable Object về giao diện giống node:sqlite (prepare().get/all/run, exec, tx).
export function makeDb(ctx) {
  const sql = ctx.storage.sql;
  const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : typeof v === 'bigint' ? Number(v) : v));
  const run = (text, params) => sql.exec(text, ...norm(params));
  return {
    exec(text) { run(text, []).toArray(); },
    prepare(text) {
      return {
        get: (...p) => run(text, p).toArray()[0],
        all: (...p) => run(text, p).toArray(),
        run: (...p) => {
          const cur = run(text, p); cur.toArray();
          const ins = /^\s*(INSERT|REPLACE)/i.test(text);
          return { changes: cur.rowsWritten, lastInsertRowid: ins ? sql.exec('SELECT last_insert_rowid() AS id').one().id : 0 };
        },
      };
    },
    tx(fn) { return ctx.storage.transactionSync(fn); },
  };
}
