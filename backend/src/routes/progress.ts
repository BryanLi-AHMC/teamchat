import { Router } from "express";

type ProgressUpdate = {
  id: string;
  person: string;
  completed: string;
  workingOn: string;
  blockers: string;
};

const progressUpdates: ProgressUpdate[] = [
  {
    id: "prog-1",
    person: "System",
    completed: "Uploaded intake QA checklist",
    workingOn: "Preparing morning handoff template",
    blockers: "Waiting on policy clarification",
  },
];

export const progressRouter = Router();

progressRouter.get("/", (_req, res) => {
  res.json({ data: progressUpdates });
});

progressRouter.post("/", (req, res) => {
  const person = typeof req.body?.person === "string" ? req.body.person.trim() : "";
  const completed =
    typeof req.body?.completed === "string" ? req.body.completed.trim() : "";
  const workingOn =
    typeof req.body?.workingOn === "string" ? req.body.workingOn.trim() : "";
  const blockers =
    typeof req.body?.blockers === "string" ? req.body.blockers.trim() : "";

  if (!person || !completed || !workingOn) {
    res
      .status(400)
      .json({ error: "person, completed, and workingOn are required" });
    return;
  }

  const created: ProgressUpdate = {
    id: `prog-${progressUpdates.length + 1}`,
    person,
    completed,
    workingOn,
    blockers,
  };
  progressUpdates.push(created);

  res.status(201).json({ data: created });
});
