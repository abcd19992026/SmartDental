// Test-only helper (never imported by a deployed function): a recording stand-in for the Supabase
// client. Every `.from(table).a().b()...` chain is recorded as an Op, and awaiting the chain
// resolves to whatever `resolve(op)` returns -- so a test can decide the answer from the table AND
// from the filters the code actually applied (e.g. the cutoff passed to .gte()).

export interface FakeOp {
  table: string;
  ops: Array<[string, unknown[]]>;
}

// deno-lint-ignore no-explicit-any
export type Any = any;

export type FakeResult = { data: unknown; error: unknown };

export function fakeClient(
  resolve: (op: FakeOp) => FakeResult,
  rpcResolve: (name: string, args: unknown) => FakeResult = () => ({ data: null, error: null }),
) {
  const log: FakeOp[] = [];
  const rpcLog: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      const op: FakeOp = { table, ops: [] };
      log.push(op);
      const chain: Any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            const r = resolve(op);
            return (res: (v: unknown) => void) => res(r);
          }
          return (...args: unknown[]) => {
            op.ops.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
    rpc(name: string, args: unknown) {
      rpcLog.push([name, args]);
      return Promise.resolve(rpcResolve(name, args));
    },
  };
  return { client: client as Any, log, rpcLog };
}

/** True if the chain called `method` with exactly these arguments. */
export const has = (op: FakeOp, method: string, ...args: unknown[]) =>
  op.ops.some(([n, a]) => n === method && JSON.stringify(a) === JSON.stringify(args));

/** The first argument of the first call to `method`, or undefined. */
export const firstArg = (op: FakeOp, method: string): unknown => op.ops.find(([n]) => n === method)?.[1][0];

export const calls = (op: FakeOp, method: string) => op.ops.filter(([n]) => n === method);

export const check = (cond: boolean, msg: string) => {
  if (!cond) throw new Error("FAILED: " + msg);
};
