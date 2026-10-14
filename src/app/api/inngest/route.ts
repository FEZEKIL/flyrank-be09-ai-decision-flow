import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { executeWorkflow } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executeWorkflow],
});
