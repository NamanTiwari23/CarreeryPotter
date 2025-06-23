// lib/inngest/client.js
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "career-coach", // Use your preferred unique ID
  name: "Career Coach",
  credentials: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
    },
  },
});
