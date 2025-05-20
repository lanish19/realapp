// ExecutiveSummaryGeneration.ts

'use server';

/**
 * @fileOverview Generates an executive summary of the appraisal report, synthesizing information
 * primarily sourced from web search by other agents.
 * **Will use web search** for context on assumptions/conditions if inputs are unclear or generic.
 *
 * - generateExecutiveSummary - A function that generates the executive summary.
 * - ExecutiveSummaryInput - The input type for the generateExecutiveSummary function.
 * - ExecutiveSummaryOutput - The return type for the generateExecutiveSummary function.
 */

import {ai} from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const ExecutiveSummaryInputSchema = z.object({
  propertyAddress: z.string().describe('The full address of the property being appraised.'),
  city: z.string().describe('The city where the property is located.'),
  county: z.string().describe('The county where the property is located.'),
  intendedUse: z.string().describe('The intended use of the appraisal.'),
  intendedUser: z.string().describe('The intended user of the appraisal.'),
  propertyTypeGeneral: z.string().optional().describe('A general classification of the property type, likely refined by Site Description Agent through its web search.'),
  siteDescriptionSummary: z.string().describe('A comprehensive summary of the Site Description section, which must be based on extensive web search findings by the Site Description Agent. This includes precise location, land area, site topography, specific zoning, utilities, detailed improvements, flood zone info, etc.'),
  marketOverviewSummary: z.string().describe('A comprehensive summary of the Market Analysis/Overview section, which must be based on extensive web search findings by the Market Analysis Agent. This includes specific economic, demographic, and real estate market trends, including data on vacancy, rental rates, and comparable sales activity.'),
  highestAndBestUseConclusion: z.string().describe('The concluded Highest and Best Use of the property, as determined in the HBU analysis (which itself is based on web-searched data, including specific zoning).'),
  valuationApproachesSummary: z.string().describe('A narrative summary of the valuation approaches considered/used (e.g., Cost, Sales Comparison, Income Capitalization), their key indications, and how they were reconciled. This is currently a placeholder or generic statement pending a full Valuation Agent, but should be presented professionally.'),
  opinionOfValue: z.string().describe('The final opinion of value for the property, including the effective date. This is currently a placeholder pending a full Valuation Agent.'),
  extraordinaryAssumptions: z.string().optional().describe('Any extraordinary assumptions made, if provided. If "None" or generic, this agent may need to use search to understand common assumptions for this property type/market or confirm the absence thereof.'),
  hypotheticalConditions: z.string().optional().describe('Any hypothetical conditions made, if provided. If "None" or generic, this agent may need to use search to understand common conditions for this property type/market or confirm the absence thereof.'),
});

export type ExecutiveSummaryInput = z.infer<typeof ExecutiveSummaryInputSchema>;

const ExecutiveSummaryOutputSchema = z.object({
  executiveSummary: z.string().describe('The generated executive summary of the appraisal report, synthesizing web-searched information from other agents. Typically 1-2 pages if fully detailed, provide a comprehensive multi-paragraph summary here. It must be a polished, professional narrative.'),
  confidenceScore: z.number().optional().describe('Overall confidence in the executive summary (0.0-1.0), based on the reliability and completeness of the synthesized data and sources.'),
});

export type ExecutiveSummaryOutput = z.infer<typeof ExecutiveSummaryOutputSchema>;

export async function generateExecutiveSummary(input: ExecutiveSummaryInput): Promise<ExecutiveSummaryOutput> {
  return executiveSummaryFlow(input);
}

export async function generateExecutiveSummaryWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: ExecutiveSummaryInput = {
    propertyAddress: caseFile.propertyAddress,
    city: caseFile.city,
    county: caseFile.county,
    intendedUse: caseFile.intendedUse,
    intendedUser: caseFile.intendedUser,
    propertyTypeGeneral: caseFile.propertyDetails?.general?.propertyType || undefined,
    siteDescriptionSummary: caseFile.narratives?.siteDescription || '',
    marketOverviewSummary: caseFile.narratives?.marketAnalysis || '',
    highestAndBestUseConclusion: caseFile.narratives?.hbuAnalysis || '',
    valuationApproachesSummary: caseFile.valuationResults?.valuationApproachesSummary || 'Valuation approaches not yet summarized.',
    opinionOfValue: caseFile.finalReconciledValue ? `$${caseFile.finalReconciledValue.toLocaleString()} as of ${caseFile.effectiveDate || 'N/A'}` : 'Value not yet determined.',
    extraordinaryAssumptions: caseFile.extraordinaryAssumptions || undefined,
    hypotheticalConditions: caseFile.hypotheticalConditions || undefined,
  };
  const result = await executiveSummaryFlow(input, { caseFile });
  return {
    narratives: {
      ...caseFile.narratives,
      executiveSummary: result.executiveSummary,
    },
  };
}

// New: Dynamic prompt assembly function
function assembleExecutiveSummaryPrompt(caseFile: AppraisalCaseFile): string {
  const propertyAddress = caseFile.propertyAddress || '[Not found]';
  const city = caseFile.city || '[Not found]';
  const county = caseFile.county || '[Not found]';
  const intendedUse = caseFile.intendedUse || '[Not found]';
  const intendedUser = caseFile.intendedUser || '[Not found]';
  const propertyTypeGeneral = caseFile.propertyDetails?.general?.propertyType || '[Not found]';
  const siteDescriptionSummary = caseFile.narratives?.siteDescription || '[Not found]';
  const marketOverviewSummary = caseFile.narratives?.marketAnalysis || '[Not found]';
  const highestAndBestUseConclusion = caseFile.narratives?.hbuAnalysis || '[Not found]';
  const valuationApproachesSummary = caseFile.valuationResults?.valuationApproachesSummary || '[Valuation approaches not summarized]';
  const opinionOfValue = caseFile.finalReconciledValue ? `$${caseFile.finalReconciledValue.toLocaleString()} as of ${caseFile.effectiveDate || 'N/A'}` : '[Value not determined]';
  const extraordinaryAssumptions = caseFile.extraordinaryAssumptions || 'None Stated';
  const hypotheticalConditions = caseFile.hypotheticalConditions || 'None Stated';
  return `You are an expert real estate appraiser AI assistant tasked with writing a comprehensive Executive Summary for an appraisal report.\n\nYour summary must be based *solely* on the provided detailed summaries from other agents (Site Description, Market Overview, HBU Conclusion, Valuation Approaches), which themselves are based on their extensive web search. You should also incorporate the user's stated ${intendedUse}, ${intendedUser}, and the provided Opinion of Value (${opinionOfValue}).\n\nYour main task is to synthesize these inputs into a fluent, professional, and cohesive narrative. Do not simply list the input points; weave them together into a compelling summary.\n\n**Proactive Web Search Requirement:**\nIf the provided summaries or specific inputs for extraordinary assumptions (${extraordinaryAssumptions}) or hypothetical conditions (${hypotheticalConditions}) are unclear, generic (e.g., just "None Stated"), or if context suggests they might exist for a ${propertyTypeGeneral} in ${city}, ${county}, you **MUST use your web search capabilities** to check for common practices, requirements, or to confirm their absence robustly before stating them.\n\n**For missing or generic assumptions/conditions, formulate and report specific search queries such as:**\n- 'common extraordinary assumptions commercial appraisal ${propertyTypeGeneral} ${city}'\n- 'standard hypothetical conditions ${propertyTypeGeneral} appraisal'\n- 'extraordinary assumptions typical for ${propertyTypeGeneral} appraisals in ${city}, ${county}'\n\nIf you cannot find relevant information after diligent search, state so and proceed with a reasoned, professional default.\n\n**Key Information to Synthesize and Incorporate:**\n- **Introduction**: Identify the property by its full ${propertyAddress}. State the ${intendedUser} and ${intendedUse} of the appraisal.\n- **Property Identification and Overview**: State the property type (refine '${propertyTypeGeneral}' based on specific details found in ${siteDescriptionSummary}). Integrate key findings from the Site Description Summary (${siteDescriptionSummary}), focusing on impactful characteristics like land size, primary improvements, specific zoning identified via search, and overall condition.\n- **Market Context**: Synthesize the Market Overview Summary (${marketOverviewSummary}) to provide relevant economic, demographic, and real estate market trends (including vacancy, rental, and sales data) influencing the property.\n- **Highest and Best Use**: Clearly state and briefly justify the Highest & Best Use Conclusion (${highestAndBestUseConclusion}), ensuring it aligns with the site (including specific zoning found by search) and market context.\n- **Valuation Summary**: Present the narrative summary of the Valuation Approaches Utilized (${valuationApproachesSummary}). Explain what this means in context. Clearly state the Final Opinion of Value: ${opinionOfValue}.\n- **Assumptions and Conditions**: Based on the provided extraordinary assumptions (${extraordinaryAssumptions}) and hypothetical conditions (${hypotheticalConditions}), and **your own web search if these inputs are generic or seem incomplete for the context**: State any extraordinary assumptions and hypothetical conditions, citing your search queries and findings.\n\n**Structure and Tone**:\n- Begin with an introduction.\n- Logically flow through: property details (synthesized from site description), market context (from market overview), HBU, valuation summary, and any significant assumptions/conditions (verified by search if needed).\n- Conclude with the final opinion of value and its effective date.\n- Maintain a formal, professional, and objective tone.\n- Ensure clarity and precision. The summary should be easily understandable and reflect deep analysis.\n- Aim for a multi-paragraph summary that adequately covers all points, demonstrating synthesis of all search-derived information.\n\n---\nGenerate a compelling and accurate Executive Summary based on ALL provided details, synthesizing them into a professional narrative, using web search to clarify or augment details about assumptions/conditions if inputs are generic, and cite your search queries and findings as needed:\n\nAt the end, assign a confidenceScore (0.0-1.0) for the executive summary, based on the reliability and completeness of the synthesized data and sources.`;
}

// Refactored: Use dynamic prompt assembly in the flow
const executiveSummaryPrompt = ai.definePrompt({
  name: 'executiveSummaryPrompt',
  input: {schema: ExecutiveSummaryInputSchema},
  output: {schema: ExecutiveSummaryOutputSchema},
  prompt: '', // Will be set dynamically
});

export const executiveSummaryFlow = ai.defineFlow(
  {
    name: 'executiveSummaryFlow',
    inputSchema: ExecutiveSummaryInputSchema,
    outputSchema: ExecutiveSummaryOutputSchema,
  },
  async (input: ExecutiveSummaryInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleExecutiveSummaryPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...executiveSummaryPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        console.error('ExecutiveSummaryFlow: LLM returned no output.');
        return {
          executiveSummary: "Error: Could not generate executive summary. LLM returned no output.",
          confidenceScore: 0,
        };
  }
      return output;
    } catch (error: any) {
      console.error("Error in executiveSummaryFlow:", error);
      return {
        executiveSummary: `Error generating executive summary: ${error.message}`,
        confidenceScore: 0,
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
