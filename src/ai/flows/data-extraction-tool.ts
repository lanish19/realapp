// src/ai/flows/data-extraction-tool.ts
'use server';
/**
 * @fileOverview Data Extraction & Verification Tool for ValuGen
 * Sequentially queries public data sources (via web search or direct API simulation) 
 * to extract foundational property data, tailored for Eastern Massachusetts.
 * To be called early by masterReportGenerationFlow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const DataExtractionInputSchema = z.object({
  address: z.string().describe("Full street address of the subject property."),
  city: z.string().describe("City of the subject property (e.g., Boston, Cambridge)."),
  county: z.string().describe("County of the subject property (e.g., Suffolk, Middlesex). Must be an Eastern MA county."),
  state: z.string().describe("State of the subject property (should be MA)."),
});
export type DataExtractionInput = z.infer<typeof DataExtractionInputSchema>;

export const DataExtractionOutputSchema = z.object({
  ownerName: z.string().optional().describe("Reported owner name."),
  parcelId: z.string().optional().describe("Assessor's Parcel Number (APN)."),
  legalDescriptionRef: z.string().optional().describe("Reference to legal description (e.g., Deed Book/Page)."),
  lotSizeAcres: z.number().optional().describe("Lot size in acres."),
  lotSizeSqFt: z.number().optional().describe("Lot size in square feet."),
  zoningCodePrimary: z.string().optional().describe("Primary zoning designation from municipal source."),
  zoningDescription: z.string().optional().describe("Brief description of the primary zoning code."),
  floodZoneData: z.object({
    zone: z.string().describe("FEMA Flood Zone ID (e.g., X, AE)."),
    panel: z.string().describe("FEMA Flood Panel Number."),
    date: z.string().describe("FEMA Flood Map Effective Date."),
    source: z.string().describe("Source of flood data (e.g., FEMA MSC)."),
  }).optional(),
  siteDimensions: z.string().optional().describe("Approximate site dimensions or shape."),
  propertyClassCode: z.string().optional().describe("Municipal property use/class code."),
  yearBuilt: z.number().optional().describe("Year building was constructed, if available from assessor."),
  buildingSizeSqFt: z.number().optional().describe("Building size in square feet, if available from assessor."),
  assessedValueTotal: z.number().optional().describe("Total assessed value from municipal assessor."),
  lastSaleDate: z.string().optional().describe("Date of the last recorded sale."),
  lastSalePrice: z.number().optional().describe("Price of the last recorded sale."),
  dataSources: z.array(z.object({
    item: z.string().describe("Data item extracted (e.g., Parcel ID, Owner Name)."),
    value: z.any().describe("The extracted value."),
    source: z.string().describe("Specific source of the data (e.g., MassGIS Statewide Property Sales Viewer, Middlesex South Registry of Deeds, Boston Assessor Database)."),
    queryUsed: z.string().optional().describe("Example search query used or simulated."),
    confidence: z.number().min(0).max(1).describe("Confidence score for this specific data point."),
  })).describe("Detailed record of data points, their values, sources, and confidence levels."),
  overallConfidence: z.number().min(0).max(1).describe("Overall confidence in the extracted dataset."),
});
export type DataExtractionOutput = z.infer<typeof DataExtractionOutputSchema>;

function assembleDataExtractionPrompt(input: DataExtractionInput): string {
  // Construct county-specific registry of deeds name
  let registryOfDeedsName = `${input.county} County Registry of Deeds`;
  if (input.county.toLowerCase() === 'middlesex') {
    // Referring to "Comprehensive Directory of Municipal Property Data Sources for Eastern Massachusetts.md"
    // and "Enhanced Comprehensive Guide..." which indicate Middlesex has North (Lowell) and South (Cambridge) districts.
    registryOfDeedsName = `Middlesex South Registry of Deeds (Cambridge) or Middlesex North Registry of Deeds (Lowell) (determine correct one based on '${input.city}')`;
  } else if (input.county.toLowerCase() === 'essex') {
    registryOfDeedsName = `Essex County Registry of Deeds (Salem or Lawrence, determine correct one based on '${input.city}')`;
  } else if (input.county.toLowerCase() === 'worcester') { // Example if we expand, though Worcester is not strictly "Eastern MA" in all contexts
    registryOfDeedsName = `Worcester County Registry of Deeds (determine correct district if applicable based on '${input.city}')`;
  } else if (input.county.toLowerCase() === 'bristol') {
    registryOfDeedsName = `Bristol County North Registry of Deeds (Taunton), Bristol County South Registry of Deeds (New Bedford), or Fall River District Registry of Deeds (Fall River) (determine correct one based on '${input.city}')`;
  }
  // Add other multi-district counties if necessary, following pattern from user-provided MD files.
  // For instance, Plymouth County has one main Registry. Norfolk also one. Suffolk has one.

  // Guidance from "Comprehensive Directory of Municipal Property Data Sources for Eastern Massachusetts.md"
  // For Assessor DBs: many use Vision Government Solutions or AxisGIS. Some custom.
  // For GIS: Many use AxisGIS or ESRI ArcGIS. Some custom.

  return `
You are an AI Data Extraction Specialist for commercial real estate in Eastern Massachusetts.
Your task is to meticulously simulate searching specified public data sources to extract key information for the property located at:
Address: ${input.address}
City: ${input.city}
County: ${input.county}
State: ${input.state}

You MUST simulate searching the following types of official sources, using targeted queries. For each piece of information, state the simulated query, the specific source (e.g., "Boston Assessor Database via City of Boston website", "MassLandRecords.com - Suffolk County Registry of Deeds", "Cambridge GIS Portal", "FEMA MSC"), the extracted value, and a confidence score (0.0-1.0).

Refer to the "Comprehensive Directory of Municipal Property Data Sources for Eastern Massachusetts.md" and "Enhanced Comprehensive Guide..." for typical source names and URLs if general knowledge is insufficient.

**Key Data Points to Extract & Preferred Sources (Simulate accessing these):**

1.  **Parcel ID (APN), Lot Size (Acres & SqFt), Site Dimensions, Property Class Code, Year Built, Building Size (SqFt), Assessed Value (Total), Last Sale Date & Price (from Assessor):**
    *   **Primary Source:** Official Municipal Assessor Database for ${input.city}, MA.
        *   How to find it: Search for "${input.city} MA property assessment database" or "${input.city} MA assessor's online database".
        *   Example Query (once on the simulated site): "Search property records for ${input.address}" or "Lookup parcel ${input.address}".
        *   If ${input.city} is Boston: "Simulate query on Boston Assessing Department's online search for ${input.address}"
        *   If ${input.city} is Cambridge: "Simulate query on Cambridge MA Assessor's database for ${input.address}"
        *   If the city uses Vision Government Solutions: "Simulate query on Vision Government Solutions portal for ${input.city}, MA, address ${input.address}"
        *   If the city uses AxisGIS for assessing data: "Simulate query on AxisGIS assessing platform for ${input.city}, MA, address ${input.address}"
    *   **Secondary Source (especially for map-based lot dimensions/confirmation):** MassGIS Property Tax Parcels (via Massachusetts Interactive Property Map or specific MassGIS data layers).
        *   Example Query: "Search Massachusetts Interactive Property Map for ${input.address}"

2.  **Owner Name, Legal Description Reference (Deed Book/Page), Last Sale Date & Price (from Deeds):**
    *   **Primary Source:** ${registryOfDeedsName}. Access via MassLandRecords.com.
        *   Example Query: "Search MassLandRecords.com for ${input.county} County, document type Deed, address ${input.address}" or "Grantor/Grantee search for ${input.address} in ${registryOfDeedsName} on MassLandRecords.com".
    *   **Secondary Source (for Sale Date/Price if not in deeds or assessor):** MassGIS Statewide Property Sales Viewer.
        *   Example Query: "Search MassGIS Statewide Property Sales Viewer for ${input.address} commercial sale"

3.  **Primary Zoning Code & Brief Zoning Description:**
    *   **Primary Source:** Official ${input.city}, MA Zoning Map or GIS Portal.
        *   How to find it: Search for "${input.city} MA official zoning map" or "${input.city} MA GIS portal zoning".
        *   Example Query (once on the simulated site): "Find zoning for ${input.address} on ${input.city} GIS map" or "Lookup zoning code for parcel at ${input.address} in ${input.city} zoning ordinance lookup tool".
        *   If the city uses AxisGIS for zoning: "Simulate query on AxisGIS zoning map for ${input.city}, MA, address ${input.address}"
    *   **Secondary Source:** MassGIS Property Tax Parcels (which often includes a statewide zoning layer, but municipal source is more authoritative).
        *   Example Query: "Check MassGIS zoning layer for ${input.address}".

4.  **FEMA Flood Zone ID, Panel Number, and Map Effective Date:**
    *   **Primary Source:** FEMA Flood Map Service Center (MSC) at msc.fema.gov.
        *   Example Query: "Search FEMA Flood Map Service Center for ${input.address}, ${input.city}, ${input.state}".

**Output Instructions:**
- Return a JSON object matching the DataExtractionOutputSchema.
- The 'dataSources' array is CRITICAL. It must contain an object for EACH successfully extracted data point, detailing:
    - 'item': The name of the data point (e.g., "Parcel ID", "Owner Name", "Lot Size Acres").
    - 'value': The extracted value. If a value is not found for a specific item from any source, state "Not Found".
    - 'source': The specific official source from which the data was obtained (e.g., "${input.city} Assessor Online Database", "MassLandRecords.com - ${registryOfDeedsName}", "${input.city} GIS Portal", "FEMA MSC"). Be precise.
    - 'queryUsed': An example of the simulated search query you would use for that specific source and item.
    - 'confidence': Your confidence score (0.0-1.0) for that specific data point from that source. Data from official municipal/state/federal sites should have high confidence (0.8-1.0).
- Populate the top-level convenience fields (ownerName, parcelId, etc.) with the BEST information found (highest confidence, most specific source). If a top-level field has multiple components (e.g., floodZoneData), ensure all sub-fields are populated from the same primary source (FEMA MSC) if possible.
- If data for a top-level field isn't found from any primary or secondary source, omit it or set to undefined/null as per schema.
- Calculate an 'overallConfidence' score (0.0-1.0) based on the quantity and quality of data extracted and the reliability of the primary sources used.

**Confidence Scoring Guide for Individual Data Points:**
- 0.9-1.0: Data directly and unambiguously extracted from a simulated query of an official source (e.g., Assessor DB, Registry of Deeds, official GIS, FEMA portal).
- 0.7-0.8: Data from an official source, but required some interpretation or was slightly less direct in the simulated query.
- 0.5-0.6: Data inferred from an official source or a secondary source if primary failed (e.g., general property lookup site if assessor DB was hypothetically down).
- <0.5: Data is an estimate, highly inferred, or from a non-authoritative source.

Simulate this process diligently. If a primary source is expected to yield multiple data points (e.g., assessor DB for Parcel ID, Lot Size, Sale Info), reflect that in multiple entries in the 'dataSources' array, each with the specific item, its value, and its confidence, but all pointing to the same overarching 'source' (e.g., "${input.city} Assessor Database"). Prioritize official municipal, county, state (MassGIS), and federal (FEMA) sources.
`;
}

export const dataExtractionTool = ai.defineTool(
  {
    name: 'dataExtractionTool',
    description: 'Extracts foundational property data for Eastern Massachusetts properties using simulated targeted web searches of public records (assessors, deeds, GIS, FEMA).',
    inputSchema: DataExtractionInputSchema,
    outputSchema: DataExtractionOutputSchema,
  },
  async (input: DataExtractionInput) => {
    const prompt = assembleDataExtractionPrompt(input);

    // In a real scenario, you might have specific tools for each data source.
    // Here, we simulate the orchestrated search and extraction with a single powerful LLM prompt.
    const { output } = await ai.runPrompt({
      name: 'dataExtractionSpecialistPrompt',
      prompt,
      output: { 
        schema: DataExtractionOutputSchema,
        format: 'json', // Ensure LLM knows to output JSON
      }
    });

    if (!output) {
      throw new Error("LLM failed to generate data extraction report.");
    }

    // Post-processing: Consolidate best values into top-level fields from the dataSources array
    const consolidatedOutput: Partial<z.infer<typeof DataExtractionOutputSchema>> = {
      dataSources: output.dataSources || [],
      overallConfidence: 0, // Default, will be updated
    };

    let totalConfidence = 0;
    let numScoredItems = 0;

    const getBestValue = (itemKey: string, sources: z.infer<typeof DataExtractionOutputSchema>['dataSources']) => {
      if (!sources) return undefined;
      const candidates = sources.filter((s: any) => s.item === itemKey && s.value !== "Not Found" && s.value !== null && s.value !== undefined);
      if (candidates.length === 0) return undefined;
      candidates.sort((a: any, b: any) => b.confidence - a.confidence); // Sort by confidence descending
      return candidates[0].value;
    };
    
    if (output.dataSources) {
      consolidatedOutput.ownerName = getBestValue("Owner Name", output.dataSources);
      consolidatedOutput.parcelId = getBestValue("Parcel ID", output.dataSources);
      consolidatedOutput.legalDescriptionRef = getBestValue("Legal Description Reference", output.dataSources);
      consolidatedOutput.lotSizeAcres = getBestValue("Lot Size Acres", output.dataSources);
      consolidatedOutput.lotSizeSqFt = getBestValue("Lot Size SqFt", output.dataSources);
      consolidatedOutput.zoningCodePrimary = getBestValue("Zoning Code Primary", output.dataSources);
      consolidatedOutput.zoningDescription = getBestValue("Zoning Description", output.dataSources);
      consolidatedOutput.siteDimensions = getBestValue("Site Dimensions", output.dataSources);
      consolidatedOutput.propertyClassCode = getBestValue("Property Class Code", output.dataSources);
      consolidatedOutput.yearBuilt = getBestValue("Year Built", output.dataSources);
      consolidatedOutput.buildingSizeSqFt = getBestValue("Building Size SqFt", output.dataSources);
      consolidatedOutput.assessedValueTotal = getBestValue("Assessed Value Total", output.dataSources);
      consolidatedOutput.lastSaleDate = getBestValue("Last Sale Date", output.dataSources);
      consolidatedOutput.lastSalePrice = getBestValue("Last Sale Price", output.dataSources);

      const floodZoneItem = getBestValue("FEMA Flood Zone ID", output.dataSources);
      const floodPanelItem = getBestValue("FEMA Flood Panel Number", output.dataSources);
      const floodDateItem = getBestValue("FEMA Flood Map Effective Date", output.dataSources);
      const floodSourceItem = output.dataSources.find((s: any) => s.item === "FEMA Flood Zone ID" || s.item === "FEMA Flood Panel Number" || s.item === "FEMA Flood Map Effective Date");


      if (floodZoneItem && floodPanelItem && floodDateItem && floodSourceItem) {
        consolidatedOutput.floodZoneData = {
          zone: floodZoneItem,
          panel: floodPanelItem,
          date: floodDateItem,
          source: floodSourceItem.source,
        };
      }

      output.dataSources.forEach((ds: any) => {
        if (ds.value !== "Not Found" && ds.value !== null && ds.value !== undefined) {
          totalConfidence += ds.confidence;
          numScoredItems++;
        }
      });
      if (numScoredItems > 0) {
        consolidatedOutput.overallConfidence = parseFloat((totalConfidence / numScoredItems).toFixed(2));
      } else {
        consolidatedOutput.overallConfidence = 0;
      }
    }
    
    return consolidatedOutput as z.infer<typeof DataExtractionOutputSchema>;
  }
);

// This tool should now be defined in Genkit configuration (e.g., in genkit.ts) to be usable.
// Example (in genkit.ts or similar):
// import { dataExtractionTool } from './flows/data-extraction-tool';
// configureGenkit({
//   plugins: [..., { tools: [dataExtractionTool] }],
//   ...
// });

// And then it can be called by masterReportGenerationFlow or SiteDescriptionAgent
// Example call:
// const extractionResult = await runTool(dataExtractionTool, { address, city, county, state });
// caseFile.propertyDetails = { ...caseFile.propertyDetails, ...extractionResult }; 