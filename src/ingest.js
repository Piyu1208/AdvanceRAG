import dotenv from "dotenv";
import { SRTLoader } from "./loaders/SRTLoader.js";
import { chunkSubtitleDocument } from "./chunkers/subtitleChunker.js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";


dotenv.config();

const loader = new SRTLoader("./class-subtitle");

const documents = await loader.load();



console.log(`Loaded ${documents.length} episodes`);

const allChunks = [];

for (const document of documents) {
  const chunks = await chunkSubtitleDocument(document, {
    chunkSize: 600,

    // Number of subtitle entries to overlap
    subtitleOverlap: 2,
  });

  allChunks.push(...chunks);
}

console.log(`Created ${allChunks.length} chunks`);


async function generateVectorEmbeddings(chunks) {
  // Initialize the embedding model
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://aicredits.in/v1",
    },
  });

  // The vector store
  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings, // Use this embedding model
    {
      url: "http://localhost:6333",
      collectionName: "course-cap",
    },
  );

  const BATCH_SIZE = 100;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    await vectorStore.addDocuments(batch);

    console.log(
      `Indexed ${Math.min(
        i + BATCH_SIZE,
        chunks.length,
      )} / ${chunks.length}`,
    );
  }

  console.log("All the documents are indexed....");
}

generateVectorEmbeddings(allChunks);
