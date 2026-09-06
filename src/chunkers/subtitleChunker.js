import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function chunkSubtitleDocument(
  document,
  {
    chunkSize = 1000,
    timestampOverlap = 2,
  } = {}
) {
  const entries = document.metadata.entries;

  if (!entries || entries.length === 0) {
    return [];
  }

  /*
   * RecursiveCharacterTextSplitter is used to determine
   * the desired chunk size.
   */
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });

  const chunks = [];

  let currentEntries = [];

  for (const entry of entries) {
    const candidateEntries = [
      ...currentEntries,
      entry,
    ];

    const candidateText = formatEntries(
      candidateEntries
    );

    const splitCandidate =
      await splitter.splitText(candidateText);

    /*
     * If adding this subtitle causes the candidate
     * to exceed chunkSize, finalize the current chunk.
     */
    if (
      splitCandidate.length > 1 &&
      currentEntries.length > 0
    ) {
      chunks.push(
        createChunk(
          document,
          currentEntries
        )
      );

      /*
       * Keep the last N subtitle entries.

       * This is timestamp overlap.
       *
       * timestampOverlap = 2
       *
       * Chunk 1:
       *   1 2 3 4 5
       *
       * Chunk 2:
       *   4 5 6 7 8
       */
      const overlapEntries =
        currentEntries.slice(
          -timestampOverlap
        );

      currentEntries = [
        ...overlapEntries,
        entry,
      ];
    } else {
      currentEntries.push(entry);
    }
  }

  /*
   * Add the final chunk.
   */
  if (currentEntries.length > 0) {
    chunks.push(
      createChunk(
        document,
        currentEntries
      )
    );
  }

  return chunks;
}

function createChunk(document, entries) {
  const firstEntry = entries[0];
  const lastEntry =
    entries[entries.length - 1];

  return new Document({
    /*
     * FINAL pageContent contains ONLY subtitle text.
     */
    pageContent: entries
      .map((entry) => entry.text)
      .join("\n\n"),

    metadata: {
      source: document.metadata.source,
      filename: document.metadata.filename,

      module: document.metadata.module,
      episode: document.metadata.episode,

      type: "subtitle",

      /*
       * Timestamp information is metadata.
       */
      startTime: firstEntry.start,
      endTime: lastEntry.end,

      startSubtitleIndex: firstEntry.index,
      endSubtitleIndex: lastEntry.index,

      subtitleCount: entries.length,
    },
  });
}

function formatEntries(entries) {
  /*
   * Used ONLY while determining chunk size.

   * This is not the final pageContent.
   */
  return entries
    .map((entry) => entry.text)
    .join("\n\n");
}