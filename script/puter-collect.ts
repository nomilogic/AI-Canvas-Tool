#!/usr/bin/env tsx
/**
 * Simple collection script to hit Puter with a variety of prompts and
 * save raw responses + parser outputs to attached_assets/puter-corpus.jsonl
 *
 * Usage: PUTER_MODEL=claude-sonnet-4-5 npm run collect:puter
 * Note: Puter calls are client-side billed; running this script may incur cost.
 */
import fs from "fs";
import path from "path";
import callPuterChat from "../client/src/lib/puter-client";
import { parseJsonElementsFromText, parseHtmlElementsFromText } from "../client/src/lib/template-ai";
import { normalizeLayoutTree } from "../client/src/lib/layout-tree";

const OUT = path.resolve(process.cwd(), "attached_assets/puter-corpus.jsonl");

const prompts = [
  "Create a single json element for a rectangle: ```json { \"type\": \"rect\", \"x\": 640, \"y\": 360, \"width\": 100, \"height\": 100, \"fill\": \"#FFFF00\" } ```",
  "Create a blue box centered on the canvas and return only a json array of elements",
  "Return actions object to create a circle at x:50 y:50 radius:40",
  "Provide an HTML snippet with an absolute positioned div: ```html <div style=\"position:absolute;left:10px;top:20px;width:120px;height:80px;background-color:#333;\"></div> ```",
  "Return a nested layout array of two elements [{ \"type\": \"rect\", \"x\": 0, \"y\": 0, \"width\": 100, \"height\": 100 }, { \"type\": \"text\", \"x\": 120, \"y\": 10, \"width\": 200, \"height\": 40, \"text\": \"Hello\" }]",
];

async function run() {
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });

  for (const p of prompts) {
    try {
      console.log("Prompt:", p);
      const resp: any = await callPuterChat(p, { model: process.env.PUTER_MODEL || "claude-sonnet-4-5" });

      const text = resp?.message?.content?.[0]?.text ?? resp?.result?.message?.content?.[0]?.text ?? String(resp ?? "");

      const parsedJson = parseJsonElementsFromText(text, 1280, 720);
      const parsedHtml = parseHtmlElementsFromText(text, 1280, 720);

      const jsonMatch = (text || "").match(/\[[\s\S]*\]/);
      let treeNormalized: any[] = [];
      if (jsonMatch) {
        try {
          const raw = JSON.parse(jsonMatch[0]);
          treeNormalized = normalizeLayoutTree(raw, 1280, 720);
        } catch {}
      }

      const out = {
        ts: new Date().toISOString(),
        prompt: p,
        rawResp: resp,
        extractedText: text,
        parsedJson,
        parsedHtml,
        treeNormalized,
      };

      fs.appendFileSync(OUT, JSON.stringify(out) + "\n");
      console.log("Saved response, parsedJson:", parsedJson.length, "parsedHtml:", parsedHtml.length, "tree:", treeNormalized.length);
      // Be polite / rate-limit
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err: any) {
      console.error("Puter call failed:", err?.message ?? err);
    }
  }

  console.log("Done. Corpus written to", OUT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
