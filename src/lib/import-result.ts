export type ImportAction = "create" | "update" | "unchanged";
export type ImportRow = { sheet?: string; row: number; code: string; action: ImportAction; changes: string[]; errors: string[] };
export type Removal = { kind: "concept" | "client" | "contact" | "location"; id: string; label: string; outcome: "delete" | "deactivate"; reason: string };
export type ClientDecision = { id: string; label: string; taxId: string; quotes: number; drafts: number };
export type ImportMode = "merge" | "full";
export type ImportOptions = { apply: boolean; mode?: ImportMode; keep?: string[] };
export type ImportResult = {
  error?: string; rows: ImportRow[]; created: number; updated: number; unchanged: number;
  removals: Removal[]; decisions: ClientDecision[]; incompleteKits: { name: string; codes: string[] }[]; applied: boolean;
};
