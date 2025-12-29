// Lightweight helper wrapper for Puter (Claude) usage in the client.
// Uses the global `puter` if available (CDN script), otherwise dynamically imports the
// installed package `@heyputer/puter.js`.

export type PutterChatOptions = {
  model?: string;
  stream?: boolean;
};

export async function callPuterChat(prompt: string, opts: PutterChatOptions = {}) {
  // Prefer window.puter when the CDN script is loaded in index.html (quick dev flow).
  // Otherwise dynamically import the package that we installed via npm.
  // Return the raw response object from puter.

  // @ts-ignore
  const globalPuter = typeof window !== 'undefined' ? (window as any).puter : undefined;
  let puter: any = globalPuter;

  if (!puter) {
    // dynamic import of the npm package
    try {
      const mod = await import('@heyputer/puter.js');
      puter = mod?.default ?? (mod as any)?.puter ?? (globalThis as any).puter;
    } catch (err) {
      throw new Error('Puter not available (CDN or package import failed)');
    }
  }

  if (!puter || !puter.ai?.chat) {
    throw new Error('Puter.ai.chat is not available');
  }

  const response = await puter.ai.chat(prompt, { model: opts.model ?? 'claude-sonnet-4-5', stream: opts.stream });
  return response;
}

export default callPuterChat;
