import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../prompts/prompts.js";

const client = new OpenAI({
    baseURL: `https://aicredits.in/v1`,
    apiKey: process.env.OPENAI_API_KEY,
});


export async function generateAnswer(rerankedDocuments, userQuery) {
    // SYS_PROMPT + Rerank documents + user query ==> Get LLM response.
    const response = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: SYSTEM_PROMPT,
        input: `User Documents: ${rerankedDocuments.map((e) =>
            JSON.stringify({
                module: e.metadata.module,
                episode: e.metadata.episode,
                content: e.pageContent,
                startTime: e.metadata.startTime,
                endTime: e.metadata.endTime
            })).join("\n\n")}, 
  
        User Query: ${userQuery}`,
    });

    return response
}