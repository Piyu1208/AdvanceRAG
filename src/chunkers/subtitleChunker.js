import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { encoding_for_model } from "tiktoken";

/**
 * Token encoder used for measuring chunk size.
 *
 * text-embedding-3-small supports a maximum input
 * of 8192 tokens, so we keep our chunks comfortably
 * below that limit.
 */
const encoder = encoding_for_model("text-embedding-3-small");

/**
 * Chunk one SRT Document.
 *
 * Requirements:
 * - Uses LangChain RecursiveCharacterTextSplitter
 * - chunkSize is measured in tokens
 * - pageContent contains text only
 * - Timestamps are preserved in metadata
 * - Subtitle/timestamp overlap is supported
 * - Never crosses an episode boundary
 *
 * @param {Document} document
 * @param {Object} options
 * @param {number} options.chunkSize Maximum number of tokens
 * @param {number} options.subtitleOverlap Number of subtitle entries to overlap
 * @returns {Promise<Document[]>}
 */
export async function chunkSubtitleDocument(
  document,
  {
    chunkSize = 600,
    subtitleOverlap = 2,
  } = {}
) {
  const entries = document.metadata.entries;

  if (!entries || entries.length === 0) {
    return [];
  }

  /*
   * RecursiveCharacterTextSplitter normally measures
   * chunk size using JavaScript string length.
   *
   * We replace that with tiktoken so chunkSize means
   * TOKENS instead of characters.
   */
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,

    lengthFunction: (text) => {
      return encoder.encode(text).length;
    },

    separators: ["\n\n", "\n", " ", ""],
  });

  const chunks = [];

  let currentEntries = [];

  for (const entry of entries) {
    const candidateEntries = [
      ...currentEntries,
      entry,
    ];

    const candidateText =
      formatEntries(candidateEntries);

    /*
     * Ask LangChain whether the candidate fits
     * within our token limit.
     */
    const splitResult =
      await splitter.splitText(candidateText);

    /*
     * If LangChain produces multiple pieces,
     * adding this subtitle exceeded chunkSize.
     */
    if (
      splitResult.length > 1 &&
      currentEntries.length > 0
    ) {
      chunks.push(
        createChunk(document, currentEntries)
      );

      /*
       * Preserve the last N complete subtitle entries.
       *
       * Example with subtitleOverlap = 2:
       *
       * Chunk 1:
       * 1 2 3 4 5 6
       *
       * Chunk 2:
       *         5 6 7 8 9 10
       */
      const overlapEntries =
        currentEntries.slice(-subtitleOverlap);

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
      createChunk(document, currentEntries)
    );
  }

  return chunks;
}


/**
 * Create the final LangChain Document.
 */
function createChunk(document, entries) {
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];

  const pageContent = entries
    .map((entry) => entry.text)
    .join("\n\n");

  return new Document({
    /*
     * Only subtitle text goes into pageContent.
     */
    pageContent,

    metadata: {
      id: `${document.metadata.module}|${document.metadata.episode}|${firstEntry.index}-${lastEntry.index}`,
      source: document.metadata.source,
      filename: document.metadata.filename,

      module: document.metadata.module,
      episode: document.metadata.episode,

      type: "subtitle",

      /*
       * Timestamp information.
       */
      startTime: firstEntry.start,
      endTime: lastEntry.end,

      /*
       * Original SRT subtitle numbers.
       */
      startSubtitleIndex: firstEntry.index,
      endSubtitleIndex: lastEntry.index,

      subtitleCount: entries.length,

      /*
       * Useful for debugging.
       */
      tokenCount: encoder.encode(pageContent).length,
    },
  });
}


/**
 * Convert subtitle entries into plain text.
 */
function formatEntries(entries) {
  return entries
    .map((entry) => entry.text)
    .join("\n\n");
}