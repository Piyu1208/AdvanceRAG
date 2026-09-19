import { z } from "zod";

export const UserQuerySchema = z.object({
    query: z
    .string()
    .trim()
    .min(1, "Query cannot be empty")
    .max(1000, "Query is too long"),
});


export const QueryTransformsSchema = z.object({
    stepback: z.string(),

    subquestions: z.array(z.string()).length(3),

    rewriting: z.string(),

    hyde: z.string(),
});

export const RewrittenQuerySchema = z.object({
    output: z
    .string()
    .trim()
    .min(1)
    .max(1200),
});


export const JudgeFeedbackSchema = z.object({
  retry: z.boolean(),

  failure_type: z.enum([
    "retrieval",
    "generation",
  ]).nullable(),

  missing_information: z.array(z.string()).nullable(),

  generation_feedback: z.array(z.string()).nullable(),
});

const SourceSchema = z.object({
        module: z.string(),
        episode: z.string(),
        startTime: z.string(),
        endTime: z.string()
});


export const FinalAnswerSchema = z.object({
    answer: z.string(),
    sources: z.array(SourceSchema)
});