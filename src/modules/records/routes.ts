import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { textIdParamSchema } from "../../utils/params.js";
import * as service from "./service.js";
import {
  customerCreateSchema,
  customerQuerySchema,
  customerUpdateSchema,
  machineUsageCreateSchema,
  machineUsageQuerySchema,
  machineUsageUpdateSchema,
  marketingCreateSchema,
  marketingQuerySchema,
  marketingUpdateSchema,
  orderCreateSchema,
  orderQuerySchema,
  orderUpdateSchema,
  paymentCreateSchema,
  paymentQuerySchema,
  paymentUpdateSchema,
  serviceCreateSchema,
  serviceQuerySchema,
  serviceUpdateSchema,
} from "./validation.js";

const idOf = (req: Request): string => (req.valid.params as { id: string }).id;
const writer = requireRole("admin", "analyst");

function crudRouter<TQuery extends z.ZodType, TCreate extends z.ZodType, TUpdate extends z.ZodType>(config: {
  list: (query: z.infer<TQuery>) => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
  create: (input: z.infer<TCreate>) => Promise<unknown>;
  update: (id: string, input: z.infer<TUpdate>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  query: TQuery;
  createSchema: TCreate;
  updateSchema: TUpdate;
}) {
  const router = Router();

  router.get(
    "/",
    validate({ query: config.query }),
    async (req: Request, res: Response) => {
      res.json(await config.list(req.valid.query as z.infer<TQuery>));
    },
  );

  router.get(
    "/:id",
    validate({ params: textIdParamSchema }),
    async (req: Request, res: Response) => {
      res.json({ data: await config.get(idOf(req)) });
    },
  );

  router.post(
    "/",
    writer,
    validate({ body: config.createSchema }),
    async (req: Request, res: Response) => {
      res.status(201).json({ data: await config.create(req.valid.body as z.infer<TCreate>) });
    },
  );

  router.patch(
    "/:id",
    writer,
    validate({ params: textIdParamSchema, body: config.updateSchema }),
    async (req: Request, res: Response) => {
      res.json({ data: await config.update(idOf(req), req.valid.body as z.infer<TUpdate>) });
    },
  );

  router.delete(
    "/:id",
    writer,
    validate({ params: textIdParamSchema }),
    async (req: Request, res: Response) => {
      res.json(await config.remove(idOf(req)));
    },
  );

  return router;
}

export const customersRouter = crudRouter({
  list: service.listCustomers,
  get: service.getCustomer,
  create: service.createCustomer,
  update: service.updateCustomer,
  remove: service.deleteCustomer,
  query: customerQuerySchema,
  createSchema: customerCreateSchema,
  updateSchema: customerUpdateSchema,
});

export const servicesRouter = crudRouter({
  list: service.listServices,
  get: service.getService,
  create: service.createService,
  update: service.updateService,
  remove: service.deleteService,
  query: serviceQuerySchema,
  createSchema: serviceCreateSchema,
  updateSchema: serviceUpdateSchema,
});

export const ordersRouter = crudRouter({
  list: service.listOrders,
  get: service.getOrder,
  create: service.createOrder,
  update: service.updateOrder,
  remove: service.deleteOrder,
  query: orderQuerySchema,
  createSchema: orderCreateSchema,
  updateSchema: orderUpdateSchema,
});

export const paymentsRouter = crudRouter({
  list: service.listPayments,
  get: service.getPayment,
  create: service.createPayment,
  update: service.updatePayment,
  remove: service.deletePayment,
  query: paymentQuerySchema,
  createSchema: paymentCreateSchema,
  updateSchema: paymentUpdateSchema,
});

export const machineUsageRouter = crudRouter({
  list: service.listMachineUsage,
  get: service.getMachineUsage,
  create: service.createMachineUsage,
  update: service.updateMachineUsage,
  remove: service.deleteMachineUsage,
  query: machineUsageQuerySchema,
  createSchema: machineUsageCreateSchema,
  updateSchema: machineUsageUpdateSchema,
});

export const marketingRouter = crudRouter({
  list: service.listMarketing,
  get: service.getCampaign,
  create: service.createCampaign,
  update: service.updateCampaign,
  remove: service.deleteCampaign,
  query: marketingQuerySchema,
  createSchema: marketingCreateSchema,
  updateSchema: marketingUpdateSchema,
});
