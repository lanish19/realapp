import { defineTool } from '@genkit-ai/ai';
import { z, ZodType } from 'zod';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';

// Define the schema for the data expected from the Python script\'s GDB query
const ExtractedGisDataSchema = z.object({
  propertyId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  mapParId: z.string().optional().nullable(), // Added based on python script output
  buildingValue: z.number().optional().nullable(),
  landValue: z.number().optional().nullable(),
  otherValue: z.number().optional().nullable(), // Added
  totalValue: z.number().optional().nullable(),
  fiscalYear: z.string().optional().nullable(),
  lotSize: z.any().optional().nullable(), // Can be number or string like "AC" based on lotUnits
  lotUnits: z.string().optional().nullable(),
  landSaleDate: z.string().optional().nullable(),
  landSalePrice: z.number().optional().nullable(),
  landSaleBook: z.string().optional().nullable(), // Added
  landSalePage: z.string().optional().nullable(), // Added
  useCode: z.string().optional().nullable(),
  useDescription: z.string().optional().nullable(),
  siteAddressNumber: z.string().optional().nullable(), // Added
  siteAddressStreet: z.string().optional().nullable(), // Added
  siteAddressFull: z.string().optional().nullable(), // Was siteAddress, renamed for clarity
  city: z.string().optional().nullable(),
  zoning: z.string().optional().nullable(),
  yearBuilt: z.number().optional().nullable(),
  buildingAreaSqFt: z.number().optional().nullable(), // Was buildingArea
  residentialAreaSqFt: z.number().optional().nullable(), // Was residentialArea
  units: z.number().optional().nullable(),
  style: z.string().optional().nullable(),
  stories: z.number().optional().nullable(),
  numberOfRooms: z.number().optional().nullable(),
  camaId: z.string().optional().nullable(),
  townId: z.string().optional().nullable(),
  gisParcelAreaSqFt: z.number().optional().nullable(), // Was shapeArea
  // shapeLength: z.number().optional().nullable(), // Typically not needed for appraisal data output
  polyType: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  ownerAddress1: z.string().optional().nullable(), // Was ownerAddress
  ownerCity: z.string().optional().nullable(), // Added
  ownerState: z.string().optional().nullable(), // Added
  ownerZip: z.string().optional().nullable(), // Added
}).deepPartial();

export const LocalGisDataToolInputSchema = z.object({
  gdbPath: z.string().describe("Absolute path to the .gdb file"),
  siteAddress: z.string().describe("Street address (e.g., 123 Main St)"),
  city: z.string().describe("City name"),
  state: z.string().describe("State abbreviation (e.g., MA)"),
  zipCode: z.string().describe("ZIP code"),
});

// Updated Output Schema
export const LocalGisDataToolOutputSchema = z.object({
  error: z.string().nullable().describe("Error message if GDB query failed, null otherwise"),
  data: ExtractedGisDataSchema.nullable().describe("Extracted property data from GDB, or null if error/not found"),
  warnings: z.array(z.string()).optional().nullable().describe("List of warnings from the GDB extraction script."),
  sourceTable: z.literal("MassGIS_GDB").describe("Indicates the source of this data"),
  sourceLocId: z.string().optional().nullable().describe("LOC_ID from the geodatabase, if found"),
  matchConfidence: z.number().optional().nullable().describe("Confidence score of the address match (0.0 to 1.0) from Python script"),
});

export const localGisDataTool = defineTool<
  typeof LocalGisDataToolInputSchema,
  typeof LocalGisDataToolOutputSchema
>(
  {
    name: 'localGisDataExtractor',
    description: 'Extracts property data from a local MassGIS geodatabase (.gdb file) using a Python script. Takes a full address and GDB path as input.',
    inputSchema: LocalGisDataToolInputSchema,
    outputSchema: LocalGisDataToolOutputSchema,
  },
  async (input: typeof LocalGisDataToolInputSchema['_type']) => {
    const pythonScriptPath = path.resolve(__dirname, 'local_gis_extractor.py');
    
    return new Promise<typeof LocalGisDataToolOutputSchema['_type']>((resolve) => {
      const processExec: ChildProcessWithoutNullStreams = spawn('python3', [
        pythonScriptPath,
        '--gdb_path', input.gdbPath,
        '--site_address', input.siteAddress,
        '--city', input.city,
        '--state', input.state,
        '--zip_code', input.zipCode,
      ]);

      let stdoutData = '';
      let stderrData = '';

      processExec.stdout.on('data', (data: Buffer | string) => {
        stdoutData += data.toString();
      });

      processExec.stderr.on('data', (data: Buffer | string) => {
        stderrData += data.toString();
      });

      processExec.on('close', (code: number | null) => {
        if (code !== 0) {
          console.error(`Python script stderr: ${stderrData}`);
          resolve({
            error: `Python script exited with code ${code !== null ? code : 'unknown'}: ${stderrData.trim()}`,
            data: null,
            warnings: (stderrData && stderrData.length > 0) ? [stderrData.trim()] : [], // Add stderr as a warning
            sourceTable: 'MassGIS_GDB',
            sourceLocId: null,
            matchConfidence: 0
          });
          return;
        }

        try {
          const resultFromPython = JSON.parse(stdoutData);
          
          // Extract parts from python result
          const { error, data, warnings, source_loc_id, match_confidence } = resultFromPython;

          // Construct the final object according to LocalGisDataToolOutputSchema
          const finalResult = {
            error: error || null, // Ensure null if undefined/empty from python
            data: data || null,   // Ensure null if undefined/empty
            warnings: warnings || [], // Ensure empty array if undefined
            sourceTable: 'MassGIS_GDB' as const, // Literal type
            sourceLocId: source_loc_id || null,
            matchConfidence: match_confidence !== undefined ? match_confidence : null,
          };

          const validationResult = LocalGisDataToolOutputSchema.safeParse(finalResult);

          if (validationResult.success) {
            resolve(validationResult.data as typeof LocalGisDataToolOutputSchema['_type']);
          } else {
            console.error('Tool output failed Zod validation:', validationResult.error.format());
            resolve({
              error: `Tool output validation failed: ${validationResult.error.toString()}`,
              data: null,
              warnings: ["Tool output validation failed after Python script execution."],
              sourceTable: 'MassGIS_GDB',
              sourceLocId: null,
              matchConfidence: 0
            });
          }
        } catch (parseError: any) {
          console.error(`Error parsing Python script output: ${parseError}`);
          console.error(`Raw stdout: ${stdoutData}`);
          resolve({
            error: `Error parsing Python script output: ${parseError.message || parseError}`,
            data: null,
            warnings: [`Error parsing Python script output: ${parseError.message || parseError}`],
            sourceTable: 'MassGIS_GDB',
            sourceLocId: null,
            matchConfidence: 0
          });
        }
      });

      processExec.on('error', (err: Error) => {
        console.error(`Failed to start Python script: ${err}`);
        resolve({
          error: `Failed to start Python script: ${err.message}`,
          data: null,
          warnings: [`Failed to start Python script: ${err.message}`],
          sourceTable: 'MassGIS_GDB',
          sourceLocId: null,
          matchConfidence: 0
        });
      });
    });
  }
); 