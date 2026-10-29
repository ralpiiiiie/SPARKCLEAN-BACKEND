import { pool } from "../db/client.js";

/**
 * Generates the next business ID (e.g. CUS000151) for tables that keep the
 * frontend's human-readable identifiers. Identifiers come from internal
 * constants only, never from request input.
 */
export async function nextId(
  table: string,
  column: string,
  prefix: string,
  pad: number,
): Promise<string> {
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
    throw new Error("Invalid identifier for ID generation");
  }
  const result = await pool.query<{ next: number }>(
    `select coalesce(max(cast(substring("${column}" from ${prefix.length + 1}) as integer)), 0) + 1 as next
       from "${table}"
      where "${column}" like $1`,
    [`${prefix}%`],
  );
  return `${prefix}${String(result.rows[0].next).padStart(pad, "0")}`;
}
