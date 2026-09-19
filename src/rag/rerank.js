import { CohereRerank } from "@langchain/cohere";

const cohereConfig = {
    apiKey: process.env.COHERE_API_KEY,
    model: "rerank-v4.0-pro",
};

export async function rerankDocs(
    uniqueDocs,
    topN,
    userQuery,
    feedbackQuery = null
) {
    const cohereRerank = new CohereRerank({
        ...cohereConfig,
        topN,
    });

    return await cohereRerank.compressDocuments(
        uniqueDocs,
        feedbackQuery || userQuery
    );
}