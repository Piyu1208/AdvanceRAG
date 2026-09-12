import dotenv from 'dotenv';
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';
import { generateAllQueryTransforms } from './queryTranslation.js';
import { CohereRerank } from "@langchain/cohere";

dotenv.config();

const client = new OpenAI({
  baseURL: `https://aicredits.in/v1`,
  apiKey: process.env.OPENAI_API_KEY,
});

const cohereRerank = new CohereRerank({
  apiKey: process.env.COHERE_API_KEY, // Default
  topN: 5,
  model: "rerank-v4.0-pro",
});

async function query(userQuery) {
  // Convert user query to vector embeddings
  // Initialize the embeding model
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey:
      process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://aicredits.in/v1",
    },
  });
  // search the vectors in the qdrant

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings, // Use this embedding model
    {
      url: "http://localhost:6333",
      collectionName: "course-cap",
    },
  );
  // get similar vectors and chunks?

  const vectorRetriver = vectorStore.asRetriever({ k: 20 });
  const docs = await vectorRetriver.invoke(userQuery);

  const rerankedDocuments = await cohereRerank.compressDocuments(docs, userQuery);
  console.log(rerankedDocuments);

  // feed those chunks to llm models and do a simple chat with {userQuery}
  const SYSTEM_PROMPT = `
   You are an expert in answering user query based on the provided
   context about document. Do not answer anything beyond what is
   provided.

   Always answer the user in short and tell on which module, episode and timestamp that content is available.
   User Documents:
   ${rerankedDocuments.map((e) => JSON.stringify({ module: e.metadata.module, episode: e.metadata.episode, content: e.pageContent, startTime: e.metadata.startTime, endTime: e.metadata.endTime })).join('\n\n')}
  `
  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    instructions: SYSTEM_PROMPT,
    input: `${userQuery}`,
  });

  //console.log('SYSTEM PROMPT: ', SYSTEM_PROMPT);

  console.log('LLM Response:', response.output_text);
}


const {
  stepback,
  subquestion,
  abstraction,
  rewriting,
  hyde,
} =  await generateAllQueryTransforms("How is expo different from react? Give 5 differences.");


const rewrittenQueries = `
${stepback.output},
${subquestion.output.join(", ")},
${abstraction.high_ab_output},
${abstraction.less_ab_output},
${rewriting.output}
${hyde.output}
`;


query(rewrittenQueries);