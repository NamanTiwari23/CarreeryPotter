"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Normalize string for Prisma enum compatibility
const formatEnum = (value) =>
  typeof value === "string"
    ? value.trim().replace(/^"|"$/g, "").toUpperCase()
    : value;

const ALLOWED_DEMAND = ["HIGH", "MEDIUM", "LOW"];
const ALLOWED_OUTLOOK = ["POSITIVE", "NEUTRAL", "NEGATIVE"];

export const generateAIInsights = async (industry) => {
  const prompt = `
    Analyze the current state of the ${industry} industry and provide insights in ONLY the following JSON format without any additional notes or explanations:
    {
      "salaryRanges": [
        { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
      ],
      "growthRate": number,
      "demandLevel": "High" | "Medium" | "Low",
      "topSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
      "marketOutlook": "Positive" | "Neutral" | "Negative",
      "keyTrends": ["trend1", "trend2", "trend3", "trend4", "trend5"],
      "recommendedSkills": ["skill1", "skill2", "skill3", "skill4", "skill5"]
    }

    IMPORTANT: Return ONLY the JSON. No extra text, markdown, or commentary.
  `;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```(?:json)?\n?|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    console.log("✅ Parsed Gemini JSON:", parsed);
    return parsed;
  } catch (e) {
    console.error("❌ Failed to parse Gemini JSON:", text);
    throw new Error("Invalid JSON format from Gemini response.");
  }
};

export async function getIndustryInsights() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      industryInsight: true,
    },
  });

  if (!user) throw new Error("User not found");

  if (!user.industryInsight) {
    console.log("ℹ️ No existing insight found. Generating new insights...");

    const insights = await generateAIInsights(user.industry);

    const formattedInsights = {
      ...insights,
      demandLevel: formatEnum(insights.demandLevel),
      marketOutlook: formatEnum(insights.marketOutlook),
    };

    console.log("🔧 Formatted Enums Before Validation:", {
      demandLevel: formattedInsights.demandLevel,
      marketOutlook: formattedInsights.marketOutlook,
    });

    // Final safety check before DB
    if (!ALLOWED_DEMAND.includes(formattedInsights.demandLevel)) {
      throw new Error(`Invalid demandLevel: ${formattedInsights.demandLevel}`);
    }
    if (!ALLOWED_OUTLOOK.includes(formattedInsights.marketOutlook)) {
      throw new Error(`Invalid marketOutlook: ${formattedInsights.marketOutlook}`);
    }

    try {
      const industryInsight = await db.industryInsight.create({
        data: {
          industry: user.industry,
          salaryRanges: formattedInsights.salaryRanges,
          growthRate: formattedInsights.growthRate,
          demandLevel: formattedInsights.demandLevel,
          topSkills: formattedInsights.topSkills,
          marketOutlook: formattedInsights.marketOutlook,
          keyTrends: formattedInsights.keyTrends,
          recommendedSkills: formattedInsights.recommendedSkills,
          nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      console.log("✅ Industry insight saved to DB:", industryInsight);
      return industryInsight;
    } catch (dbError) {
      console.error("❌ Failed to save industry insight to DB:", dbError);
      throw new Error("Database write failed: " + dbError.message);
    }
  }

  console.log("✅ Returning existing industry insight.");
  return user.industryInsight;
}
