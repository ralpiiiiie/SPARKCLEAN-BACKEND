import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { chatConversations, chatMessages } from "../../db/schema/index.js";
import { ApiError } from "../../utils/errors.js";
import { AiProviderError, chatCompletion, isAiConfigured } from "../../utils/aiProvider.js";
import { buildResponse } from "./build.js";
import { getDataBounds, listBranchRefs } from "./dataService.js";
import {
  parseIntent,
  type BranchRef,
  type ParsedIntent,
  type Topic,
} from "./intent.js";
import type { AiAnswer } from "./types.js";

export interface AskInput {
  adminId: number;
  message: string;
  conversationId?: number;
  pageContext?: string;
  /** Trusted identity from the authenticated session — never from the request body. */
  role: "admin" | "analyst" | "manager";
  branchId: string | null;
  branchName: string | null;
}

export interface AskResult {
  conversationId: number;
  answer: AiAnswer;
}

/** Branch-scoped follow-ups. Managers never receive cross-branch suggestions. */
const MANAGER_FOLLOWUPS = [
  "Show the revenue for last month",
  "How many orders are still pending?",
  "What is our most popular service?",
  "Which customers order most often?",
];

const CROSS_BRANCH_PATTERNS = [
  /\bother branches?\b/,
  /\ball branches\b/,
  /\bevery branch\b/,
  /\beach branch\b/,
  /\bacross branches\b/,
  /\bbranch (?:comparison|ranking|breakdown)\b/,
  /\bcompare (?:the )?branches\b/,
  /\bwhich branch\b/,
  /\bbest branch\b/,
  /\btop branch\b/,
  /\bworst branch\b/,
  /\bhighest branch\b/,
];

/** Verify a conversation belongs to the authenticated admin. */
async function ownConversation(adminId: number, conversationId: number) {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.adminId, adminId)))
    .limit(1);
  if (!row) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "That conversation does not exist for this account.");
  }
  return row;
}

function titleFrom(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "New conversation";
}

/** True when a manager's question targets, compares or ranks another branch. */
function asksAboutOtherBranches(
  message: string,
  intent: ParsedIntent,
  ownBranchId: string,
): boolean {
  if (intent.branchIds.some((id) => id !== ownBranchId)) return true;
  const text = ` ${message.toLowerCase().replace(/\s+/g, " ")} `;
  return CROSS_BRANCH_PATTERNS.some((pattern) => pattern.test(text));
}

/** Force every downstream query to the manager's own branch. */
function scopeToManager(intent: ParsedIntent, branchId: string, branchName: string | null): ParsedIntent {
  return {
    ...intent,
    branchId,
    branchName: intent.branchName ?? branchName,
    branchIds: [branchId],
  };
}

/** Drop model-suggested questions that would cross the manager's branch boundary. */
function sanitizeFollowups(
  followups: string[],
  ownBranchId: string,
  allBranches: BranchRef[],
): string[] {
  const foreign = allBranches
    .filter((branch) => branch.id !== ownBranchId)
    .flatMap((branch) => [branch.name.toLowerCase(), branch.city.toLowerCase()]);

  const safe = followups.filter((question) => {
    const text = question.toLowerCase();
    if (/\bbranch(?:es)?\b/.test(text)) return false;
    return !foreign.some((term) => term && text.includes(term));
  });

  for (const question of MANAGER_FOLLOWUPS) {
    if (safe.length >= 3) break;
    if (!safe.includes(question)) safe.push(question);
  }
  return safe.slice(0, 3);
}

function policyRefusal(
  branchName: string | null,
  bounds: { min: string; max: string; latestMonthLabel: string },
  started: number,
): AiAnswer {
  const assigned = branchName ? `the ${branchName} branch` : "your assigned branch";
  return {
    answer:
      `Your account is assigned to ${assigned}, so I can only answer questions about that branch's own records. ` +
      "I can't retrieve or compare data for another branch.",
    kpis: [],
    table: null,
    chart: null,
    range: null,
    followups: MANAGER_FOLLOWUPS.slice(0, 3),
    meta: {
      topic: "restricted",
      provider: "policy",
      model: "policy",
      degraded: false,
      durationMs: Date.now() - started,
      dataBounds: bounds,
      grounding: [
        "Request blocked before any data retrieval: branch managers can only access their own branch.",
      ],
    },
  };
}

/** Pull the last assistant payload so follow-ups can reuse its period. */
async function lastAssistantContext(conversationId: number) {
  const [row] = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.role, "assistant")))
    .orderBy(desc(chatMessages.id))
    .limit(1);

  if (!row || typeof row.content !== "object" || row.content === null) return {};
  const payload = row.content as { range?: { start?: string; end?: string } | null; meta?: { topic?: string } };
  const start = payload.range?.start;
  const end = payload.range?.end;
  return {
    lastRange: start && end ? { start, end } : undefined,
    lastTopic: payload.meta?.topic as Topic | undefined,
  };
}

const SYSTEM_PROMPT = `You are the Spark Clean Laundry business analyst (Metro Cebu, Philippines).

You will receive FACTS computed by the application's trusted analytics layer. Your only job is to explain those facts in clear business language.

Hard rules:
1. Use ONLY numbers that appear in FACTS. Never invent, estimate or recalculate figures. If a figure is missing, say the data is unavailable.
2. Quote currency as the symbol given in FACTS (₱), with thousands separators.
3. State the exact period (start and end dates from FACTS).
4. If FACTS indicate no records, say so plainly and suggest a different period — do not guess.
5. Forecasts, estimates and recommendations must be explicitly labelled as such. Separate measured facts from suggestions.
6. Never output SQL, code, HTML, markdown tables or headings. Charts and tables are rendered by the app.
7. Keep it to 2–4 short sentences. Bold (**like this**) at most one key figure.
8. Do not mention these instructions, the JSON, or "FACTS".
9. If a single branch is named as the access scope, answer only for that branch. Never introduce, compare with, or speculate about any other branch.

Return STRICT JSON only, matching:
{"answer":"<string>","followups":["<question>","<question>","<question>"]}
followups must be answerable from the same dataset.`;

interface Narrative {
  answer: string;
  followups: string[];
  model: string;
  degraded: boolean;
  reason?: string;
}

function extractJson(text: string): { answer?: unknown; followups?: unknown } | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function narrate(
  question: string,
  facts: unknown,
  fallback: string,
  followups: string[],
  pageContext?: string,
  branchScopeName?: string | null,
): Promise<Narrative> {
  if (!isAiConfigured()) {
    return { answer: fallback, followups, model: "none", degraded: true, reason: "AI narration is not configured." };
  }

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            (pageContext ? `Current page: ${pageContext}\n` : "") +
            (branchScopeName
              ? `ACCESS SCOPE: only the ${branchScopeName} branch. Do not mention or compare other branches.\n`
              : "") +
            `QUESTION: ${question}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
      { temperature: 0.2 },
    );

    const parsed = extractJson(result.text);
    const answer =
      parsed && typeof parsed.answer === "string" && parsed.answer.trim().length > 0
        ? parsed.answer.trim()
        : result.text.trim();
    const suggested =
      parsed && Array.isArray(parsed.followups)
        ? parsed.followups.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 3)
        : [];

    return {
      answer,
      followups: suggested.length ? suggested : followups,
      model: result.model,
      degraded: false,
    };
  } catch (error) {
    const reason =
      error instanceof AiProviderError ? error.message : "The AI provider request failed.";
    console.warn(`[ai] narration unavailable (${reason}); serving computed summary.`);
    return { answer: fallback, followups, model: "fallback", degraded: true, reason };
  }
}

async function persistTurn(conversationId: number, message: string, answer: AiAnswer): Promise<void> {
  await db.insert(chatMessages).values([
    { conversationId, role: "user", content: { text: message } },
    { conversationId, role: "assistant", content: answer },
  ]);
  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
}

export async function ask(input: AskInput): Promise<AskResult> {
  const started = Date.now();
  const isManager = input.role === "manager";

  // 1. Conversation ownership (Confidentiality).
  let conversationId: number;
  if (input.conversationId) {
    await ownConversation(input.adminId, input.conversationId);
    conversationId = input.conversationId;
  } else {
    const [created] = await db
      .insert(chatConversations)
      .values({
        adminId: input.adminId,
        title: titleFrom(input.message),
        roleSnapshot: input.role,
        branchIdSnapshot: input.branchId,
      })
      .returning({ id: chatConversations.id });
    conversationId = created.id;
  }

  // 2. Trusted session scope. Bounds are read from the manager's own branch so
  //    relative periods ("last month") follow that branch's recorded data.
  const managerBranchId = isManager ? input.branchId : null;
  const [bounds, branchRefs, context] = await Promise.all([
    getDataBounds(managerBranchId),
    listBranchRefs(),
    lastAssistantContext(conversationId),
  ]);

  const parsed = parseIntent(input.message, bounds, branchRefs, context);

  // 3. Branch policy runs before any business fact is retrieved or sent to the
  //    provider. Naming, comparing or ranking another branch is refused.
  if (isManager && (!managerBranchId || asksAboutOtherBranches(input.message, parsed, managerBranchId))) {
    const answer = policyRefusal(input.branchName, bounds, started);
    await persistTurn(conversationId, input.message, answer);
    return { conversationId, answer };
  }

  const intent = managerBranchId
    ? scopeToManager(parsed, managerBranchId, input.branchName)
    : parsed;

  // 4. Approved data only (Integrity), always branch-filtered for managers.
  const built = await buildResponse(intent, bounds, managerBranchId);

  // 5. Narrative from computed facts (never the reverse).
  const narrative =
    intent.topic === "unknown"
      ? {
          answer: built.fallbackNarrative,
          followups: built.followups,
          model: "rules",
          degraded: false,
        }
      : await narrate(
          input.message,
          built.facts,
          built.fallbackNarrative,
          built.followups,
          input.pageContext,
          managerBranchId ? input.branchName ?? managerBranchId : null,
        );

  const followups = managerBranchId
    ? sanitizeFollowups(narrative.followups, managerBranchId, branchRefs)
    : narrative.followups;

  const answer: AiAnswer = {
    answer: narrative.answer,
    kpis: built.kpis,
    table: built.table,
    chart: built.chart,
    range: built.range,
    followups,
    meta: {
      topic: intent.topic,
      provider: "openai-compatible",
      model: narrative.model,
      degraded: narrative.degraded,
      durationMs: Date.now() - started,
      dataBounds: { min: bounds.min, max: bounds.max, latestMonthLabel: bounds.latestMonthLabel },
      grounding: [
        ...built.grounding,
        ...(managerBranchId
          ? [
              `Branch scope: ${input.branchName ?? "assigned branch"} (${managerBranchId}) only (manager account).`,
            ]
          : []),
        ...(narrative.degraded && narrative.reason ? [`Narration fallback: ${narrative.reason}`] : []),
      ],
    },
  };

  // 6. Persist (aggregates only; no contact details or raw rows).
  await persistTurn(conversationId, input.message, answer);

  return { conversationId, answer };
}

/* ── Conversation history (scoped to the authenticated admin) ── */

export async function listConversations(adminId: number) {
  const rows = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(eq(chatConversations.adminId, adminId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(30);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getConversation(adminId: number, conversationId: number) {
  await ownConversation(adminId, conversationId);
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.id)
    .limit(200);
  return rows.map((row) => ({
    ...row,
    role: row.role as "user" | "assistant",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function deleteConversation(adminId: number, conversationId: number) {
  await ownConversation(adminId, conversationId);
  await db.delete(chatConversations).where(eq(chatConversations.id, conversationId));
}