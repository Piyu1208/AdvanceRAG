import OpenAI from "openai";
import { REWRITTER_PROMPT } from "./prompts.js";


const client = new OpenAI({
    baseURL: `https://aicredits.in/v1`,
    apiKey: process.env.OPENAI_API_KEY,
});


export async function rewriteQuery(userQuery, missingInfo) {
    const rewriteResponse = await client.responses.create({
        model: "gpt-5-nano",
        instructions: REWRITTER_PROMPT,
        input: `User Query: ${userQuery},
        Information to include: ${missingInfo}`,
    });

    return rewriteResponse;
}