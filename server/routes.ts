import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // AI provider proxy endpoints
  app.post('/api/ai/deepseek', async (req, res, next) => {
    try {
      const { callDeepSeek } = await import('./providers/deepseek');
      const payload = req.body as any;
      // Validate minimum payload
      if (!payload || !payload.messages) {
        return res.status(400).json({ message: 'messages required' });
      }
      const out = await callDeepSeek({ model: payload.model, messages: payload.messages });
      res.json(out);
    } catch (err: any) {
      next(err);
    }
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  return httpServer;
}
