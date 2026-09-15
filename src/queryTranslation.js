import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const client = new OpenAI({
  baseURL: `https://aicredits.in/v1`,
  apiKey: process.env.OPENAI_API_KEY,
});

const STEPBACK_SYSTEM_PROMPT = `
You are a query translator in a RAG system. Your goal is
to look at the user input query and step-back to find the
fundamental principles, concepts that are in the user query and 
based on that produce a fundamental or a high level question.

- Do not give the solution or a solution plan.
- Simply give a new high level question/query. 
- Return JSON only.

OUTPUT_FORMAT:
{
"output": "..."
}
`;

const SUBQUESTION_SYS_PROMPT = `
You are a query translator in a RAG system. You have to look at the user query
to form between 2-3 different short sub-questions by using problem decomsposition.

- Do not give the answer/solution or an action plan.
- Make sure each question is different and has a distinct role.
- Make sure the questions are concise.
- Only give questions that are relavant to retrieve evidence to solve the user's query.
- Simply give the sub-questions/queries.
- Return JSON only.

OUTPUT_FORMAT:
{
"number": "3",
"output": ["...", "...", "..."],
}
`;

const ABSTRACTION_SYS_PROMPT = `
You are a query translater in a RAG system. Formulate 2 queries/questions
one with high abstraction and the other with less abstraction based on the user's query.

- Do not give the answer/solution to the user's query.
- Simply give two queries one high abstraction the other with less abstraction.
- Return JSON only.

OUTPUT_FORMAT:
{
"high_ab_output": "...",
"less_ab_output": "..."
}
`;

const REWRITING_SYS_PROMPT = `
Rewrite the user's query so it is optimized for document retrieval, by
understanding the user's intention, preserving the meaning but improve
clarity and specificty.

- Do not give a solution/answer or an action plan to the user's query.
- Simply output the rewritten query.
- Return JSON only.

OUTPUT_FORMAT:
{
"output": "..."
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
  const [stepback, subquestion, abstraction, rewriting, hyde] = await Promise.all([
    generateQueryTransform(query, STEPBACK_SYSTEM_PROMPT),
    generateQueryTransform(query, SUBQUESTION_SYS_PROMPT),
    generateQueryTransform(query, ABSTRACTION_SYS_PROMPT),
    generateQueryTransform(query, REWRITING_SYS_PROMPT),
    generateQueryTransform(query, HYDE_SYS_PROMPT),
  ]);

  return {
    stepback,
    subquestion,
    abstraction,
    rewriting,
    hyde,
  };
}
