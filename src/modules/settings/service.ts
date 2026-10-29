import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { appSettings } from "../../db/schema/index.js";
import { toNumber } from "../../utils/numbers.js";
import type { settingsUpdateSchema } from "./validation.js";

const serialize = (row: typeof appSettings.$inferSelect) => ({
  id: row.id,
  rushCostPerLoad: toNumber(row.rushCostPerLoad),
  storageCostPerLoad: toNumber(row.storageCostPerLoad),
  currency: row.currency,
  units: row.units,
  validationMonths: row.validationMonths,
});

export async function getSettings() {
  const [row] = await db.select().from(appSettings).orderBy(appSettings.id).limit(1);
  if (!row) {
    const [created] = await db.insert(appSettings).values({}).returning();
    return serialize(created);
  }
  return serialize(row);
}

export async function updateSettings(input: z.infer<typeof settingsUpdateSchema>) {
  const current = await getSettings();
  const { rushCostPerLoad, storageCostPerLoad, ...rest } = input;
  const [row] = await db
    .update(appSettings)
    .set({
      ...rest,
      ...(rushCostPerLoad !== undefined
        ? { rushCostPerLoad: String(rushCostPerLoad) }
        : {}),
      ...(storageCostPerLoad !== undefined
        ? { storageCostPerLoad: String(storageCostPerLoad) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, current.id))
    .returning();
  return serialize(row);
}
