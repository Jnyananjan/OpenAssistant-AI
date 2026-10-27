import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import {
  advisorRequestSchema,
  recommendationMatchesCandidates,
  recommendationSchema,
  type Recommendation,
} from "./advisor";
export const recommendModel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => advisorRequestSchema.parse(input))
  .handler(async ({ data }): Promise<Recommendation> => {
    const apiKey =
      process.env["OPENAI_API_KEY"] ||
      process.env["AI_ADVISOR_API_KEY"];
    if (!apiKey) {
      throw new Error("The AI advisor is not configured on the server. Please set OPENAI_API_KEY.");
    }

    const baseURL = process.env["OPENAI_BASE_URL"] || undefined;
    const modelName = process.env["AI_ADVISOR_MODEL"] || "gpt-4o-mini";

    const provider = createOpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const catalog = data.candidates
      .map((c) => `- ${c.providerName} (id: ${c.provider}): ${c.models.join(", ")}`)
      .join("\n");

    const result = streamText({
      model: provider(modelName),
      system:
        "You are a model routing advisor for an AI operations dashboard. " +
        "Given a workload description and a catalog of connected providers with their accessible models, " +
        "recommend the single best provider and model for the workload, plus one fallback from the same catalog. " +
        "Only ever pick provider ids and model names that appear verbatim in the catalog. " +
        "Keep each reason to one or two concrete sentences about fit (capability, context size, latency, or cost).",
      messages: [
        {
          role: "user",
          content: `Workload: ${data.description}\n\nConnected catalog:\n${catalog}`,
        },
      ],
      output: Output.object({ schema: recommendationSchema }),
      maxRetries: 0,
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    let recommendation: Recommendation;
    try {
      recommendation = await result.output;
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message
          ? `The AI advisor request failed: ${error.message}`
          : "The AI advisor request failed.",
      );
    }

    if (!recommendationMatchesCandidates(recommendation, data.candidates)) {
      throw new Error("The advisor suggested a model outside your connected catalog. Try again.");
    }
    return recommendation;
  });
