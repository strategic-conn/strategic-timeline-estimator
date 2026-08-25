/**
 * Every mutating call this app is allowed to make against Zoho CRM.
 *
 * The OAuth grant is deliberately broader than this list: one consent covering
 * create/update across the CRM, so shipping a new integration never needs an
 * admin to re-approve. That trade only holds if the real limit lives somewhere
 * reviewable — here, in code, next to a test — rather than in a scope string
 * someone approved months ago and nobody can see.
 *
 * Rules:
 *  - GET is always allowed (the grant is read-broad by design).
 *  - Anything else must match a rule below, or `zohoFetch` throws before the
 *    request is made.
 *  - DELETE is not grantable to this app at all: no `.DELETE` scope is ever
 *    requested, and no rule here permits it. A deleted CRM record has no undo.
 *
 * Adding a write means adding a line here — which is the point. It shows up in
 * review as "this app now writes X", instead of being invisible.
 */
export type WriteRule = {
  method: "POST" | "PUT" | "PATCH";
  path: RegExp;
  /** Plain-language description, used in the refusal message. */
  what: string;
};

/** `/crm/v2/…`, `/crm/v2.1/…`, `/crm/v3/…` — version is not the security boundary. */
const V = String.raw`\/crm\/v\d+(?:\.\d+)?`;
/** Zoho record ids are long numeric strings. */
const ID = String.raw`\d+`;

export const WRITE_ALLOWLIST: WriteRule[] = [
  {
    method: "POST",
    path: new RegExp(`^${V}\\/Deals$`),
    what: "create a deal",
  },
  {
    method: "PUT",
    path: new RegExp(`^${V}\\/Deals\\/${ID}$`),
    what: "move a deal's stage",
  },
  {
    method: "POST",
    path: new RegExp(`^${V}\\/Deals\\/${ID}\\/Attachments$`),
    what: "attach a file to a deal",
  },
];

/** Path without its query string — rules match the resource, not the params. */
export function normalizePath(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "");
}

export function isWriteAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  const p = normalizePath(path);
  return WRITE_ALLOWLIST.some((r) => r.method === m && r.path.test(p));
}

/** Throws unless the call is one of the writes this app is meant to make. */
export function assertWriteAllowed(method: string, path: string): void {
  if (isWriteAllowed(method, path)) return;
  throw new Error(
    `Blocked: this app may not ${method.toUpperCase()} ${normalizePath(path)}. ` +
      `Allowed writes: ${WRITE_ALLOWLIST.map((r) => r.what).join(", ")}.`,
  );
}
