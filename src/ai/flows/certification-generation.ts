// src/ai/flows/certification-generation.ts
'use server';
/**
 * @fileOverview Generates the Appraiser's Certification for an appraisal report.
 * Relies on provided appraiser details and value conclusions.
 * **Must use web search** for standard USPAP wording or limiting conditions if uncertain or if templates need verification.
 *
 * - generateCertification - A function that generates the certification text.
 * - CertificationInput - The input type for the generateCertification function.
 * - CertificationOutput - The return type for the generateCertification function.
 */

import {ai} from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const CertificationInputSchema = z.object({
  reportDate: z.string().describe('The date of the appraisal report.'),
  appraiserName: z.string().describe('The name of the appraiser.'),
  appraiserLicense: z.string().describe('The license number of the appraiser.'),
  appraisedValue: z.string().describe('The final appraised value of the property.'),
  propertyAddress: z.string().describe('The address of the property being appraised (user input).'),
  effectiveDateOfValue: z.string().describe('The effective date of the valuation.'),
  intendedUser: z.string().describe('The intended user of the appraisal report (user input).'),
  intendedUse: z.string().describe('The intended use of the appraisal (user input).'),
});
export type CertificationInput = z.infer<typeof CertificationInputSchema>;

const CertificationOutputSchema = z.object({
  certificationText: z.string().describe('The generated appraiser\'s certification statement including limiting conditions, based on standard templates and provided details. USPAP compliance is critical and should be verified via web search if necessary.'),
  confidenceScore: z.number().optional().describe('Overall confidence in the certification (0.0-1.0), based on the reliability and completeness of the USPAP language and all included information.'),
});
export type CertificationOutput = z.infer<typeof CertificationOutputSchema>;

export async function generateCertification(input: CertificationInput): Promise<CertificationOutput> {
  // Create a minimal AppraisalCaseFile object from the input
  const minimalCaseFile: Partial<AppraisalCaseFile> = {
    reportDate: input.reportDate,
    appraiserDetails: {
      name: input.appraiserName,
      license: input.appraiserLicense,
    },
    // Attempt to parse string value like "$1,234,567" to number
    finalReconciledValue: parseFloat(input.appraisedValue.replace(/[^\d.-]/g, '')) || 0, 
    propertyAddress: input.propertyAddress,
    effectiveDate: input.effectiveDateOfValue,
    intendedUser: input.intendedUser,
    intendedUse: input.intendedUse,
    // Note: Other fields of AppraisalCaseFile are not present here.
    // assembleCertificationPrompt only uses the fields defined above.
  };

  // Call certificationFlow with the minimalCaseFile in the context
  // The 'as AppraisalCaseFile' assertion is used because certificationFlow's context expects a full AppraisalCaseFile,
  // but assembleCertificationPrompt (the actual consumer via context) is designed to handle these minimal fields.
  return certificationFlow(input, { caseFile: minimalCaseFile as AppraisalCaseFile });
}

export async function generateCertificationWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: CertificationInput = {
    reportDate: caseFile.reportDate || '',
    appraiserName: caseFile.appraiserDetails?.name || '',
    appraiserLicense: caseFile.appraiserDetails?.license || '',
    appraisedValue: caseFile.finalReconciledValue ? `\$${caseFile.finalReconciledValue.toLocaleString()}` : 'Value Not Determined',
    propertyAddress: caseFile.propertyAddress,
    effectiveDateOfValue: caseFile.effectiveDate || '',
    intendedUser: caseFile.intendedUser,
    intendedUse: caseFile.intendedUse,
  };
  const result = await certificationFlow(input, { caseFile });
  return {
    narratives: {
      ...caseFile.narratives,
      certification: result.certificationText,
    },
  };
}

// New: Dynamic prompt assembly function
function assembleCertificationPrompt(caseFile: AppraisalCaseFile): string {
  const reportDate = caseFile.reportDate || '[Report Date Not Set]';
  const appraiserName = caseFile.appraiserDetails?.name || '[Appraiser Name Not Provided]';
  const appraiserLicense = caseFile.appraiserDetails?.license || '[Appraiser License Not Provided]';
  const appraisedValue = caseFile.finalReconciledValue 
    ? `\$${caseFile.finalReconciledValue.toLocaleString()}` 
    : '[Appraised Value Not Determined]';
  const propertyAddress = caseFile.propertyAddress || '[Property Address Not Found]';
  const effectiveDateOfValue = caseFile.effectiveDate || '[Effective Date Not Set]';
  const intendedUser = caseFile.intendedUser || '[Intended User Not Found]';
  const intendedUse = caseFile.intendedUse || '[Intended Use Not Found]';
  return `You are an expert real estate appraiser AI assistant tasked with generating a standard Appraiser's Certification and Limiting Conditions for a real estate appraisal report.\nUse the provided information to fill in the details. The text must adhere to USPAP (Uniform Standards of Professional Appraisal Practice) guidelines and common industry standards.\n\n**Proactive Web Search Requirement:**\nIf there is any uncertainty regarding the current standard USPAP wording for certification statements or limiting conditions, or if templates need verification against the *current USPAP edition* (e.g., USPAP 2024-2025), you **MUST use your web search capabilities**.\n\n**For missing or uncertain language, formulate and report specific search queries such as:**\n- 'USPAP [current edition year] standard certification text'\n- 'USPAP [current edition year] appraiser limiting conditions'\n\nYour goal is to produce a compliant and professional certification.\n\n**Property and Assignment Details:**\nProperty Address: ${propertyAddress}\nAppraised Value: ${appraisedValue}\nEffective Date of Value: ${effectiveDateOfValue}\nReport Date: ${reportDate}\nAppraiser Name: ${appraiserName}\nAppraiser License: ${appraiserLicense}\nIntended User: ${intendedUser}\nIntended Use: ${intendedUse}\n\n**Instructions:**\nGenerate a comprehensive Appraiser's Certification that includes statements regarding:\n- Impartiality and objectivity.\n- No present or prospective interest in the property.\n- Compliance with USPAP (Uniform Standards of Professional Appraisal Practice) - **verify current phrasing via web search if needed**.\n- Personal inspection of the property (assume a standard inspection was made by ${appraiserName}).\n- Belief that the statements of fact contained in the report are true and correct.\n- That the reported analyses, opinions, and conclusions are limited only by the reported assumptions and limiting conditions and are ${appraiserName}'s personal, impartial, and unbiased professional analyses, opinions, and conclusions.\n- That ${appraiserName}'s compensation is not contingent upon the reporting of a predetermined value or direction in value that favors the cause of the client, the amount of the value opinion, the attainment of a stipulated result, or the occurrence of a subsequent event.\n- That the appraisal assignment was not based on a requested minimum valuation, a specific valuation, or the approval of a loan.\n- And any other commonly included certification points according to USPAP, which you **must verify via web search** if needed to ensure completeness and accuracy.\n\nFollow this with a standard set of General Assumptions and Limiting Conditions. Examples include:\n- The appraiser assumes no responsibility for matters of a legal nature.\n- Information furnished by others is assumed to be true, correct, and reliable.\n- The property is appraised free and clear of any or all liens or encumbrances unless otherwise stated.\n- The existence of hazardous materials, which may or may not be present on the property, was not observed by the appraiser. The appraiser has no knowledge of the existence of such materials on or in the property. The appraiser, however, is not qualified to detect such substances.\n- And other typical limiting conditions. **Use web search to find common examples and ensure comprehensive coverage if you are unsure.**\n\nFormat the output as a single block of text suitable for inclusion in a formal report.\nThe signature line should be for ${appraiserName}, with ${appraiserLicense} below it.\n\nAt the end, assign a confidenceScore (0.0-1.0) for the certification, based on the reliability and completeness of the USPAP language and all included information.`;
}

// Refactored: Use dynamic prompt assembly in the flow
const certificationPrompt = ai.definePrompt({
  name: 'certificationPrompt',
  input: {schema: CertificationInputSchema},
  output: {schema: CertificationOutputSchema},
  prompt: '', // Will be set dynamically
});

export const certificationFlow = ai.defineFlow(
  {
    name: 'certificationFlow',
    inputSchema: CertificationInputSchema,
    outputSchema: CertificationOutputSchema,
  },
  async (input: CertificationInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleCertificationPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...certificationPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        console.error('CertificationFlow: LLM returned no output.');
        return {
          certificationText: "Error: Could not generate certification. LLM returned no output.",
          confidenceScore: 0,
        };
  }
      return output;
    } catch (error: any) {
      console.error("Error in certificationFlow:", error);
      return {
        certificationText: `Error generating certification: ${error.message}`,
        confidenceScore: 0,
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
