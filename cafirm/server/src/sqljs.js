/**
 * SQLite-in-WebAssembly driver (sql.js) with the same API as Node's built-in DatabaseSync,
 * so the route code works unchanged. The whole database lives in memory and can be exported as bytes.
 */
import initSqlJs from 'sql.js';

export async function openSqlJs(bytes, wasmBinary) {
  const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : undefined);
  const d = new SQL.Database(bytes || undefined);
  let dirty = false;
  const norm = (args) => args.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  const query = (sql, args, one) => {
    const st = d.prepare(sql);
    try {
      st.bind(norm(args));
      if (one) return st.step() ? st.getAsObject() : undefined;
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  };
  return {
    exec(sql) {
      d.exec(sql);
      if (!/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|PRAGMA)/i.test(sql)) dirty = true;
    },
    prepare(sql) {
      return {
        get: (...a) => query(sql, a, true),
        all: (...a) => query(sql, a, false),
        run: (...a) => {
          d.run(sql, norm(a));
          const changes = d.getRowsModified();
          if (changes) dirty = true;
          const lastInsertRowid = d.exec('SELECT last_insert_rowid()')[0].values[0][0];
          return { changes, lastInsertRowid };
        },
      };
    },
    /** Database file contents (Uint8Array). */
    export() { const out = d.export(); d.exec('PRAGMA foreign_keys = ON;'); return out; },
    get dirty() { return dirty; },
    clean() { dirty = false; },
  };
}
