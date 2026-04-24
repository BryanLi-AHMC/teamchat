import { Router } from "express";

type Group = {
  id: string;
  name: string;
  description: string;
};

const groups: Group[] = [
  {
    id: "group-1",
    name: "Clinical Ops",
    description: "Operations updates and daily blockers.",
  },
];

export const groupsRouter = Router();

groupsRouter.get("/", (_req, res) => {
  res.json({ data: groups });
});

groupsRouter.post("/", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : "";

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const created: Group = {
    id: `group-${groups.length + 1}`,
    name,
    description,
  };
  groups.push(created);

  res.status(201).json({ data: created });
});
