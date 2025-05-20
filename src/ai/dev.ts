
import { config } from 'dotenv';
config();

import '@/ai/flows/cover-letter-generation.ts';
import '@/ai/flows/site-description-generation.ts';
import '@/ai/flows/market-analysis-generation.ts';
import '@/ai/flows/executive-summary-generation.ts';
import '@/ai/flows/hbu-generation.ts';
import '@/ai/flows/certification-generation.ts';

// Tools
import '@/ai/tools/local-gis-data-tool.ts';
// Flows
import '@/ai/flows/master-report-generation.ts';
import '@/ai/flows/data-extraction-tool.ts';
import '@/ai/flows/comparable-sales-flow.ts';
import '@/ai/flows/sales-comparison-approach-flow.ts';
import '@/ai/flows/income-approach-flow.ts';
import '@/ai/flows/cost-approach-flow.ts';
import '@/ai/flows/reconciliation-flow.ts';
import '@/ai/flows/compliance-check-flow.ts';
