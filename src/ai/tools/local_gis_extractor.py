import argparse
import json
import os
import sys
import pandas as pd # Pandas is a dependency of geopandas

try:
    import geopandas as gpd
    from fiona.errors import DriverError # For specific layer loading errors
except ImportError:
    # This message will be caught by the Genkit tool if geopandas is not installed
    print(json.dumps({"error": "Geopandas/Fiona library not found. Please ensure it is installed in the Python environment.", "data": None, "warnings": [], "source_loc_id": None, "match_confidence": 0.0}))
    sys.exit(1)

# Placeholder for actual geodatabase querying logic using geopandas
# Ensure geopandas and its dependencies (like fiona with GDB support) are installed
# Example:
# import geopandas as gpd
# from shapely.geometry import Point

def normalize_text(text):
    """Converts text to lowercase and removes leading/trailing whitespace."""
    if isinstance(text, str):
        return text.lower().strip()
    return text

def query_geodatabase(gdb_path, site_address, city, state, zip_code):
    """
    Queries the MassGIS L3 Parcels geodatabase for property information.
    """
    warnings = []
    if not os.path.exists(gdb_path):
        return {"error": f"Geodatabase not found at path: {gdb_path}", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

    try:
        # Load necessary layers individually for better error reporting
        try:
            assess_gdf = gpd.read_file(gdb_path, layer="M001Assess")
        except DriverError as e:
            return {"error": f"Error loading M001Assess layer: {str(e)}. Ensure GDB path is correct and layer exists.", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}
        
        try:
            taxpar_gdf = gpd.read_file(gdb_path, layer="M001TaxPar")
        except DriverError as e:
            return {"error": f"Error loading M001TaxPar layer: {str(e)}. Ensure GDB path is correct and layer exists.", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

        try:
            uc_lut_df = gpd.read_file(gdb_path, layer="M001UC_LUT")
        except DriverError as e:
             # This layer is for enrichment, so we can proceed with a warning if it fails
            warnings.append(f"Could not load M001UC_LUT layer: {str(e)}. Use code descriptions will be unavailable.")
            uc_lut_df = pd.DataFrame() # Empty DataFrame so subsequent code doesn't break
        
        # lut_df = gpd.read_file(gdb_path, layer="M001_LUT") # For other lookups like style, handle similarly if needed

    except Exception as e: # Catch any other unexpected geopandas/fiona errors during load
        return {"error": f"Unexpected error loading layers from GDB: {str(e)}", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

    # Check for essential columns in assess_gdf
    required_assess_cols = ['ADDR_NUM', 'FULL_STR', 'CITY', 'LOC_ID', 'USE_CODE']
    for col in required_assess_cols:
        if col not in assess_gdf.columns:
            return {"error": f"Required column '{col}' not found in M001Assess layer. GDB schema mismatch?", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

    # Normalize input for matching
    input_addr_num = ""
    input_street_name = ""
    if site_address:
        parts = site_address.split(" ", 1)
        input_addr_num = normalize_text(parts[0])
        if len(parts) > 1:
            input_street_name = normalize_text(parts[1])
    
    normalized_city = normalize_text(city)

    # Prepare assess_gdf fields for matching
    assess_gdf['_ADDR_NUM_NORM'] = assess_gdf['ADDR_NUM'].apply(normalize_text)
    assess_gdf['_FULL_STR_NORM'] = assess_gdf['FULL_STR'].apply(normalize_text)
    assess_gdf['_CITY_NORM'] = assess_gdf['CITY'].apply(normalize_text)
    
    city_matches = assess_gdf[assess_gdf['_CITY_NORM'] == normalized_city]
    if city_matches.empty:
        return {"error": f"No properties found for city: '{city}' (normalized: '{normalized_city}')", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

    addr_num_matches = city_matches[city_matches['_ADDR_NUM_NORM'] == input_addr_num]
    if addr_num_matches.empty:
        return {"error": f"No properties found with address number '{input_addr_num}' in city '{city}'", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}

    potential_matches = addr_num_matches[
        addr_num_matches['_FULL_STR_NORM'].astype(str).str.contains(input_street_name, case=False, na=False)
    ]

    if potential_matches.empty:
        return {"error": f"Address match failed: No street name containing '{input_street_name}' found for number '{input_addr_num}' in city '{city}'.", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.0}
    
    match_confidence = 0.75 
    
    if len(potential_matches) > 1:
        warnings.append(f"Multiple ({len(potential_matches)}) potential matches found for '{site_address}, {city}'. Using the first one. Review data carefully.")
        match_confidence = 0.65 
    
    matched_assessment = potential_matches.iloc[0]
    loc_id = matched_assessment.get('LOC_ID')

    if not loc_id or pd.isna(loc_id):
        return {"error": "Found potential address match but its LOC_ID is missing or null. Cannot join to other tables.", "data": None, "warnings": warnings, "source_loc_id": None, "match_confidence": 0.3}

    # Join with M001TaxPar
    parcel_geometry_area = None
    poly_type = None
    map_par_id_from_taxpar = None
    if 'LOC_ID' in taxpar_gdf.columns: # Ensure LOC_ID exists before trying to join
        matched_taxpar = taxpar_gdf[taxpar_gdf['LOC_ID'] == loc_id]
        if not matched_taxpar.empty:
            matched_taxpar_data = matched_taxpar.iloc[0]
            parcel_geometry_area = matched_taxpar_data.get('SHAPE_Area')
            poly_type = matched_taxpar_data.get('POLY_TYPE')
            map_par_id_from_taxpar = matched_taxpar_data.get('MAP_PAR_ID')
        else:
            warnings.append(f"No matching record in M001TaxPar for LOC_ID: {loc_id}. Parcel geometry details will be missing.")
    else:
        warnings.append("LOC_ID column not found in M001TaxPar. Cannot join for parcel geometry details.")

    # Join with M001UC_LUT for Use Description
    use_code = matched_assessment.get('USE_CODE')
    use_description = "Unknown"
    if not uc_lut_df.empty and 'USE_CODE' in uc_lut_df.columns:
        if use_code and not pd.isna(use_code):
            use_desc_match = uc_lut_df[uc_lut_df['USE_CODE'] == use_code]
            if not use_desc_match.empty:
                use_description = use_desc_match.iloc[0].get('USE_DESC', "Unknown")
            else:
                warnings.append(f"USE_CODE '{use_code}' not found in M001UC_LUT.")
        elif pd.isna(use_code):
             warnings.append(f"USE_CODE is missing or null for matched property (LOC_ID: {loc_id}). Cannot lookup use description.")
    elif uc_lut_df.empty:
        warnings.append("M001UC_LUT was not loaded. Use descriptions are unavailable.")
    else: # 'USE_CODE' not in uc_lut_df.columns
         warnings.append("'USE_CODE' column not found in M001UC_LUT. Cannot lookup use descriptions.")

    def get_value(series, key, default=None):
        val = series.get(key, default)
        if pd.isna(val):
            return default
        if hasattr(val, 'item'): 
            if isinstance(val, (float, pd.Float64Dtype, pd.Float32Dtype)):
                 return float(val)
            if isinstance(val, (int, pd.Int64Dtype, pd.Int32Dtype)):
                 return int(val)
        return val

    extracted_data = {
        "propertyId": get_value(matched_assessment, "PROP_ID"),
        "locationId": loc_id,
        "mapParId": map_par_id_from_taxpar if map_par_id_from_taxpar else get_value(matched_assessment, "MAP_PAR_ID"),
        "buildingValue": get_value(matched_assessment, "BLDG_VAL"),
        "landValue": get_value(matched_assessment, "LAND_VAL"),
        "otherValue": get_value(matched_assessment, "OTHER_VAL"),
        "totalValue": get_value(matched_assessment, "TOTAL_VAL"),
        "fiscalYear": get_value(matched_assessment, "FY"),
        "lotSize": get_value(matched_assessment, "LOT_SIZE"),
        "lotUnits": get_value(matched_assessment, "LOT_UNITS"),
        "landSaleDate": get_value(matched_assessment, "LS_DATE"),
        "landSalePrice": get_value(matched_assessment, "LS_PRICE"),
        "landSaleBook": get_value(matched_assessment, "LS_BOOK"),
        "landSalePage": get_value(matched_assessment, "LS_PAGE"),
        "useCode": use_code,
        "useDescription": use_description,
        "siteAddressNumber": get_value(matched_assessment, "ADDR_NUM"),
        "siteAddressStreet": get_value(matched_assessment, "FULL_STR"),
        "siteAddressFull": get_value(matched_assessment, "SITE_ADDR"),
        "city": get_value(matched_assessment, "CITY"),
        "zoning": get_value(matched_assessment, "ZONING"),
        "yearBuilt": get_value(matched_assessment, "YEAR_BUILT"),
        "buildingAreaSqFt": get_value(matched_assessment, "BLD_AREA"),
        "residentialAreaSqFt": get_value(matched_assessment, "RES_AREA"),
        "units": get_value(matched_assessment, "UNITS"),
        "style": get_value(matched_assessment, "STYLE"),
        "stories": get_value(matched_assessment, "STORIES"),
        "numberOfRooms": get_value(matched_assessment, "NUM_ROOMS"),
        "camaId": get_value(matched_assessment, "CAMA_ID"),
        "townId": get_value(matched_assessment, "TOWN_ID"),
        "gisParcelAreaSqFt": parcel_geometry_area,
        "polyType": poly_type,
        "ownerName": get_value(matched_assessment, "OWNER1"),
        "ownerAddress1": get_value(matched_assessment, "OWN_ADDR"),
        "ownerCity": get_value(matched_assessment, "OWN_CITY"),
        "ownerState": get_value(matched_assessment, "OWN_ST"),
        "ownerZip": get_value(matched_assessment, "OWN_ZIP")
    }
    
    # Clean up None values if desired, or let them be null in JSON
    # extracted_data = {k: v for k, v in extracted_data.items() if v is not None}

    return {"error": None, "data": extracted_data, "warnings": warnings, "source_loc_id": loc_id, "match_confidence": match_confidence}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract property data from local MassGIS Geodatabase.")
    parser.add_argument("--gdb_path", required=True, help="Path to the .gdb file.")
    parser.add_argument("--site_address", required=True, help="Street address (e.g., 123 Main St)")
    parser.add_argument("--city", required=True, help="City name")
    parser.add_argument("--state", required=True, help="State abbreviation (e.g., MA)")
    parser.add_argument("--zip_code", required=True, help="ZIP code")

    args = parser.parse_args()

    # Ensure geopandas is available before calling query_geodatabase
    if 'gpd' not in globals():
        # Error already printed by the import attempt
        sys.exit(1) 
        
    result = query_geodatabase(args.gdb_path, args.site_address, args.city, args.state, args.zip_code)
    
    json.dump(result, sys.stdout, default=str) # Use default=str to handle any stubborn non-serializable types if any left 