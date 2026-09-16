import dotenv from "dotenv";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import OpenAI from "openai";
import { generateAllQueryTransforms } from "./queryTranslation.js";
import { CohereRerank } from "@langchain/cohere";
import { JUDGE_SYS_PROMPT, SYSTEM_PROMPT, REWRITTER_PROMPT } from "./prompts.js";
import { UserQuerySchema, QueryTransformsSchema, RewrittenQuerySchema, JudgeFeedbackSchema, FinalAnswerSchema } from './schemas.js';
import { checkInputGuardrails } from "./inputGaurdrails.js";

dotenv.config();

async function main(userQuery) {
  //Query validation

  const validation = UserQuerySchema.safeParse({
    query: userQuery,
  });

  if (!validation.success) {
    throw new Error(
      `Invalid user query: ${validation.error.message}`
    );
  }

  userQuery = validation.data.query;

  const guardrailResult = await checkInputGuardrails(userQuery);

  if (!guardrailResult.safe) {
    if (guardrailResult.reason === "Contains PII") {
      return "I can't process requests containing personal information.";
    }

    if (guardrailResult.reason === "Jailbreak") {
      return "I can't help with attempts to bypass my instructions.";
    }

    if (guardrailResult.reason === "Off Topic Prompts") {
      return "I can't answer questions irrelevant to the course."
    }

    return "I can't process this request.";

  }



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
  let feedbackQuery;
  let uniqueDocs;
  let retrievedDocs;
  let rewriteResponse;
  let parsedRewrite;
  let validatedRewrite;
  let transforms;
  let validatedTransforms;


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
    if ((i === 0) || (failure_type === 'retrieval')) {

      if (i > 0) {
        console.log('Retrieval failure.');

        // rewrite user query to include feedback info/keywords
        let missing_info = feedback.missing_information.join(", ");

        rewriteResponse = await client.responses.create({
          model: "gpt-5-nano",
          instructions: REWRITTER_PROMPT,
          input: `User Query: ${userQuery},
        Information to include: ${missing_info}`,
        });

        try {
          parsedRewrite = JSON.parse(rewriteResponse.output_text);
        } catch (error) {
          throw new Error("Rewritter returned invalid JSON");
        }

        validatedRewrite = RewrittenQuerySchema.parse(parsedRewrite);

        feedbackQuery = validatedRewrite.output;
      }
      // Rewrite user query => (rewrittenQuery)
      transforms = await generateAllQueryTransforms(
        feedbackQuery || userQuery
      );

      validatedTransforms = QueryTransformsSchema.parse(transforms);

      let { stepback, subquestion, abstraction, rewriting, hyde } =
        validatedTransforms;

      // Keep every tranformed query in an array
      rewrittenQueries = [stepback.output,
      ...subquestion.output,
      abstraction.high_ab_output,
      abstraction.less_ab_output,
      rewriting.output,
      hyde.output
      ].filter(Boolean);

      // Run vector search for each query
      retrievedDocs = await Promise.all(
        rewrittenQueries.map((query) => vectorRetriver.invoke(query))
      );

      docs = retrievedDocs.flat();

      uniqueDocs = Array.from(
        new Map(
          docs.map((doc) => [doc.metadata.id, doc])
        ).values()
      );

      // Rank documents
      rerankedDocuments = await cohereRerank.compressDocuments(
        uniqueDocs,
        feedbackQuery || userQuery,
      );
    }

    if (failure_type === 'generation') {
      console.log('Generation failure.');
      userQuery += `, ` + feedback.generation_feedback.join(', ');

      console.log('Query with generation feedback: ', userQuery);
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
    let judgeResponse = await client.responses.create({
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

    feedback = JudgeFeedbackSchema.parse(parsedFeedback);

    console.log("Feedback: ", feedback);
    retry = feedback.retry;

    if (!retry || (i === MAX_RETRIES)) {
      console.log('Success.');
      return response.output_text;
    }

    console.log('Retrying...');
    failure_type = feedback.failure_type;

  };
};


const answer = await main("How do I use expo router for navigation?.");

let parsedAnswer;

try {
  parsedAnswer = JSON.parse(answer);
} catch (error) {
  console.log("FINAL ANSWER:", answer);
  process.exit(0);
}

let finalAnswer = FinalAnswerSchema.parse(parsedAnswer);


console.log('FINAL ANSWER: ', finalAnswer.answer);
console.log('Sources: ', finalAnswer.sources);



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
   
   if (i===0 || failure_type === retrieval) {

      if (i > 0) {
        1. feedbackKeywords + userQuery => newQuery
      }
       1. Rewrite user query. (rewritten query) uses newQuery if it exists else the userQuery.
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