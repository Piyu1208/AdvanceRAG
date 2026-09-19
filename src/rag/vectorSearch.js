import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";

// Initialise the embedding model
const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: "https://aicredits.in/v1",
    },
});

// Initialise the vector store
const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings, // Use this embedding model
    {
        url: "http://localhost:6333",
        collectionName: "course-cap",
    },
);
const vectorRetriver = vectorStore.asRetriever({ k: 20 });


export async function vectorSearch(queries) {
    const retrievedDocs = await Promise.all(
        queries.map((query) => vectorRetriver.invoke(query))
    );

    const docs = retrievedDocs.flat();

    // remove duplicates
    const uniqueDocs = Array.from(
        new Map(
            docs.map((doc) => [doc.metadata.id, doc])
        ).values()
    );

    return uniqueDocs;
}

