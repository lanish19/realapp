'use server';
/**
 * @fileOverview Generates a site description for a property.
 * **This agent MUST use its web search capabilities extensively** to find ALL necessary details about the property,
 * including but not limited to: precise location, parcel ID, legal description, lot size/dimensions, topography,
 * access, visibility, zoning (specific code and allowances), utilities, flood zone, improvements (type, size, age, construction, condition),
 * easements, and surrounding neighborhood characteristics.
 *
 * - generateSiteDescription - A function that generates the site description.
 * - SiteDescriptionInput - The input type for the generateSiteDescription function.
 * - SiteDescriptionOutput - The return type for the generateSiteDescription function.
 */

import {ai} from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const SiteDescriptionInputSchema = z.object({
  address: z.string().describe('The full street address of the property. This is the primary key for web search.'),
  city: z.string().describe('The city where the property is located. Used to narrow web search.'),
  county: z.string().describe('The county where the property is located. Used to narrow web search.'),
  propertyTypeGeneral: z.string().optional().describe('A general classification of the property type (e.g., "Commercial Property", "Residential Property") to help guide initial web search queries for relevant details.'),
  // Removed most other direct inputs as the agent must now find them via web search.
});
export type SiteDescriptionInput = z.infer<typeof SiteDescriptionInputSchema>;

// Refactored: Structured output schema for site description
const SiteDescriptionOutputSchema = z.object({
  parcelId: z.string().optional().describe("Assessor's Parcel Number (APN)."),
  legalDescriptionSource: z.string().optional().describe("Source or reference for the legal description, e.g., 'Deed Book X, Page Y' or 'See Addendum'."),
  lotSizeAcres: z.number().optional(),
  lotSizeSqFt: z.number().optional(),
  lotDimensions: z.string().optional().describe("Approximate dimensions or shape."),
  topography: z.string().optional(),
  accessDetails: z.string().optional(),
  visibility: z.string().optional(),
  zoningCode: z.string().optional().describe("Specific zoning designation, e.g., C-2, R-1."),
  zoningDescription: z.string().optional().describe("Brief description of the zoning category."),
  permittedUsesSummary: z.string().optional().describe("Summary of key permitted uses under the zoning code."),
  keyDimensionalRequirements: z.string().optional().describe("Key restrictions like setbacks, height, FAR."),
  utilitiesAvailable: z.array(z.string()).optional().describe("List of available utilities, e.g., ['Water', 'Sewer', 'Electric', 'Gas']."),
  femaFloodZoneId: z.string().optional().describe("E.g., 'Zone X', 'AE'."),
  femaPanelNumber: z.string().optional(),
  femaMapEffectiveDate: z.string().optional(),
  easementsObservedOrReported: z.string().optional(),
  environmentalConcernsNoted: z.string().optional(),
  siteImprovementsNarrative: z.string().optional().describe("Parking, landscaping etc."),
  improvementsSummary: z.object({
    type: z.string(),
    sizeSqFt: z.number().optional(),
    yearBuilt: z.number().optional(),
    condition: z.string().optional(),
  }).optional(),
  narrativeSummary: z.string().describe("Overall descriptive narrative, synthesized from the above structured data and any unstructurable observations."),
  confidenceScores: z.record(z.number()).optional().describe("Confidence for each key data point, e.g., { parcelId: 0.9, zoningCode: 0.7 }"),
});
export type SiteDescriptionOutput = z.infer<typeof SiteDescriptionOutputSchema>;

export async function generateSiteDescription(input: SiteDescriptionInput): Promise<SiteDescriptionOutput> {
  return siteDescriptionFlow(input);
}

export async function generateSiteDescriptionWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: SiteDescriptionInput = {
    address: caseFile.propertyAddress,
    city: caseFile.city,
    county: caseFile.county,
    propertyTypeGeneral: caseFile.propertyDetails?.general?.propertyType || undefined,
  };
  // Pass the caseFile to the context of siteDescriptionFlow
  const result = await siteDescriptionFlow(input, { caseFile });

  // Assuming AppraisalCaseFile.propertyDetails can store these fields
  // and AppraisalCaseFile.confidenceScores can be structured per section
  const updatedPropertyDetails = {
    ...caseFile.propertyDetails,
    parcelId: result.parcelId,
    legalDescriptionSource: result.legalDescriptionSource,
    lotSizeAcres: result.lotSizeAcres,
    lotSizeSqFt: result.lotSizeSqFt,
    lotDimensions: result.lotDimensions,
    topography: result.topography,
    accessDetails: result.accessDetails,
    visibility: result.visibility,
    zoningCode: result.zoningCode,
    zoningDescription: result.zoningDescription,
    permittedUsesSummary: result.permittedUsesSummary,
    keyDimensionalRequirements: result.keyDimensionalRequirements,
    utilitiesAvailable: result.utilitiesAvailable,
    femaFloodZoneId: result.femaFloodZoneId,
    femaPanelNumber: result.femaPanelNumber,
    femaMapEffectiveDate: result.femaMapEffectiveDate,
    easementsObservedOrReported: result.easementsObservedOrReported,
    environmentalConcernsNoted: result.environmentalConcernsNoted,
    siteImprovementsNarrative: result.siteImprovementsNarrative,
    improvementsSummary: result.improvementsSummary,
    // Storing the specific confidence scores for site details here
    // This assumes propertyDetails might have a confidenceScores field
    // or we might store it at a higher level like caseFile.confidenceScores.siteDescription
    confidenceScores: result.confidenceScores 
  };

  return {
    propertyDetails: updatedPropertyDetails,
    narratives: {
      ...caseFile.narratives,
      siteDescription: result.narrativeSummary, // Use narrativeSummary from the structured output
    },
    // It might be better to have a dedicated section in AppraisalCaseFile for confidence scores by agent/section
    // For now, placing site-specific confidences within propertyDetails as shown above,
    // or if there's a general structure:
    // confidenceScores: {
    //   ...caseFile.confidenceScores,
    //   siteDescription: result.confidenceScores,
    // }
  };
}

// New: Dynamic prompt assembly function
function assembleSiteDescriptionPrompt(caseFile: AppraisalCaseFile): string {
  const address = caseFile.propertyAddress || '[Address Not Provided]';
  const city = caseFile.city || '[City Not Provided]';
  const county = caseFile.county || '[County Not Provided]';
  const state = caseFile.state || 'MA'; // Default to MA
  const propertyTypeGeneral = caseFile.propertyDetails?.type || '[Property Type Not Provided]';
  
  // Attempt to get Parcel ID if already found by dataExtractionTool or similar
  const existingParcelId = caseFile.propertyDetails?.parcelId || '[Parcel ID Not Yet Searched]';

  return `You are an expert real estate appraiser AI assistant tasked with drafting a highly detailed and comprehensive Site Description section for an appraisal report. You will act as if you are performing research for "Lane Valuation group" and your output must be suitable for an expert appraiser, Peter Lane.

**Your PRIMARY task is to output a structured JSON object with the following fields:**
- parcelId: string (Assessor's Parcel Number)
- legalDescriptionSource: string (e.g., 'Deed Book X, Page Y' or 'See Addendum')
- lotSizeAcres: number
- lotSizeSqFt: number
- lotDimensions: string (Approximate dimensions or shape, e.g., '150.25 ft frontage x 200.50 ft depth')
- topography: string (Detailed description, e.g., 'Generally level at street grade, slight rearward slope')
- accessDetails: string (Detailed description of curb cuts, driveways, etc.)
- visibility: string (Detailed description from street, traffic counts if possible)
- zoningCode: string (Specific zoning designation, e.g., C-2, R-1)
- zoningDescription: string (Brief official description of the zoning category)
- permittedUsesSummary: string (Summary of key permitted uses under the zoning code, citing bylaw section if found)
- keyDimensionalRequirements: string (Key restrictions like setbacks, height, FAR, lot coverage, parking, citing bylaw section if found)
- utilitiesAvailable: array of strings (List of available public utilities, e.g., ["Municipal Water", "Municipal Sewer", "Natural Gas (Eversource)", "Electricity (National Grid)"])
- femaFloodZoneId: string (E.g., 'Zone X', 'AE')
- femaPanelNumber: string (Full FEMA panel number)
- femaMapEffectiveDate: string (Date of the effective FEMA map)
- easementsObservedOrReported: string (Details of any easements found or noted)
- environmentalConcernsNoted: string (Details of any environmental concerns found or noted)
- siteImprovementsNarrative: string (Descriptive narrative of parking, landscaping, walkways, etc.)
- improvementsSummary: object { type: string, sizeSqFt: number (optional), yearBuilt: number (optional), condition: string (optional) } (Summary of main building)
- confidenceScores: object (Confidence for each key data point, e.g., { parcelId: 0.9, zoningCode: 0.7, femaFloodZoneId: 1.0 })

**After outputting ALL structured fields, you MUST synthesize a single 'narrativeSummary' string. This narrativeSummary MUST be based SOLELY on the structured data fields you have just outputted. It should weave them together into a professional, descriptive narrative, as if written by an expert appraiser for Lane Valuation group.**

Property: ${address}, ${city}, ${county}, ${state}
${propertyTypeGeneral !== '[Property Type Not Provided]' ? `General Property Type: '${propertyTypeGeneral}'. Use this to guide your search for typical improvements and relevant details.` : ''}
${existingParcelId !== '[Parcel ID Not Yet Searched]' ? `An existing Parcel ID is noted as: '${existingParcelId}'. Verify this and use it in your searches if confirmed.` : ''}

**Core Instruction for Web Search:** Your primary role is to meticulously research and verify ALL site characteristics using the google_search tool. For each item below, formulate specific search queries aimed at official Eastern Massachusetts public data sources (municipal assessor databases, GIS/Zoning portals, MassLandRecords for the specific county, FEMA MSC). Refer to specialized data source guides provided if they help in naming these sources. If data is not found after diligent search, explicitly state that for the specific item and assign a low confidence score. **Cite the specific source and date of data extraction for each finding (e.g., "${city} Assessor Online Database, accessed 2024-10-27").**

**Detailed Information to Find via Simulated Extensive Web Search of Official Sources:**

1.  **Parcel ID (APN):** Verify or find the APN.
    *   Queries: "${county} county parcel viewer ${address}", "${city} ${county} property tax records ${address}", "${city} MA assessor data ${address}".
    *   If \`${existingParcelId}\` was provided, use it to refine searches: "${county} county parcel data for APN ${existingParcelId}".

2.  **Legal Description Reference:** Attempt to find a reference to the legal description (e.g., Deed Book/Page).
    *   Queries: "${county} county registry of deeds search for parcel ${address}" (if Parcel ID found, use it: "${county} county registry of deeds search for APN [Found Parcel ID]"), "Search MassLandRecords.com ${county} for deed of ${address}".
    *   Source: MassLandRecords.com for the relevant part of ${county} (e.g. Middlesex South, Essex North Registry of Deeds).

3.  **Lot Size (Acres & SqFt) & Dimensions:** Search for lot size and approximate dimensions.
    *   Queries: (As for APN, often found with parcel data). "${city} MA GIS map ${address} measure lot dimensions".
    *   Output specific dimensions found, e.g., "150.25 ft frontage on Main St, 200.50 ft depth".

4.  **Topography:** Search for topographic information. Describe in detail.
    *   Queries: "${county} county GIS topographic map ${address}", "${city} elevation data ${address}", "View topographic layer ${city} GIS for ${address}".
    *   Example description: "The site is generally level at street grade along its frontage with Main Street, sloping gently downwards from east to west by approximately 3 feet across its width. The rear portion of the site experiences a more pronounced downward slope towards the adjacent wetland area, with an estimated grade change of 8-10 feet."

5.  **Access Details:** Describe all points of vehicular and pedestrian access in detail.
    *   Queries: Review GIS maps, assessor property cards. "${city} MA property card ${address} access description".
    *   Example description: "Vehicular access is provided by two 25-foot wide asphalt-paved curb cuts along Main Street, located at the eastern and westernmost extents of the site frontage. A concrete sidewalk extends along the entire Main Street frontage, providing pedestrian access."

6.  **Visibility:** Describe property visibility from surrounding thoroughfares. Mention traffic counts if found.
    *   Queries: "MassDOT traffic volume map near ${address}, ${city}", Review GIS and street-level imagery if possible (simulate this).
    *   Example description: "The property has approximately 150 feet of direct, unobstructed frontage along Main Street, a four-lane arterial road. Visibility is considered excellent for both eastbound and westbound traffic. According to MassDOT 2023 data, Main Street at this location has an Average Annual Daily Traffic (AADT) count of approximately 18,500 vehicles."

7.  **Zoning (CRITICAL - Two-Step Process, cite specific bylaw sections if found):**
    a.  **Identify Specific Zoning Code:** Find the exact zoning designation (e.g., 'GB', 'Commercial-2').
        *   Queries: "${city} MA zoning map ${address}", "what is the zoning for ${address} ${city} MA official site", "${city} GIS portal zoning layer for ${address}".
    b.  **Research Zoning Code Details:** Once zone code is found, research its details IN THE ACTUAL MUNICIPAL ZONING ORDINANCE/BYLAW DOCUMENT.
        *   Queries: "${city} MA zoning ordinance PDF", then search within PDF for "[Identified Zone Code] permitted uses", "${city} MA zoning bylaw [Identified Zone Code] dimensional requirements table", "${city} zoning code [Identified Zone Code] setbacks height FAR parking".
        *   Output: \`zoningCode\`, \`zoningDescription\` (e.g., "GB - General Business, per Section 4.2 of the ${city} Zoning Bylaw"), \`permittedUsesSummary\` (list key PERMITTED uses by right/special permit), \`keyDimensionalRequirements\` (specific setbacks ft/m, max height ft/m, max FAR, min lot size, max lot coverage %, parking space requirements per 1000 SF or unit, citing bylaw sections if possible, e.g., "Front Setback: 20 ft (Sec 4.2.1)").

8.  **Utilities Available:** Identify available public utilities (Water, Sewer, Electric, Gas, Telecom). Specify provider if known (e.g., Eversource, National Grid, Verizon Fios).
    *   Queries: "${city} MA public water service area map", "${city} public sewer map ${address}", "[Local Gas Co. for ${city}] service map ${address}", "[Local Electric Co. for ${city}] service territory". Assessor cards might also note this.

9.  **FEMA Flood Zone:** Determine FEMA flood zone ID, full panel number, and map effective date. Interpret the zone (e.g., minimal hazard, 1% annual chance flood). VERY IMPORTANT to get this right from the official source.
    *   Queries: "FEMA flood map ${address} ${city} ${state}", "FEMA Map Service Center search by address ${address}".
    *   Source: Official FEMA Flood Map Service Center (msc.fema.gov).

10. **Easements Observed or Reported:** Search for publicly recorded easements or note if none are apparent from typical sources. This is difficult and may yield no results for unrecorded easements.
    *   Queries: "Search MassLandRecords.com ${county} for easements on parcel [Found Parcel ID]", "${city} planning board records ${address} easements".
    *   State if search was inconclusive for typical recorded easements.

11. **Environmental Concerns Noted:** Check for obvious, publicly documented environmental concerns. This is NOT a Phase I ESA.
    *   Queries: "MA DEP site lookup ${address}", "${city} environmental records ${address} contamination".
    *   State if no public records of concern were found via these typical high-level checks.

12. **Site Improvements Narrative:** Describe non-building improvements (parking, landscaping, lighting, signage, fencing, walkways).
    *   Queries: Assessor property cards, GIS aerial imagery review (simulate). "${city} MA property card ${address} site improvements description".
    *   Example: "Site improvements include an asphalt-paved parking lot for approximately 30 vehicles with painted stalls, concrete walkways leading to the main entrance, pole-mounted exterior lighting, and mature landscaping along the front property line."

13. **Improvements Summary (Main Building):** Find basic building details (type, approx. GBA/GLA in SF, year built, general condition from assessor if noted, e.g., 'Average', 'Good').
    *   Queries: "${city} MA assessor database building details for ${address}", "${city} property card ${address} improvement data".

**Output Format Reminder:**
- Output a single JSON object with all the above fields accurately populated based on your simulated official source searches.
- The \`narrativeSummary\` field **must** be a professional, highly descriptive narrative synthesized *only* from the structured data fields you found and outputted. It should not introduce new information.
- If specific information for any point cannot be found despite diligent search of official sources, clearly state that in the relevant structured field (e.g., "Specific details on interior finishes were not discoverable through simulated official web searches.") and assign a low confidence score for that field. Do not invent data.

**Final Instruction on Style and Depth (Lane Valuation group Standard for Peter Lane):**
Ensure your entire output, especially the narrative sections and the detail within structured fields, adopts the tone, style, and analytical depth expected in a formal appraisal report prepared by a leading commercial valuation firm, Lane Valuation group. This requires being **highly specific** (e.g., citing actual measurements from GIS/plans, traffic counts from MassDOT, specific zoning bylaw section numbers, official source names like '${city} Assessor Database, data extracted YYYY-MM-DD'), **data-driven**, citing sources meticulously, and providing **in-depth, well-supported descriptions and reasoning**. Avoid vague statements (e.g., instead of 'good access', describe the curb cuts, driveway width, and traffic flow). Aim for precision, comprehensive detail, and professional language suitable for expert review by senior appraiser Peter Lane.

---
Generate the detailed Site Description section as a structured JSON object, then synthesize the narrativeSummary from those fields:
`;
}

// Refactored: Use dynamic prompt assembly in the flow
const siteDescriptionPrompt = ai.definePrompt({
  name: 'siteDescriptionPrompt',
  input: {schema: SiteDescriptionInputSchema},
  output: {schema: SiteDescriptionOutputSchema},
  prompt: '', // Will be set dynamically
});

export const siteDescriptionFlow = ai.defineFlow(
  {
    name: 'siteDescriptionFlow',
    inputSchema: SiteDescriptionInputSchema,
    outputSchema: SiteDescriptionOutputSchema,
  },
  async (input: SiteDescriptionInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleSiteDescriptionPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...siteDescriptionPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        console.error('SiteDescriptionFlow: LLM returned no output.');
        // Return a default/error structure conforming to SiteDescriptionOutputSchema
        return {
          narrativeSummary: "Error: Could not generate site description. LLM returned no output.",
          confidenceScores: { overall: 0 },
          // Initialize other fields as optional or with default error values
          parcelId: "ERROR",
        };
  }
      return output;
    } catch (error: any) {
      console.error("Error in siteDescriptionFlow:", error);
      // Return a default/error structure conforming to SiteDescriptionOutputSchema
      return {
        narrativeSummary: `Error generating site description: ${error.message}`,
        confidenceScores: { overall: 0 },
        parcelId: "ERROR",
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
