import dotenv from "dotenv";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import OpenAI from "openai";
import { generateAllQueryTransforms } from "./queryTranslation.js";
import { CohereRerank } from "@langchain/cohere";
import { JUDGE_SYS_PROMPT, SYSTEM_PROMPT } from "./prompts.js";

dotenv.config();

async function main(userQuery) {
  //responses
  let feedback;
  let response;

  // Create open ai client
  const client = new OpenAI({
    baseURL: `https://aicredits.in/v1`,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create cohere reranker client
  const cohereRerank = new CohereRerank({
    apiKey: process.env.COHERE_API_KEY, // Default
    topN: 9,
    model: "rerank-v4.0-pro",
  });

  // Initialise the embedding model
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://aicredits.in/v1",
    },
  });

  // declare MAX_RETRIES = k
  const MAX_RETRIES = 2;

  // declare retry variable;
  let retry = false;
  let failure_type;
  let rewrittenQueries;
  let docs;
  let rerankedDocuments;


  // Initialise the vector store
  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings, // Use this embedding model
    {
      url: "http://localhost:6333",
      collectionName: "course-cap",
    },
  );
  const vectorRetriver = vectorStore.asRetriever({ k: 20 });


  for (let i = 0; i <= MAX_RETRIES; i++) {
    console.log('Loop number: ', i + 1);
    if (i === 0) {
      // Rewrite user query => (rewrittenQuery)
      const { stepback, subquestion, abstraction, rewriting, hyde } =
        await generateAllQueryTransforms(userQuery);

      rewrittenQueries = `${stepback.output}, 
    ${subquestion.output.join(", ")}, 
    ${abstraction.high_ab_output}, 
    ${abstraction.less_ab_output}, 
    ${rewriting.output}, 
    ${hyde.output},`;

      // Get documents from vector store.
      docs = await vectorRetriver.invoke(rewrittenQueries);

      // Rank documents
      rerankedDocuments = await cohereRerank.compressDocuments(
        docs,
        rewrittenQueries,
      );
    }

    if (failure_type === 'retrieval') {
      console.log('Retrieval failure.');
      // add misssing keywords to rewrittenQueries
      let missing_info = feedback.missing_information.join(", ");
      rewrittenQueries += ", " + missing_info;

      // Get Docs from vector store
      docs = await vectorRetriver.invoke(rewrittenQueries);
      console.log('Refetching documents...');
      // Rank documents
      rerankedDocuments = await cohereRerank.compressDocuments(
        docs,
        rewrittenQueries,
      );
    }

    if (failure_type === 'generation') {
      console.log('Generation failure.');
    }

    // SYS_PROMPT + Rerank documents + user query ==> Get LLM response.
    response = await client.responses.create({
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
    console.log('Generating reponse...');

    // JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.
    feedback = await client.responses.create({
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



    feedback = JSON.parse(feedback.output_text);
    console.log("Feedback: ", feedback);
    retry = feedback.retry;

    if (!retry || (i === MAX_RETRIES)) {
      console.log('Success.');
      return response.output_text;
    } else {
      console.log('Retrying...');
      failure_type = feedback.failure_type;
    }
  };
};


const answer = await main("What is expo? Why use it? What are 5-6 differences with react?");

console.log('FINAL ANSWER: ', answer);



/*
for (i=0; i<MAX_RETRIES; i++) {
   
   if (i=0) {
       1. Rewrite user query. (rewritten query)
       2. Get similar vectors and documents using rewritten query.
       3. Rerank documents.
       4. SYS_PROMPT = SYS_PROMPT + Rerank documents + user query ==> Get LLM response.
       5. JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.
       6. If retry === false:
            return the response.
          else:
            failure_type = retrieval/generation
   };

   if (failure_type === retrieval) {
      1. rewrittenQuery += missingInfo
      2. Get similar vectors and documents using rewritten query.
      3. Rerank documents.
      4. SYS_PROMPT = SYS_PROMPT + Rerank documents + user query ==> Get LLM response.
      5. JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.
      6. If (retry === false) || (i === MAX_RETRIES) :
            return the response.
         else:
            failure_type = retrieval/generation
   } 

   if (failure_type === generation) {
      1. Get LLM response.
      2. JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.
      3. If (retry === false) || (i === MAX_RETRIES) :
            return the response.
         else:
            failure_type = retrieval/generation
   }
}

console.log(response);


*/


/*
for (i=0; i<MAX_RETRIES; i++) {
   
   if (i=0) {
       1. Rewrite user query. (rewritten query)
       2. Get similar vectors and documents using rewritten query.
       3. Rerank documents.
   };

   if (failure_type && failure_type === retrieval) {
      1. rewrittenQuery += missingInfo
      2. Get similar vectors and documents using rewritten query.
      3. Rerank documents.
   };


   1.  SYS_PROMPT = SYS_PROMPT + Rerank documents + user query ==> Get LLM response.
   2. JUDGE_PROMPT + Rerank documents + user query + LLM response ==> Seek feedback for LLM response.
   3. If (retry === false) || (i === MAX_RETRIES):
            return the response.
          else:
            failure_type = retrieval/generation
}

console.log(response);


*/