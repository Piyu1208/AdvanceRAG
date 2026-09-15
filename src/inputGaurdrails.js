import { GuardrailsOpenAI, GuardrailTripwireTriggered } from '@openai/guardrails';


const inputGuardrails = await GuardrailsOpenAI.create(
    "../Advanced_RAG/guardrails_config.json",
    {
        baseURL: "https://aicredits.in/v1",
        apiKey: process.env.OPENAI_API_KEY,
    },
    true
);

export async function checkInputPII(query) {
    try {
        await inputGuardrails.responses.create({
            model: "gpt-4o-mini",
            input: query,
        });

        return true;
    } catch (error) {
        if (error instanceof GuardrailTripwireTriggered) {
            console.log("❌ Input PII detected.");
            return false;
        }

        throw error;
    }
}