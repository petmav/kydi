/** Runs once per server process; all work happens in the Node.js runtime (src/instrumentation-node.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
