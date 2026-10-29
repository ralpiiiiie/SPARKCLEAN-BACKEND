import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, deliveryCosts, plants } from "../../db/schema/index.js";
import type { z } from "zod";
import type {
  deliveryCostCreateSchema,
  deliveryCostQuerySchema,
} from "./validation.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";

type CostQuery = z.infer<typeof deliveryCostQuerySchema>;

const baseQuery = () =>
  db
    .select({
      id: deliveryCosts.id,
      plant: plants.name,
      plantId: deliveryCosts.plantId,
      branch: branches.name,
      branchId: deliveryCosts.branchId,
      costPerLoad: deliveryCosts.costPerLoad,
      distanceKm: deliveryCosts.distanceKm,
    })
    .from(deliveryCosts)
    .innerJoin(plants, eq(deliveryCosts.plantId, plants.id))
    .innerJoin(branches, eq(deliveryCosts.branchId, branches.id));

type CostRow = Awaited<ReturnType<typeof baseQuery>>[number];

const serialize = (row: CostRow) => ({ ...row, costPerLoad: toNumber(row.costPerLoad) });

export async function listDeliveryCosts(query: CostQuery) {
  const conditions: SQL[] = [];
  if (query.plantId) conditions.push(eq(deliveryCosts.plantId, query.plantId));
  if (query.branchId) conditions.push(eq(deliveryCosts.branchId, query.branchId));
  if (query.search) {
    conditions.push(
      or(
        ilike(plants.name, `%${query.search}%`),
        ilike(branches.name, `%${query.search}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await baseQuery()
    .where(where)
    .orderBy(asc(plants.name), asc(branches.name));
  return rows.map(serialize);
}

export async function getDeliveryCost(id: number) {
  const [row] = await baseQuery().where(eq(deliveryCosts.id, id));
  if (!row) throw ApiError.notFound("Delivery cost not found");
  return serialize(row);
}

export async function createDeliveryCost(input: z.infer<typeof deliveryCostCreateSchema>) {
  const [row] = await db
    .insert(deliveryCosts)
    .values({ ...input, costPerLoad: String(input.costPerLoad) })
    .onConflictDoUpdate({
      target: [deliveryCosts.plantId, deliveryCosts.branchId],
      set: {
        costPerLoad: String(input.costPerLoad),
        distanceKm: input.distanceKm,
        updatedAt: new Date(),
      },
    })
    .returning({ id: deliveryCosts.id });
  return getDeliveryCost(row.id);
}

export async function updateDeliveryCost(
  id: number,
  patch: Partial<z.infer<typeof deliveryCostCreateSchema>>,
) {
  const { costPerLoad, ...rest } = patch;
  const values = {
    ...rest,
    ...(costPerLoad !== undefined ? { costPerLoad: String(costPerLoad) } : {}),
    updatedAt: new Date(),
  };
  const [updated] = await db
    .update(deliveryCosts)
    .set(values)
    .where(eq(deliveryCosts.id, id))
    .returning({ id: deliveryCosts.id });
  if (!updated) throw ApiError.notFound("Delivery cost not found");
  return getDeliveryCost(id);
}

export async function deleteDeliveryCost(id: number) {
  const [deleted] = await db
    .delete(deliveryCosts)
    .where(eq(deliveryCosts.id, id))
    .returning({ id: deliveryCosts.id });
  if (!deleted) throw ApiError.notFound("Delivery cost not found");
  return { id: deleted.id, deleted: true };
}
