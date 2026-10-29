import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { analystNotes, branches } from "../../db/schema/index.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import type { noteCreateSchema, noteQuerySchema } from "./notes.validation.js";

type NoteQuery = z.infer<typeof noteQuerySchema>;

const baseQuery = () =>
  db
    .select({
      id: analystNotes.id,
      page: analystNotes.page,
      branchId: analystNotes.branchId,
      branch: branches.name,
      title: analystNotes.title,
      body: analystNotes.body,
      tag: analystNotes.tag,
      pinned: analystNotes.pinned,
      author: analystNotes.author,
      createdAt: analystNotes.createdAt,
      updatedAt: analystNotes.updatedAt,
    })
    .from(analystNotes)
    .leftJoin(branches, eq(analystNotes.branchId, branches.id));

export async function listNotes(query: NoteQuery) {
  const conditions: SQL[] = [];
  if (query.pageName) conditions.push(eq(analystNotes.page, query.pageName));
  if (query.branchId) conditions.push(eq(analystNotes.branchId, query.branchId));
  if (query.pinned !== undefined) conditions.push(eq(analystNotes.pinned, query.pinned));
  if (query.search) {
    conditions.push(
      or(
        ilike(analystNotes.title, `%${query.search}%`),
        ilike(analystNotes.body, `%${query.search}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    query.sort === "title"
      ? analystNotes.title
      : query.sort === "updatedAt"
        ? analystNotes.updatedAt
        : analystNotes.createdAt;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(desc(analystNotes.pinned), query.order === "asc" ? asc(column) : desc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(analystNotes).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getNote(id: number) {
  const [row] = await baseQuery().where(eq(analystNotes.id, id));
  if (!row) throw ApiError.notFound("Note not found");
  return row;
}

export async function createNote(input: z.infer<typeof noteCreateSchema>) {
  const [created] = await db
    .insert(analystNotes)
    .values(input)
    .returning({ id: analystNotes.id });
  return getNote(created.id);
}

export async function updateNote(
  id: number,
  patch: Partial<z.infer<typeof noteCreateSchema>>,
) {
  const [updated] = await db
    .update(analystNotes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(analystNotes.id, id))
    .returning({ id: analystNotes.id });
  if (!updated) throw ApiError.notFound("Note not found");
  return getNote(id);
}

export async function deleteNote(id: number) {
  const [deleted] = await db
    .delete(analystNotes)
    .where(eq(analystNotes.id, id))
    .returning({ id: analystNotes.id });
  if (!deleted) throw ApiError.notFound("Note not found");
  return { id: deleted.id, deleted: true };
}
