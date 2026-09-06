import fs from "fs/promises";
import path from "path";
import { Document } from "@langchain/core/documents";

export class SRTLoader {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
  }

  async load() {
    const srtFiles = await this.findSRTFiles(this.rootDirectory);

    const documents = [];

    for (const filePath of srtFiles) {
      const content = await fs.readFile(filePath, "utf-8");

      const entries = this.parseSRT(content);

      if (entries.length === 0) {
        continue;
      }

      const metadata = this.getMetadata(filePath);

      documents.push(
        new Document({
          // Text only
          pageContent: entries
            .map((entry) => entry.text)
            .join("\n\n"),

          metadata: {
            source: filePath,
            filename: path.basename(filePath),

            module: metadata.module,
            episode: metadata.episode,

            type: "subtitle",

            /*
             * Keep entries temporarily.
             * The chunker needs these to preserve timestamps
             * and create timestamp-based overlap.
             */
            entries,
          },
        })
      );
    }

    return documents;
  }

  async findSRTFiles(directory) {
    const items = await fs.readdir(directory, {
      withFileTypes: true,
    });

    const files = [];

    for (const item of items) {
      const fullPath = path.join(directory, item.name);

      if (item.isDirectory()) {
        files.push(
          ...(await this.findSRTFiles(fullPath))
        );
      } else if (
        item.isFile() &&
        path.extname(item.name).toLowerCase() === ".srt"
      ) {
        files.push(fullPath);
      }
    }

    return files;
  }

  parseSRT(content) {
    const blocks = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split(/\n\s*\n/);

    const entries = [];

    for (const block of blocks) {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 3) {
        continue;
      }

      const index = Number(lines[0]);

      const timestampLine = lines[1];

      if (!timestampLine.includes("-->")) {
        continue;
      }

      const [start, end] = timestampLine
        .split("-->")
        .map((time) => time.trim());

      const text = lines
        .slice(2)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .trim();

      if (!text) {
        continue;
      }

      entries.push({
        index,
        start,
        end,
        text,
      });
    }

    return entries;
  }

  getMetadata(filePath) {
    const relativePath = path.relative(
      this.rootDirectory,
      filePath
    );

    const parts = relativePath.split(path.sep);

    /*
      Example:

      module 1/
        01_what-is-mobile-development_epm/
          01_what-is-mobile-development_epm.srt

      parts[0] = module 1
      parts[1] = episode folder
      parts[2] = srt filename
    */

    return {
      module: parts[0] ?? null,
      episode:
        parts[1] ??
        path.basename(filePath, ".srt"),
    };
  }
}