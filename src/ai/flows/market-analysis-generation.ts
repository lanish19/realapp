'use server';

/**
 * @fileOverview Generates a market overview with economic and demographic data.
 * **This agent MUST use its web search capabilities extensively** to find the most current and specific data for
 * economic drivers, major industries/employers, unemployment rates, population figures, income levels,
 * poverty rates, market conditions (vacancy, rental/value trends, new construction, absorption, investor sentiment),
 * and preliminary comparable sales. It should treat any contextual input as a starting point for deeper investigation.
 *
 * - generateMarketAnalysis - A function that generates the market analysis.
 * - MarketAnalysisInput - The input type for the generateMarketAnalysis function.
 * - MarketAnalysisOutput - The return type for the generateMarketAnalysis function.
 */

import {ai}from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const MarketAnalysisInputSchema = z.object({
  city: z.string().describe('The city for the market analysis. This is a key parameter for web search.'),
  county: z.string().describe('The county for the market analysis. This is a key parameter for web search.'),
  propertyAddress: z.string().optional().describe('The full property address, to help refine neighborhood/submarket analysis via web search.'),
  propertyType: z.string().optional().describe('The general type of property being appraised (e.g., Commercial Retail, Industrial Warehouse), to help focus market condition analysis and comparable sales research via web search.'),
});
export type MarketAnalysisInput = z.infer<typeof MarketAnalysisInputSchema>;

// Refactored: Structured output schema for market analysis
const MarketAnalysisOutputSchema = z.object({
  // Economic Overview
  majorIndustries: z.array(z.string()).optional(),
  majorEmployers: z.array(z.string()).optional(),
  unemploymentRateCounty: z.number().optional(),
  unemploymentRateState: z.number().optional(),
  unemploymentTrend: z.string().optional(),
  significantEconomicDevelopments: z.string().optional(),
  // Demographic Data
  populationCity: z.number().optional(),
  populationCounty: z.number().optional(),
  populationChangePercent: z.number().optional(),
  medianHouseholdIncome: z.number().optional(),
  perCapitaIncome: z.number().optional(),
  povertyRate: z.number().optional(),
  demographicTrends: z.string().optional(),
  // Market Conditions
  propertyTypeVacancyRate: z.number().optional(),
  propertyTypeAvgRentalRate: z.string().optional(),
  newConstructionActivity: z.string().optional(),
  absorptionRate: z.string().optional(),
  investorSentiment: z.string().optional(),
  capRateTrends: z.string().optional(),
  salesActivitySummary: z.string().optional(),
  neighborhoodSubmarketAnalysis: z.string().optional(),
  // Preliminary Comparable Sales
  preliminaryComparableSales: z.array(z.object({
    address: z.string(),
    saleDate: z.string(),
    salePrice: z.number(),
    sizeSqFt: z.number().optional(),
    propertyType: z.string(),
    source: z.string(),
    confidenceScore: z.number(),
  })).optional(),
  // Narrative
  narrativeSummary: z.string().describe('A synthesized narrative summary based on the above structured data.'),
  // Confidence scores
  confidenceScores: z.record(z.number()).optional().describe('Confidence for each key data point.'),
});
export type MarketAnalysisOutput = z.infer<typeof MarketAnalysisOutputSchema>;

export async function generateMarketAnalysis(input: MarketAnalysisInput): Promise<MarketAnalysisOutput> {
  return marketAnalysisFlow(input);
}

export async function generateMarketAnalysisWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: MarketAnalysisInput = {
    city: caseFile.city,
    county: caseFile.county,
    propertyAddress: caseFile.propertyAddress,
    propertyType: caseFile.propertyDetails?.general?.propertyType || undefined,
  };
  const result = await marketAnalysisFlow(input, { caseFile });

  const updatedMarketData = {
    ...caseFile.marketData,
    majorIndustries: result.majorIndustries,
    majorEmployers: result.majorEmployers,
    unemploymentRateCounty: result.unemploymentRateCounty,
    unemploymentRateState: result.unemploymentRateState,
    unemploymentTrend: result.unemploymentTrend,
    significantEconomicDevelopments: result.significantEconomicDevelopments,
    populationCity: result.populationCity,
    populationCounty: result.populationCounty,
    populationChangePercent: result.populationChangePercent,
    medianHouseholdIncome: result.medianHouseholdIncome,
    perCapitaIncome: result.perCapitaIncome,
    povertyRate: result.povertyRate,
    demographicTrends: result.demographicTrends,
    propertyTypeVacancyRate: result.propertyTypeVacancyRate,
    propertyTypeAvgRentalRate: result.propertyTypeAvgRentalRate,
    newConstructionActivity: result.newConstructionActivity,
    absorptionRate: result.absorptionRate,
    investorSentiment: result.investorSentiment,
    capRateTrends: result.capRateTrends,
    salesActivitySummary: result.salesActivitySummary,
    neighborhoodSubmarketAnalysis: result.neighborhoodSubmarketAnalysis,
    preliminaryComparableSales: result.preliminaryComparableSales,
    confidenceScores: result.confidenceScores,
  };

  return {
    marketData: updatedMarketData,
    narratives: {
      ...caseFile.narratives,
      marketAnalysis: result.narrativeSummary,
    },
  };
}

// New: Dynamic prompt assembly function
function assembleMarketAnalysisPrompt(caseFile: AppraisalCaseFile): string {
  const city = caseFile.city || '[City Not Provided]';
  const county = caseFile.county || '[County Not Provided]';
  const propertyAddress = caseFile.propertyAddress || '[Property Address Not Provided]';
  const propertyType = caseFile.propertyDetails?.type || '[Property Type Not Provided]';
  const state = caseFile.state || 'MA'; // Assuming MA if not specified

  let regionalPlanningAgencyHint = "relevant Massachusetts regional planning agency reports (e.g., from MAPC, MVPC, OCPC, NMCOG, SRPEDD, CCC, BRPC) or statewide economic development sites (e.g., MassEcon, MassDevelopment)";
  if (county.includes('Suffolk') || county.includes('Middlesex') || county.includes('Norfolk') || city === "Boston" || city === "Cambridge" || city === "Somerville" || city === "Brookline" || city === "Newton") {
    regionalPlanningAgencyHint = "Metropolitan Area Planning Council (MAPC) resources like DataCommon, MassBuilds, or Greater Boston Research reports";
  } else if (county.includes('Essex') && (['Amesbury', 'Andover', 'Boxford', 'Georgetown', 'Groveland', 'Haverhill', 'Lawrence', 'Merrimac', 'Methuen', 'Newbury', 'Newburyport', 'North Andover', 'Rowley', 'Salisbury', 'West Newbury'].some(c => city.includes(c)))) {
    regionalPlanningAgencyHint = "Merrimack Valley Planning Commission (MVPC) data and reports";
  } else if (county.includes('Plymouth') && (['Abington', 'Bridgewater', 'Brockton', 'Carver', 'Duxbury', 'East Bridgewater', 'Halifax', 'Hanover', 'Hanson', 'Kingston', 'Lakeville', 'Marion', 'Marshfield', 'Mattapoisett', 'Middleborough', 'Norwell', 'Pembroke', 'Plymouth', 'Plympton', 'Rochester', 'Rockland', 'Scituate', 'Wareham', 'West Bridgewater', 'Whitman'].some(c => city.includes(c)))) {
    regionalPlanningAgencyHint = "Old Colony Planning Council (OCPC) data and reports";
  }
  
  const propertyTypeSpecific = propertyType !== '[Property Type Not Provided]';
  const propertyTypeForQueries = propertyTypeSpecific ? propertyType : "commercial property";

  let prompt = "You are an expert real estate market analyst AI assistant preparing the Market Overview (Regional and Neighborhood Analysis) for an appraisal by \"Lane Valuation group\" for Peter Lane.";
  prompt += " Your analysis must be exceptionally detailed, data-driven, and reflect deep research using official and reputable specialized sources.\\n";
  prompt += "\\n**Primary Output Requirement: Structured JSON Object**\\n";
  prompt += "Your entire response **MUST** be a single JSON object containing all fields defined in the MarketAnalysisOutputSchema. These include, but are not limited to: `majorIndustries`, `majorEmployers`, `unemploymentRateCounty`, `unemploymentRateState`, `unemploymentTrend`, `significantEconomicDevelopments`, `populationCity`, `populationCounty`, `populationChangePercent`, `medianHouseholdIncome`, `perCapitaIncome`, `povertyRate`, `demographicTrends`, `propertyTypeVacancyRate`, `propertyTypeAvgRentalRate`, `newConstructionActivity`, `absorptionRate`, `investorSentiment`, `capRateTrends`, `salesActivitySummary`, `neighborhoodSubmarketAnalysis`, `preliminaryComparableSales` (array of objects), and `confidenceScores` (object mapping fields to scores 0.0-1.0).\\n";
  prompt += "\\n**Secondary Output Requirement: Synthesized Narrative Summary**\\n";
  prompt += `After ALL structured fields are populated, you **MUST** create a \\\`narrativeSummary\\\` field within the JSON. This string must be a professional, cohesive narrative that synthesizes and interprets the structured data you have gathered. It should highlight key trends, their implications for the ${propertyTypeForQueries} market in ${city}/${county}, and adopt the analytical depth expected by Lane Valuation group. **Do NOT introduce new data in the narrative; it must solely be derived from your structured findings.**\\n`;
  prompt += `\\n**Area of Analysis:** City of ${city}, ${county} County, ${state}.\\n`;
  prompt += `**Property Type Focus (if specified):** ${propertyTypeSpecific ? propertyType : 'General commercial trends'}.\\n`;
  prompt += `**Subject Property (for context):** ${propertyAddress !== '[Property Address Not Provided]' ? propertyAddress : 'Not specified, focus on general area'}.\\n`;
  prompt += "\\n**Mandatory Web Search & Sourcing Protocol:**\\n";
  prompt += `You **MUST** use the \\\`google_search\\\` tool for **EVERY** piece of information. Do not use pre-existing knowledge. Prioritize: 1. Official government sources (e.g., bls.gov, data.census.gov, municipal/county .gov sites). 2. Reputable specialized Eastern MA / New England real estate data providers (e.g., NAIOP Massachusetts, Greater Boston Real Estate Board (GBREB) reports, ${regionalPlanningAgencyHint}, The Warren Group, Banker & Tradesman). 3. Major commercial real estate brokerage research reports (CBRE, JLL, Cushman & Wakefield - ensure data is recent and publicly cited). For each data point, CITE THE SPECIFIC SOURCE NAME AND DATA PERIOD/REPORT DATE (e.g., "U.S. BLS, LAUS, October 2024 (preliminary), released Nov 2024", "NAIOP Greater Boston Q4 2024 Office Market Report"). If a diligent search for a specific item yields no reliable data, explicitly state that in its field and assign a low confidenceScore.\\n`;
  prompt += "\\n**Confidence Scores:** For each key metric in your structured JSON, assign a confidence score (0.0 to 1.0) in the `confidenceScores` object, reflecting source reliability and data specificity.\\n";
  prompt += "\\n**DETAILED RESEARCH REQUIREMENTS (populate these in the JSON):**\\n";
  prompt += `\\n**1. Economic Overview (${county} County & ${city}):**\\n`;
  prompt += `    *   **Major Industries & Employers:** Identify 3-5 primary industries and specific major employers. Discuss recent trends/shifts.\\n`;
  prompt += `        *   Queries: \\\`official economic profile ${city} ${state}\\\`, \\\`largest employers ${county} ${state} by industry [year]\\\`, \\\`economic drivers ${city} MA site:.gov OR site:.org\\\`, \\\`annual report ${city} economic development agency [year]\\\`\\n`;
  prompt += `        *   Sources: ${city}/${county} official economic development websites, ${regionalPlanningAgencyHint}, MassEcon, local Chamber of Commerce. Cite specific reports/dates.\\n`;
  prompt += `    *   **Unemployment Data:** Current unemployment rates for ${county} (or MSA) & ${state}. Compare to national; discuss trends (1-3 yrs). Specific figures, dates, sources.\\n`;
  prompt += `        *   Queries: \\\`BLS LAUS data ${county} ${state}\\\`, \\\`MA EOLWD unemployment report ${county} [recent month year]\\\`\\n`;
  prompt += `        *   Sources: U.S. Bureau of Labor Statistics (LAUS), MA Executive Office of Labor and Workforce Development (EOLWD). Cite data series & period.\\n`;
  prompt += `    *   **Significant Economic Developments:** Major recent (12-24 months) investments, corporate moves, infrastructure projects. Potential impact.\\n`;
  prompt += `        *   Queries: \\\`${city} MA major business investments [last 2 years]\\\`, \\\`Banker & Tradesman ${county} economic development news [year]\\\`\\n`;
  prompt += `        *   Sources: Boston Business Journal, Banker & Tradesman, official ${city}/${county} news. Cite article/date.\\n`;
  prompt += `\\n**2. Demographic Data (${city} & ${county} - specific figures & interpretation):**\\n`;
  prompt += `    *   **Population:** Latest estimates for ${city} & ${county}; % change from recent census. Growth/decline trends vs. state/region.\\n`;
  prompt += `        *   Queries: \\\`data.census.gov ACS DP05 ${city} ${state} population\\\`, \\\`data.census.gov ACS DP05 ${county} ${state} population [recent year]\\\`\\n`;
  prompt += `        *   Sources: U.S. Census Bureau (ACS Demographic and Housing Estimates - DP05). Cite dataset & year.\\n`;
  prompt += `    *   **Income & Poverty:** Median Household Income, Per Capita Income, Poverty Rates for ${city} & ${county}. Compare to state; discuss trends.\\n`;
  prompt += `        *   Queries: \\\`data.census.gov ACS S1901 ${city} ${state}\\\`, \\\`data.census.gov ACS S1701 ${county} ${state} poverty [recent year]\\\`\\n`;
  prompt += `        *   Sources: U.S. Census Bureau (ACS S1901 - Income, S1701 - Poverty). Cite table & year.\\n`;
  prompt += `    *   **Demographic Trends:** Notable trends (age distribution, household formation, migration) relevant to real estate. Supporting data.\\n`;
  prompt += `        *   Queries: \\\`${regionalPlanningAgencyHint} demographic forecast ${county}\\\`, \\\`Census Bureau ${city} ${state} population characteristics housing\\\`\\n`;
  prompt += `        *   Sources: ${regionalPlanningAgencyHint}, UMass Donahue Institute, Census Bureau ACS subject tables. Cite report/data.\\n`;
  prompt += `\\n**3. Market Conditions (Tailored to '${propertyTypeForQueries}' in ${city}/${county} - specific metrics, sources, dates/quarters):**\\n`;
  prompt += `    *   **Vacancy Rates:** Current rates. Trends (1-3 yrs). Compare to benchmarks. Specific figures, source, date/quarter.\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} vacancy rate ${city} ${state} Q[X] [YYYY] brokerage report OR NAIOP OR GBREB\\\`, \\\`The Warren Group ${propertyTypeForQueries} market data ${county}\\\`\\n`;
  prompt += `        *   Sources: NAIOP, GBREB, brokerage research (CBRE, JLL, C&W - public summaries), The Warren Group. Cite report, publisher, period.\\n`;
  prompt += `    *   **Rental Rates / Sales Price Trends:** Avg. asking rental rates or sales price trends (per SF/unit). Trends, specific figures, source, date/quarter.\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} rental rates ${city} ${state} Q[X] [YYYY]\\\`, \\\`${propertyTypeForQueries} sales price per sf ${county} ${state} trends [year]\\\`\\n`;
  prompt += `        *   Sources: (As above for vacancy). Cite report, publisher, period.\\n`;
  prompt += `    *   **New Construction & Absorption:** New construction (SF underway, completed, planned) & net absorption rates (SF). Quantify. Source, date/period.\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} new construction pipeline ${city} ${state} [year]\\\`, \\\`${propertyTypeForQueries} net absorption ${county} ${state} Q[X] [YYYY]\\\`, \\\`MassBuilds data ${propertyTypeForQueries} ${county}\\\`\\n`;
  prompt += `        *   Sources: MassBuilds (via MAPC), local planning/building dept. development lists, brokerage reports. Cite report, publisher, period.\\n`;
  prompt += `    *   **Investor Sentiment / Cap Rate Trends:** Investor sentiment & cap rate trends. Specific cap rate ranges, source, date/period.\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} cap rates ${city} ${state} [year] survey OR report\\\`, \\\`PwC Korpacz real estate investor survey ${propertyTypeForQueries} [region]\\\`\\n`;
  prompt += `        *   Sources: Brokerage research, industry publications (Banker & Tradesman, NEREJ), PwC Real Estate Investor Survey, Korpacz Real Estate Investor Survey, RERC. Cite survey/report, publisher, period.\\n`;
  prompt += `    *   **Sales Activity Summary:** General sales activity (transaction & dollar volume). Trends.\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} sales volume trends ${city} ${state} The Warren Group\\\`, \\\`MassGIS Statewide Property Sales Viewer ${propertyTypeForQueries} stats ${county} [year]\\\`\\n`;
  prompt += `        *   Sources: The Warren Group (Banker & Tradesman), MassGIS Statewide Property Sales Viewer, municipal assessor sales lists. Summarize with attribution.\\n`;
  prompt += `    *   **Neighborhood/Submarket Analysis (If ${propertyAddress !== '[Property Address Not Provided]'}):** Immediate neighborhood: boundaries, land uses, building age/condition, amenities/transport, local market trends. Specific to subject's vicinity.\\n`;
  prompt += `        *   Queries: \\\`neighborhood characteristics ${propertyAddress} ${city}\\\`, \\\`submarket analysis [neighborhood of subject] ${city} ${propertyTypeForQueries} trends\\\`\\n`;
  prompt += `        *   Sources: Municipal planning docs, local news, commercial listings in immediate area. Synthesize professionally.\\n`;
  prompt += `\\n**4. Preliminary Comparable Sales (Illustrative - MUST BE SOLD, provide structured details):**\\n`;
  prompt += `    *   Find 2-3 recent (last 1-2 yrs) *SOLD* examples of '${propertyTypeForQueries}' in ${city} or ${county}. Prioritize official records. For each, extract into the \\\`preliminaryComparableSales\\\` array: \\\`address\\\` (string), \\\`saleDate\\\` (string YYYY-MM-DD), \\\`salePrice\\\` (number), \\\`buildingSizeSqFt\\\` (number, if applicable), \\\`propertyType\\\` (string), \\\`source\\\` (string, e.g., "${city} Assessor Sale ID X", "The Warren Group, reported YYYY-MM-DD"), \\\`confidenceScore\\\` (number).\\n`;
  prompt += `        *   Queries: \\\`${propertyTypeForQueries} recent public sales records ${city} ${state} assessor\\\`, \\\`${propertyTypeForQueries} verified sales ${county} ${state} The Warren Group [last 12 months]\\\`, \\\`MassLandRecords deed search property sales ${city} [recent period]\\\`\\n`;
  prompt += `        *   Sources: Municipal Assessor Databases, MassLandRecords.com, MassGIS Sales Viewer, The Warren Group. AVOID relying solely on listing sites for sold data unless confirmed by primary source.\\n`;
  prompt += "\\n**Lane Valuation Group Standard:** Precision, depth, meticulous sourcing, and insightful interpretation of data are paramount for Peter Lane. Ensure all analysis is robust and clearly articulated.\\n";
  prompt += "\\n---\\nGenerate the detailed Market Analysis as a structured JSON object, including the synthesized narrativeSummary, based ONLY on your web search findings following these exact instructions:";

  return prompt;
}

// Refactored: Use dynamic prompt assembly in the flow
const marketAnalysisPrompt = ai.definePrompt({
  name: 'marketAnalysisPrompt',
  input: {schema: MarketAnalysisInputSchema},
  output: {schema: MarketAnalysisOutputSchema},
  prompt: '', // Will be set dynamically
});

export const marketAnalysisFlow = ai.defineFlow(
  {
    name: 'marketAnalysisFlow',
    inputSchema: MarketAnalysisInputSchema,
    outputSchema: MarketAnalysisOutputSchema,
  },
  async (input: MarketAnalysisInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleMarketAnalysisPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...marketAnalysisPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        console.error('MarketAnalysisFlow: LLM returned no output.');
        // Return a default/error structure conforming to MarketAnalysisOutputSchema
        return {
          narrativeSummary: "Error: Could not generate market analysis. LLM returned no output.",
          confidenceScores: { overall: 0 },
          // Initialize other fields as optional or with default error values
          majorIndustries: ["ERROR"],
        };
      }
      return output;
    } catch (error: any) {
      console.error("Error in marketAnalysisFlow:", error);
      // Return a default/error structure conforming to MarketAnalysisOutputSchema
      return {
        narrativeSummary: `Error generating market analysis: ${error.message}`,
        confidenceScores: { overall: 0 },
        majorIndustries: ["ERROR"],
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
