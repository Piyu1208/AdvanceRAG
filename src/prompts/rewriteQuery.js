import OpenAI from "openai";
import { REWRITTER_PROMPT } from "./prompts.js";
import { RewrittenQuerySchema } from './rag/schemas.js';


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

    let parsedRewrite;
    try {
        parsedRewrite = JSON.parse(rewriteResponse.output_text);
    } catch (error) {
        throw new Error("Rewritter returned invalid JSON");
    }

    const validatedRewrite = RewrittenQuerySchema.parse(parsedRewrite);
    return validatedRewrite.output;
}