/** Shared response schema between the AI backend and the chat UI. */

export type MetricFormat = "currency" | "number" | "percent";

export interface KpiSpec {
  label: string;
  value: number;
  format: MetricFormat;
  delta?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "neutral";
  caption?: string;
}

export interface ChartSeriesSpec {
  key: string;
  label: string;
}

export interface ChartSpec {
  type: "bar" | "line" | "area" | "doughnut" | "comparison";
  title: string;
  subtitle?: string;
  xKey: string;
  series: ChartSeriesSpec[];
  data: Array<Record<string, string | number>>;
  valueFormat: "currency" | "number";
}

export interface TableColumnSpec {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: MetricFormat;
}

export interface TableSpec {
  title: string;
  columns: TableColumnSpec[];
  rows: Array<Record<string, string | number>>;
}

export interface RangeSpec {
  start: string;
  end: string;
  label: string;
  note: string;
}

export interface AiAnswer {
  answer: string;
  kpis: KpiSpec[];
  table: TableSpec | null;
  chart: ChartSpec | null;
  range: RangeSpec | null;
  followups: string[];
  meta: {
    topic: string;
    provider: string;
    model: string;
    degraded: boolean;
    durationMs: number;
    dataBounds: { min: string; max: string; latestMonthLabel: string };
    grounding: string[];
  };
}

export interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: unknown;
  createdAt: string;
}