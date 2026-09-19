import { GuardrailsOpenAI, GuardrailTripwireTriggered } from '@openai/guardrails';



const guardrails = await GuardrailsOpenAI.create(
    "../Advanced_RAG/guardrails_config.json",
    {
        baseURL: "https://aicredits.in/v1",
        apiKey: process.env.OPENAI_API_KEY,
    },
    true
);

export async function checkInputGuardrails(query) {
    try {
        await guardrails.responses.create({
            model: "gpt-4o-mini",
            input: query,
        });

        return {
            safe: true,
            reason: null,
        };
    } catch (error) {
        if (error instanceof GuardrailTripwireTriggered) {
            console.log("❌ Guardrail triggered.");
            console.dir(error.guardrailResult?.info, { depth: null });
            return {
                safe: false,
                reason: error.guardrailResult?.info?.guardrail_name,
            };
        }

        throw error;
    }
}