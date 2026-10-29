import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, customers } from "../../db/schema/index.js";
import type { z } from "zod";
import { offsetOf, pageMeta } from "../../utils/params.js";
import type { customerCreateSchema, customerQuerySchema } from "./validation.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";

type CustomerQuery = z.infer<typeof customerQuerySchema>;

const sortable = {
  id: customers.id,
  name: customers.name,
  branch: branches.name,
  joinDate: customers.joinDate,
  loyaltyTier: customers.loyaltyTier,
} as const;

const baseQuery = () =>
  db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      branch: branches.name,
      type: customers.type,
      joinDate: customers.joinDate,
      loyaltyTier: customers.loyaltyTier,
    })
    .from(customers)
    .innerJoin(branches, eq(customers.branchId, branches.id));

export async function listCustomers(query: CustomerQuery) {
  const conditions = [];
  if (query.branchId) conditions.push(eq(customers.branchId, query.branchId));
  if (query.type) conditions.push(eq(customers.type, query.type));
  if (query.loyaltyTier) conditions.push(eq(customers.loyaltyTier, query.loyaltyTier));
  if (query.search) {
    conditions.push(
      or(
        ilike(customers.name, `%${query.search}%`),
        ilike(customers.email, `%${query.search}%`),
        ilike(customers.phone, `%${query.search}%`),
        ilike(customers.address, `%${query.search}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const column = sortable[(query.sort ?? "id") as keyof typeof sortable] ?? customers.id;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(customers).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getCustomer(id: string) {
  const [row] = await baseQuery().where(eq(customers.id, id));
  if (!row) throw ApiError.notFound("Customer not found");
  return row;
}

export async function createCustomer(input: z.infer<typeof customerCreateSchema>) {
  const id = await nextId("customers", "id", "CUS", 4);
  const [created] = await db.insert(customers).values({ ...input, id }).returning();
  return getCustomer(created.id);
}

export async function updateCustomer(
  id: string,
  patch: Partial<z.infer<typeof customerCreateSchema>>,
) {
  const [updated] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
  if (!updated) throw ApiError.notFound("Customer not found");
  return getCustomer(id);
}

export async function deleteCustomer(id: string) {
  const [deleted] = await db
    .delete(customers)
    .where(eq(customers.id, id))
    .returning({ id: customers.id });
  if (!deleted) throw ApiError.notFound("Customer not found");
  return { id: deleted.id, deleted: true };
}
