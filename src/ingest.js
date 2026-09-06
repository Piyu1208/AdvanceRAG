import { SRTLoader } from "./loaders/SRTLoader.js";
import { chunkSubtitleDocument } from "./chunkers/subtitleChunker.js";

const loader = new SRTLoader("./class-subtitle");

const documents = await loader.load();

console.log(
  `Loaded ${documents.length} episodes`
);

const allChunks = [];

for (const document of documents) {
  const chunks = await chunkSubtitleDocument(
    document,
    {
      chunkSize: 1000,

      // Number of subtitle entries to overlap
      timestampOverlap: 3,
    }
  );

  allChunks.push(...chunks);
}

console.log(
  `Created ${allChunks.length} chunks`
);

for (const chunk of allChunks.slice(0, 5)) {
  console.log("\n==========================");

  console.log(
    chunk
  );

}