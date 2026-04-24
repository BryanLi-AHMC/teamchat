import { Router } from "express";

type Message = {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
};

const messages: Message[] = [
  {
    id: "msg-1",
    senderName: "System",
    body: "Morning check-in complete. Reviewing team priorities.",
    createdAt: new Date().toISOString(),
  },
];

export const messagesRouter = Router();

messagesRouter.get("/", (_req, res) => {
  res.json({ data: messages });
});

messagesRouter.post("/", (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const senderName =
    typeof req.body?.senderName === "string" ? req.body.senderName.trim() : "";

  if (!body || !senderName) {
    res.status(400).json({ error: "senderName and body are required" });
    return;
  }

  const created: Message = {
    id: `msg-${messages.length + 1}`,
    senderName,
    body,
    createdAt: new Date().toISOString(),
  };
  messages.push(created);

  res.status(201).json({ data: created });
});
