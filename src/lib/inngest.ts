import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "branchline-ai-workflows",
  isDev: process.env.NODE_ENV !== "production",
});
