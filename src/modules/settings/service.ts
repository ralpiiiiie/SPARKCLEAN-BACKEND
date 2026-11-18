import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { appSettings } from "../../db/schema/index.js";
import type { settingsUpdateSchema } from "./validation.js";

const serialize = (row: typeof appSettings.$inferSelect) => ({
  id: row.id,
  currency: row.currency,
  machineHoursDefault: row.machineHoursDefault,
  datasetLabel: row.datasetLabel,
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
  const [row] = await db
    .update(appSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(appSettings.id, current.id))
    .returning();
  return serialize(row);
}
