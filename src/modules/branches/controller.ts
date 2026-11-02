import type { Request, Response } from "express";
import type { ListQuery } from "../../utils/params.js";
import { managerBranchId } from "../../middleware/branchScope.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(
    await service.listBranches(req.valid.query as ListQuery, managerBranchId(req)),
  );
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getBranch(id, managerBranchId(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createBranch(req.valid.body as never));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.updateBranch(id, req.valid.body as never));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteBranch(id));
}
