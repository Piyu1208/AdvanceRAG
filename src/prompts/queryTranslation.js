import OpenAI from "openai";
import { QueryTransformsSchema } from '../rag/schemas.js';

const client = new OpenAI({
  baseURL: `https://aicredits.in/v1`,
  apiKey: process.env.OPENAI_API_KEY,
});

const TRANSLATOR_SYSTEM_PROMPT = `
You are a query translator in a RAG system. 

Given the user's query, produces THREE types of query transformations:

1. STEP-BACK QUESTION
Step back from the specific details to find the fundamental principles, concepts that are in the user's query and 
based on that produce exactly one fundamental/high level question.

- Produce exactly ONE high-level question.
- Do not give the solution or a solution plan. 
- Keep it concise


2. SUB-QUESTIONS
Decompose the user's query to form exact 3 different short sub-questions by using problem decomsposition.

- Do not give the answer/solution or an action plan.
- Make sure each question is different and has a distinct role.
- Keep the questions concise.
- Only give questions that are relavant to retrieve evidence to solve the user's query.
- Simply give the sub-questions/queries.


3. REWRITTEN QUERY
Rewrite the user's query so it is optimized for document retrieval, by
understanding the user's intention, preserving the meaning but improving
clarity and specificty.

- Do not give a solution/answer or an action plan to the user's query.
- Simply output the rewritten query.
- Keep it concise.


Return JSON only.

OUTPUT_FORMAT:
{
"stepback": "...",
"subquestions": ["...", "...", "..."],
"rewriting": "..."
}
`;


const HYDE_SYS_PROMPT = `
Given a question/query generate a hypothetical document that could contain information needed to answers that question.

- Generate a hypothetical document/information source, not a question or answer.
- Do not mention the document is hypothetical.
- Keep it under 250 words.
- Return JSON only.

OUTPUT_FORMAT:
{
"output": "..."
}
`;


async function generateQueryTransform(query, instructions) {
  const response = await client.responses.create({
    model: "gpt-5-nano",
    instructions,
    input: query,
  });

  return JSON.parse(response.output_text);
}




export async function generateAllQueryTransforms(query) {
  const [translator, hyde] = await Promise.all([
    generateQueryTransform(query, TRANSLATOR_SYSTEM_PROMPT),
    generateQueryTransform(query, HYDE_SYS_PROMPT),
  ]);

  const result = {
    stepback: translator.stepback,
    subquestions: translator.subquestions,
    rewriting: translator.rewriting,
    hyde: hyde.output,
  };

  const validatedTransforms = QueryTransformsSchema.parse(result);

  return validatedTransforms;
}
