import type { Request, Response } from "express";
import { login as loginService, getMe, listUsers, createUser, logout } from "./service.js";
import type { CreateUserInput } from "./service.js";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.valid.body as { email: string; password: string };
    const result = await loginService(email, password);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === "INVALID_CREDENTIALS") {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: error.message } });
      return;
    }
    throw error;
  }
}

/** Revoke the current session token (all tokens for this account). */
export async function signOut(req: Request, res: Response) {
  await logout(req.user!.id);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const profile = await getMe(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "User account not found." } });
    return;
  }
  res.json({ data: profile });
}

export async function list(req: Request, res: Response) {
  const users = await listUsers();
  res.json({ data: users });
}

export async function create(req: Request, res: Response) {
  const body = req.valid.body as CreateUserInput;
  const user = await createUser(body);
  res.status(201).json({ data: user });
}
