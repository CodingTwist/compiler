// The socket half of the live bridge: one JSON request per line, one reply per line.
import net from "net";

export interface Client {
  /** Sends one request and resolves with its value. Rejects with the agent's own error. */
  send(op: string, args?: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

interface Reply {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Connects to the agent's bridge on `port`. */
export async function connect(port: number): Promise<Client> {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection({ port, host: "127.0.0.1" }, () => resolve(s));
    s.once("error", reject);
  });
  socket.setNoDelay(true);

  const waiting = new Map<number, (r: Reply) => void>();
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (let nl; (nl = buffer.indexOf("\n")) !== -1; buffer = buffer.slice(nl + 1)) {
      const reply = JSON.parse(buffer.slice(0, nl)) as Reply;
      waiting.get(reply.id)?.(reply);
      waiting.delete(reply.id);
    }
  });

  let id = 0;
  // The agent answers one request at a time, so they are queued rather than interleaved.
  let chain: Promise<unknown> = Promise.resolve();
  const settle = (e: Error) => {
    for (const resolve of waiting.values()) resolve({ id: -1, ok: false, error: e.message });
    waiting.clear();
  };
  socket.on("error", settle);
  socket.on("close", () => settle(new Error("the proof agent closed the link")));

  return {
    send(op, args = {}) {
      const run = () =>
        new Promise<unknown>((resolve, reject) => {
          const mine = ++id;
          waiting.set(mine, (r) =>
            r.ok ? resolve(r.value) : reject(new Error(`${op}: ${r.error}`)),
          );
          socket.write(`${JSON.stringify({ id: mine, op, ...args })}\n`);
        });
      chain = chain.then(run, run);
      return chain;
    },
    close: () => void socket.destroy(),
  };
}
