import type { Request, Response } from "express";
import { ask, deleteConversation, getConversation, listConversations } from "./service.js";
import type { ChatInput } from "./validation.js";

export async function chat(req: Request, res: Response) {
  const body = req.valid.body as ChatInput;
  const result = await ask({
    adminId: req.user!.id,
    message: body.message,
    conversationId: body.conversationId,
    pageContext: body.pageContext,
    role: req.user!.role,
    branchId: req.user!.branchId,
    branchName: req.user!.branchName,
  });
  res.json({ data: result });
}

export async function conversations(req: Request, res: Response) {
  const rows = await listConversations(req.user!.id);
  res.json({ data: rows });
}

export async function conversation(req: Request, res: Response) {
  const { id } = req.valid.params as { id: number };
  const messages = await getConversation(req.user!.id, id);
  res.json({ data: { id, messages } });
}

export async function removeConversation(req: Request, res: Response) {
  const { id } = req.valid.params as { id: number };
  await deleteConversation(req.user!.id, id);
  res.status(204).end();
}