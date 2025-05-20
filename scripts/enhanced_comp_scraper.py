#!/usr/bin/env python3
"""
Enhanced Comparable Sales Scraper

This script uses multiple free web-based sources to extract recent comparable sales data
for commercial real estate properties in Eastern Massachusetts.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime # Not directly used in main, but good to have for context
from typing import Dict, List, Optional, Any # For type hinting if needed further

# Assuming orchestrator.py and other scraper modules are in the same directory or python path
from orchestrator import EnhancedComparableSalesOrchestrator

# Configure basic logging
logging.basicConfig(
    level=logging.INFO, # Set to logging.DEBUG for more verbose output during development
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout) 
        # If you want to log to a file as well:
        # logging.FileHandler("enhanced_comp_scraper.log") 
    ]
)
logger = logging.getLogger("enhanced_comp_scraper_main")

# Silence noisy loggers if necessary (e.g., playwright)
logging.getLogger("playwright").setLevel(logging.WARNING)

async def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="Enhanced Comparable Sales Scraper for ValuGen")
    parser.add_argument("--input", required=True, help="Path to input JSON file containing subject property details")
    parser.add_argument("--output", required=True, help="Path to output JSON file where results will be written")
    
    args = parser.parse_args()
    
    logger.info(f"Script started. Input: {args.input}, Output: {args.output}")

    # Read input file
    try:
        with open(args.input, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
            logger.info(f"Successfully loaded input data for property type '{input_data.get('subjectPropertyType')}' in '{input_data.get('subjectCity')}'")
    except FileNotFoundError:
        logger.error(f"Input file not found: {args.input}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from input file {args.input}: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"An unexpected error occurred while reading input file {args.input}: {e}")
        sys.exit(1)
    
    # Validate essential input data fields needed by the orchestrator
    if not all(k in input_data for k in ['subjectCity', 'subjectCounty', 'subjectPropertyType']):
        logger.error("Input data is missing one or more required fields: subjectCity, subjectCounty, subjectPropertyType")
        # Write an error output file to signal failure to the Node.js process
        error_output = {
            "comparableSales": [],
            "searchSummary": "Error: Input data missing required fields (subjectCity, subjectCounty, subjectPropertyType).",
            "error": True
        }
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(error_output, f, indent=2)
            logger.info(f"Wrote error output to {args.output}")
        except Exception as e_write:
            logger.error(f"Failed to write error output file {args.output}: {e_write}")
        sys.exit(1)

    # Create orchestrator
    orchestrator = EnhancedComparableSalesOrchestrator()
    
    results: Dict[str, Any] = {}
    # Gather comparable sales
    try:
        logger.info("Starting comparable sales search via orchestrator...")
        results = await orchestrator.gather_comparable_sales(input_data)
        num_comps_found = len(results.get('comparableSales', []))
        logger.info(f"Orchestrator finished. Found {num_comps_found} comparable sales.")
        results['error'] = False # Indicate success
    except Exception as e:
        logger.error(f"An critical error occurred during comparable sales gathering: {e}", exc_info=True)
        results = {
            "comparableSales": [],
            "searchSummary": f"Critical error during comparable sales gathering: {str(e)}",
            "error": True
        }
    
    # Write output file
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
            logger.info(f"Successfully wrote results to {args.output}")
    except Exception as e:
        logger.error(f"Error writing output file {args.output}: {e}")
        # If writing fails, the calling process won't get results, which is a failure state.
        # The error has already been logged. No need to sys.exit(1) here if results were partially processed.
        # However, if results are empty due to this, it's problematic.

if __name__ == "__main__":
    # Set loop policy for Windows if needed for Playwright, though generally not required for Linux/macOS
    # if sys.platform == "win32":
    # asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
    logger.info("Script finished.") 