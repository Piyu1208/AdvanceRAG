import OpenAI from "openai";
import { JUDGE_SYS_PROMPT } from "../prompts/prompts.js";
import { JudgeFeedbackSchema } from './rag/schemas.js';


const client = new OpenAI({
    baseURL: `https://aicredits.in/v1`,
    apiKey: process.env.OPENAI_API_KEY,
});

// JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.

export async function evaluateResponse(rerankedDocuments, userQuery, response) {
    const judgeResponse = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: JUDGE_SYS_PROMPT,
        input: `Retrieved Documents: ${rerankedDocuments.map((e) =>
            JSON.stringify({
                module: e.metadata.module,
                episode: e.metadata.episode,
                content: e.pageContent,
                startTime: e.metadata.startTime,
                endTime: e.metadata.endTime
            })).join("\n\n")},

        User Query: ${userQuery},

        Answer: ${response.output_text}
            `,
    });

    let parsedFeedback;

    try {
        parsedFeedback = JSON.parse(judgeResponse.output_text);
    } catch (error) {
        throw new Error("Judge returned invalid JSON");
    }

    const feedback = JudgeFeedbackSchema.parse(parsedFeedback);

    return feedback;
}

