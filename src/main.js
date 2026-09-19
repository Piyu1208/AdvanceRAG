import dotenv from "dotenv";
import { generateAllQueryTransforms } from "./prompts/queryTranslation.js";
import { UserQuerySchema, FinalAnswerSchema } from './rag/schemas.js';
import { checkInputGuardrails } from "./rag/inputGaurdrails.js";
import { vectorSearch } from './rag/vectorSearch.js';
import { rerankDocs } from './rag/rerank.js';
import { generateAnswer } from "./rag/generateAnswer.js";
import { evaluateResponse } from "./rag/evaluateResponse.js";
import { rewriteQuery } from "./prompts/rewriteQuery.js";

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

  // Input guardrails
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


  // declare MAX_RETRIES = k
  const MAX_RETRIES = 1;

  // declare retry variable;
  let retry = false;
  let failure_type;
  let rewrittenQueries;
  let rerankedDocuments;
  let feedbackQuery;
  let retrievedDocs;



  for (let i = 0; i <= MAX_RETRIES; i++) {
    console.log('Loop number: ', i + 1);

    if ((i === 0) || (failure_type === 'retrieval')) {

      if (i > 0) {
        console.log('Retrieval failure.');

        // rewrite user query to include feedback info/keywords
        let missingInfo = feedback.missing_information.join(", ");
        feedbackQuery = await rewriteQuery(userQuery, missingInfo);
      }

      // Query Translation
      let { stepback, subquestions, rewriting, hyde } =
        await generateAllQueryTransforms(
          feedbackQuery || userQuery
        );;


      // Keep every tranformed query in an array
      rewrittenQueries = [stepback,
        ...subquestions,
        rewriting,
        hyde
      ].filter(Boolean);


      // Run vector search for each query
      retrievedDocs = await vectorSearch(rewrittenQueries);

      // Rank documents
      rerankedDocuments = await rerankDocs(retrievedDocs,
        9, userQuery,
        feedbackQuery
      );
    }

    if (failure_type === 'generation') {
      console.log('Generation failure.');
      userQuery += `, ` + feedback.generation_feedback.join(', ');

      console.log('Query with generation feedback: ', userQuery);
    }

    // Generate Response
    console.log('Generating reponse...');
    response = await generateAnswer(rerankedDocuments, userQuery);


    // Evaluate/Judge Response
    feedback = await evaluateResponse(rerankedDocuments, userQuery, response);

    console.log("Feedback: ", feedback);
    retry = feedback.retry;

    if (!retry || (i === MAX_RETRIES)) {
      console.log('Success.');
      return response.output_text;
    }

    failure_type = feedback.failure_type;

  };
};


const answer = await main("How does Expo implements hand gestures?");

console.log('FINAL ANSWER: ', answer.answer);
console.log('Sources: ', answer.sources);



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