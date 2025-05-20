import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
import re
import time

# Assuming other scraper modules are in the same directory or accessible in PYTHONPATH
from municipal_scrapers import MunicipalAssessorScraperFactory
from serp_scraper import RealEstateSERPScraper
from massgis_extractor import MassGISPropertyExtractor

logger = logging.getLogger(__name__)

# --- Stub/Placeholder Classes ---
class RequestThrottler:
    """Simple request throttler that ensures a minimum delay between requests."""
    def __init__(self, delay_seconds: float = 1.0):
        self.delay_seconds = delay_seconds
        self.last_request_time: float = 0

    async def wait(self):
        current_time = time.monotonic()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < self.delay_seconds:
            sleep_duration = self.delay_seconds - time_since_last_request
            await asyncio.sleep(sleep_duration)
        
        self.last_request_time = time.monotonic()

class RegistryLookupService:
    """
    Service to find the correct Registry of Deeds information for a given Massachusetts county.
    This needs to be populated with accurate information for all relevant counties.
    """
    # See https://www.masslandrecords.com/ for county-specific sites
    # The key should be the county name as it might appear in input_data.
    # 'subdomain' is the part used in masslandrecords.com URLs (e.g., 'suffolk'.www.masslandrecords.com)
    # 'name_on_site' is often how the county is listed in dropdowns on the site itself.
    COUNTY_REGISTRY_MAP = {
        "suffolk": {"subdomain": "suffolk", "name_on_site": "Suffolk", "search_url_template": "http://www.masslandrecords.com/suffolk/{search_page}"},
        "middlesex south": {"subdomain": "midlands", "name_on_site": "Middlesex South", "search_url_template": "http://www.masslandrecords.com/MiddlesexSouth/{search_page}"}, # Example, verify actual subdomain
        "middlesex north": {"subdomain": "middlesexnorth", "name_on_site": "Middlesex North", "search_url_template": "http://www.masslandrecords.com/MiddlesexNorth/{search_page}"}, # Example
        "norfolk": {"subdomain": "norfolk", "name_on_site": "Norfolk", "search_url_template": "http://www.masslandrecords.com/Norfolk/{search_page}"},
        "essex south": {"subdomain": "essexsouth", "name_on_site": "Essex South", "search_url_template": "http://www.masslandrecords.com/EssexSouth/{search_page}"},
        "essex north": {"subdomain": "essexnorth", "name_on_site": "Essex North", "search_url_template": "http://www.masslandrecords.com/EssexNorth/{search_page}"},
        "worcester": {"subdomain": "worcester", "name_on_site": "Worcester", "search_url_template": "http://www.masslandrecords.com/Worcester/{search_page}"},
        "plymouth": {"subdomain": "plymouth", "name_on_site": "Plymouth", "search_url_template": "http://www.masslandrecords.com/Plymouth/{search_page}"},
        "bristol": {"subdomain": "bristol", "name_on_site": "Bristol", "search_url_template": "http://www.masslandrecords.com/Bristol/{search_page}"}, # Might be North/South/Fall River
        "barnstable": {"subdomain": "barnstable", "name_on_site": "Barnstable", "search_url_template": "http://www.masslandrecords.com/Barnstable/{search_page}"},
        "hampshire": {"subdomain": "hampshire", "name_on_site": "Hampshire", "search_url_template": "http://www.masslandrecords.com/Hampshire/{search_page}"},
        "hampden": {"subdomain": "hampden", "name_on_site": "Hampden", "search_url_template": "http://www.masslandrecords.com/Hampden/{search_page}"},
        "franklin": {"subdomain": "franklin", "name_on_site": "Franklin", "search_url_template": "http://www.masslandrecords.com/Franklin/{search_page}"},
        "berkshire middle": {"subdomain": "berkshiremiddle", "name_on_site": "Berkshire Middle", "search_url_template": "http://www.masslandrecords.com/BerkshireMiddle/{search_page}"},
        # Dukes and Nantucket are often separate.
    }

    def find_registry_for_address(self, city: str, county: str) -> Optional[Dict[str, Any]]:
        """
        Finds registry information based on county.
        City might be used in the future for more granular lookup if needed.
        """
        county_lower = county.lower().strip()
        registry_info = self.COUNTY_REGISTRY_MAP.get(county_lower)

        if not registry_info:
            logger.warning(f"No specific MassLandRecords registry mapping found for county: '{county}'. Please update COUNTY_REGISTRY_MAP.")
            # Fallback or intelligent guess could be attempted here, or simply return None
            # For now, returning a generic placeholder structure if not found, so the scraper doesn't break immediately.
            return {
                "name": f"{county.capitalize()} Registry of Deeds (Generic Fallback - Needs Configuration)",
                "subdomain": county_lower.replace(" ", ""), # A guess
                "name_on_site": county.capitalize(),
                "search_url_template": f"http://www.masslandrecords.com/{county_lower.replace(' ', '')}/" # A guess
            }
        
        logger.info(f"Found registry info for {county}: {registry_info['name']}")
        return registry_info

class MassLandRecordsScraper:
    """
    Scraper for MassLandRecords.com.
    This requires significant implementation due to varying UIs per county registry
    and the nature of form-based searches.
    """
    def __init__(self, registry_info: Dict[str, Any], throttler: RequestThrottler):
        self.registry_info = registry_info
        self.throttler = throttler
        self.base_search_url = self.registry_info.get("search_url_template", "http://www.masslandrecords.com/").format(search_page="SearchCriteria.aspx") # Default search page
        logger.info(f"MassLandRecordsScraper initialized for {self.registry_info.get('name')} using base URL: {self.base_search_url}")

    async def search_property_records_by_criteria(self, property_type: str, city: str, years_back: int = 3) -> List[Dict]:
        """
        Searches MassLandRecords for property transactions based on criteria.
        This is a complex task and this implementation is a skeleton.

        Args:
            property_type: General commercial property type (e.g., "Retail", "Office").
                           Used to infer likely document types (e.g., DEED, MORTGAGE).
            city: The city/town within the registry's county.
            years_back: How many years back from current date to search.

        Returns:
            A list of dictionaries, where each dictionary represents a found comparable sale.
        """
        await self.throttler.wait()
        logger.info(f"Attempting MassLandRecords search for {property_type} in {city}, {self.registry_info.get('name')}, years_back={years_back}")
        
        found_sales: List[Dict] = []
        
        # TODO: Full Playwright implementation is required here.
        # Steps typically involve:
        # 1. Navigating to the specific registry's search page.
        #    - The URL might be `registry_info['search_url_template'].format(search_page="SearchCriteria.aspx")` or similar.
        #
        # 2. Handling initial disclaimers/popups if any.
        #
        # 3. Selecting the town/city from a dropdown.
        #    - The `city` parameter must match an option in the dropdown.
        #    - The specific name of the city in the dropdown might need mapping.
        #
        # 4. Setting the date range.
        #    - Calculate start_date (today - years_back) and end_date (today).
        #    - Input these into date fields. The format required by the site can vary.
        #
        # 5. Selecting Document Types.
        #    - For commercial sales, "DEED" is essential.
        #    - Other types like "MORTGAGE" (for financing details, though harder to link to sales price directly)
        #      or "UCC FIXTURE FILING" might be relevant for commercial but "DEED" is primary for sales comps.
        #    - Some sites allow multi-select, others might require separate searches.
        #
        # 6. Potentially filtering by street name or other criteria if possible and useful.
        #    - Usually, a broad search by Town, Date Range, and Doc Type is done first.
        #
        # 7. Submitting the search form.
        #
        # 8. Parsing the results table:
        #    - This is the most complex part. Results tables vary.
        #    - Extract columns like Grantor, Grantee, Sale Date (Recorded Date), Document #, Book/Page,
        #      Consideration (Sale Price), Property Address (if available directly).
        #    - Note: Address is often NOT in the primary search results table for deeds.
        #
        # 9. For each relevant result (e.g., a Deed):
        #    a. Click to view document details (often opens a new page or modal).
        #    b. From the details page, try to extract:
        #       - Full property address (may require looking at the actual scanned image or related documents).
        #       - More precise sale price if "Consideration" was nominal (e.g., "$1"). This might involve
        #         looking for "Declaration of Homestead" or tax stamps if visible.
        #       - Property description or type if available textually.
        #    c. This step (getting details from the document image or linked docs) is very advanced and
        #       often requires OCR or complex navigation if not textually available.
        #
        # 10. Structuring the data into the `ComparableSaleSchema` format.
        #     - 'address': Critical but often hard to get reliably.
        #     - 'saleDate': Recorded date.
        #     - 'salePrice': Consideration.
        #     - 'source': e.g., "Suffolk Registry of Deeds - Book X, Page Y"
        #     - 'confidenceScore': Moderate to high if price and date are clear. Lower if address is uncertain.
        #
        # 11. Handling pagination in search results.

        logger.warning(f"MassLandRecordsScraper.search_property_records_by_criteria for {self.registry_info.get('name')} is NOT fully implemented. It will return no data.")
        
        # Example (Conceptual - does not run):
        # async with async_playwright() as p:
        #     browser = await p.chromium.launch(headless=True) # Or False for debugging
        #     page = await browser.new_page()
        #     await page.goto(self.base_search_url)
        #
        #     # ... fill form: city, date range, doc type 'DEED' ...
        #     # await page.select_option('select[name*="town"]', city_value_for_dropdown)
        #     # await page.fill('input[name*="StartDate"]', start_date_str)
        #     # await page.fill('input[name*="EndDate"]', end_date_str)
        #     # await page.select_option('select[name*="DocType"]', 'DEED')
        #     # await page.click('input[type="submit"][value*="Search"]')
        #     # await page.wait_for_load_state('networkidle')
        #
        #     # ... parse results ...
        #     # rows = await page.query_selector_all('table#searchResultsGrid tr')
        #     # for row in rows:
        #     #     cells = await row.query_selector_all('td')
        #     #     sale_price_text = await cells[X].inner_text() # Get consideration
        #     #     sale_date_text = await cells[Y].inner_text() # Get recorded date
        #     #     doc_link = await cells[Z].query_selector('a').get_attribute('href')
        #     #     # Follow doc_link to get address if possible
        #     #     ...
        #
        #     await browser.close()

        return found_sales

# --- Orchestrator Class ---
class EnhancedComparableSalesOrchestrator:
    """Orchestrator for enhanced comparable sales data extraction."""

    def __init__(self):
        self.registry_lookup = RegistryLookupService()
        self.throttler = RequestThrottler(delay_seconds=0.5) # Basic throttle for external calls

    async def gather_comparable_sales(self, input_data: Dict) -> Dict:
        """Gathers comparable sales from multiple sources in parallel."""
        property_type = input_data.get('subjectPropertyType', 'Commercial Property')
        city = input_data.get('subjectCity', '')
        county = input_data.get('subjectCounty', '')
        state = input_data.get('subjectState', 'MA')
        subject_address = input_data.get('subjectAddress', '')

        if not city or not county:
            logger.error("City and County are required for comparable sales search.")
            return {"comparableSales": [], "searchSummary": "Error: City and County are required."}

        logger.info(f"Orchestrator: Gathering comps for {property_type} in {city}, {county}, {state}")

        tasks = [
            self._get_municipal_assessor_data(property_type, city, county),
            self._get_registry_of_deeds_data(property_type, city, county, subject_address), # Pass address for potential direct lookup
            self._get_massgis_data(city, property_type),
            self._get_serp_data(property_type, city, county, state)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results, handling exceptions from gather
        all_comps: List[Dict] = []
        source_names = ["MunicipalAssessor", "RegistryOfDeeds", "MassGIS", "SERP"]
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error from source {source_names[i]}: {result}")
            elif result: # Ensure result is not None
                all_comps.extend(result)
            else:
                logger.warning(f"Source {source_names[i]} returned None or empty list.")

        logger.info(f"Orchestrator: Total {len(all_comps)} comps gathered before deduplication.")
        
        unique_comps = self._deduplicate_and_enhance(all_comps)
        logger.info(f"Orchestrator: {len(unique_comps)} unique comps after deduplication.")
        
        recent_comps = self._filter_recent_sales(unique_comps)
        logger.info(f"Orchestrator: {len(recent_comps)} recent comps after date filtering.")

        # Further filter out the subject property itself if it appears in comps
        if subject_address:
            recent_comps = [c for c in recent_comps if not self._is_same_address(c.get('address',''), subject_address)]
            logger.info(f"Orchestrator: {len(recent_comps)} comps after removing subject property.")

        top_comps = self._sort_by_relevance(recent_comps, input_data)[:input_data.get('numberOfComps', 5)]
        logger.info(f"Orchestrator: Selected {len(top_comps)} top comps.")
        
        return {
            "comparableSales": top_comps,
            "searchSummary": self._generate_search_summary(top_comps, input_data, all_comps, unique_comps, recent_comps)
        }

    async def _get_municipal_assessor_data(self, property_type: str, city: str, county: str) -> List[Dict]:
        logger.info(f"Fetching municipal assessor data for {city}...")
        try:
            scraper = MunicipalAssessorScraperFactory.create_scraper(city, county)
            return await scraper.search_recent_sales(property_type, years_back=3)
        except Exception as e:
            logger.error(f"Error getting municipal assessor data for {city}: {e}", exc_info=True)
            return []

    async def _get_registry_of_deeds_data(self, property_type: str, city: str, county: str, subject_address: Optional[str]) -> List[Dict]:
        logger.info(f"Fetching registry of deeds data for City: {city}, County: {county}...")
        try:
            registry_info = self.registry_lookup.find_registry_for_address(city=city, county=county)
            if not registry_info:
                logger.error(f"Could not determine registry for {city}, {county}. Skipping MassLandRecords.")
                return []
                
            scraper = MassLandRecordsScraper(registry_info, self.throttler)
            return await scraper.search_property_records_by_criteria(property_type, city, years_back=3)
        except Exception as e:
            logger.error(f"Error getting registry of deeds data for {city}, {county}: {e}", exc_info=True)
            return []

    async def _get_massgis_data(self, city: str, property_type: str) -> List[Dict]:
        logger.info(f"Fetching MassGIS data for {city}...")
        try:
            extractor = MassGISPropertyExtractor()
            return await extractor.search_properties(city, property_type)
        except Exception as e:
            logger.error(f"Error getting MassGIS data for {city}: {e}", exc_info=True)
            return []

    async def _get_serp_data(self, property_type: str, city: str, county: str, state: str) -> List[Dict]:
        logger.info(f"Fetching SERP data for {property_type} in {city}...")
        try:
            scraper = RealEstateSERPScraper()
            return await scraper.search_recent_sales(property_type, city, county, state)
        except Exception as e:
            logger.error(f"Error getting SERP data for {city}: {e}", exc_info=True)
            return []

    def _normalize_address_for_dedup(self, address: Optional[str]) -> str:
        if not address: return ""
        # Lowercase, remove punctuation, common terms, and whitespace
        address = address.lower()
        address = re.sub(r'[.,#-/]', ' ', address) # Replace common separators with space
        address = re.sub(r'\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|place|pl|court|ct|parkway|pkwy)\b','', address)
        address = re.sub(r'\s+', '', address) # Remove all whitespace
        return address
    
    def _is_same_address(self, addr1: Optional[str], addr2: Optional[str]) -> bool:
        if not addr1 or not addr2: return False
        return self._normalize_address_for_dedup(addr1) == self._normalize_address_for_dedup(addr2)

    def _deduplicate_and_enhance(self, comps: List[Dict]) -> List[Dict]:
        address_groups: Dict[str, List[Dict]] = {}
        for comp in comps:
            # Use normalized address for grouping to catch more duplicates
            norm_address = self._normalize_address_for_dedup(comp.get('address'))
            if not norm_address: continue
            if norm_address not in address_groups: address_groups[norm_address] = []
            address_groups[norm_address].append(comp)

        enhanced_comps: List[Dict] = []
        for norm_addr, comp_group in address_groups.items():
            if not comp_group: continue
            comp_group.sort(key=lambda x: (x.get('confidenceScore', 0), sum(1 for v in x.values() if v is not None)), reverse=True)
            
            # Start with the highest confidence/most complete comp
            base_comp = comp_group[0].copy()
            all_sources = {base_comp.get('source', 'Unknown').split(' - ')[0]}

            for other_comp in comp_group[1:]:
                all_sources.add(other_comp.get('source', 'Unknown').split(' - ')[0])
                for key, value in other_comp.items():
                    if key not in ['source', 'confidenceScore'] and (key not in base_comp or base_comp[key] is None) and value is not None:
                        base_comp[key] = value
            
            base_comp['source'] = "Multiple Sources - " + ", ".join(sorted(list(all_sources))) if len(all_sources) > 1 else base_comp.get('source','Unknown')
            if len(all_sources) > 1:
                 base_comp['confidenceScore'] = min(base_comp.get('confidenceScore', 0.5) + 0.1 * (len(all_sources) -1), 0.95) # Boost for multiple sources
            enhanced_comps.append(base_comp)
        return enhanced_comps

    def _filter_recent_sales(self, comps: List[Dict], years_back: int = 3) -> List[Dict]:
        recent_comps = []
        current_year = datetime.now().year
        cutoff_year = current_year - years_back

        for comp in comps:
            sale_date_str = comp.get('saleDate')
            if sale_date_str:
                try:
                    sale_year = datetime.strptime(sale_date_str, '%Y-%m-%d').year
                    if sale_year >= cutoff_year:
                        recent_comps.append(comp)
                except ValueError:
                    logger.warning(f"Could not parse saleDate '{sale_date_str}' for filtering comp: {comp.get('address')}. Including with caution.")
                    comp['confidenceScore'] = min(comp.get('confidenceScore', 0.5), 0.4) 
                    recent_comps.append(comp) # Keep if date is unparseable, but penalize confidence
            else:
                # No date means less reliable for recent sales analysis
                comp['confidenceScore'] = min(comp.get('confidenceScore', 0.5), 0.3)
                recent_comps.append(comp)
        return recent_comps

    def _sort_by_relevance(self, comps: List[Dict], input_data: Dict) -> List[Dict]:
        subject_size_str = input_data.get('subjectSizeSqFt')
        subject_year_str = input_data.get('subjectYearBuilt')
        subject_address = input_data.get('subjectAddress')

        subject_size: Optional[int] = None
        if isinstance(subject_size_str, (int, float)):
            subject_size = int(subject_size_str)
        elif isinstance(subject_size_str, str) and subject_size_str.replace('.','',1).isdigit():
            try: subject_size = int(float(subject_size_str))
            except ValueError: pass
        
        subject_year: Optional[int] = None
        if isinstance(subject_year_str, int):
            subject_year = subject_year_str
        elif isinstance(subject_year_str, str) and subject_year_str.isdigit():
            try: subject_year = int(subject_year_str)
            except ValueError: pass

        def relevance_score(comp: Dict) -> float:
            score = float(comp.get('confidenceScore', 0.0)) * 0.4 # Base confidence

            # Recency of sale
            try:
                if comp.get('saleDate'):
                    sale_date = datetime.strptime(comp['saleDate'], '%Y-%m-%d')
                    days_ago = (datetime.now() - sale_date).days
                    # Max score for very recent, drops over 3 years. Cap at 0 if older than 3*365 days.
                    recency_score = max(0, 1 - (days_ago / (years_back * 365.0))) 
                    score += recency_score * 0.3
            except (ValueError, TypeError):
                pass # No date or invalid date, no recency bonus

            # Size similarity
            comp_size = comp.get('buildingSizeSqFt')
            if subject_size and comp_size and isinstance(comp_size, (int,float)) and comp_size > 0:
                size_diff_pct = abs(subject_size - comp_size) / float(subject_size)
                size_score = max(0, 1 - size_diff_pct * 2) # Penalize more for larger differences (e.g. 50% diff = 0 score)
                score += size_score * 0.15
            
            # Age similarity
            comp_year = comp.get('yearBuilt')
            if subject_year and comp_year and isinstance(comp_year, int) and comp_year > 1800: # Basic sanity check for year
                year_diff = abs(subject_year - comp_year)
                age_score = max(0, 1 - (year_diff / 50.0)) # 0 to 1, higher for closer ages (50 years diff = 0 score)
                score += age_score * 0.15
            
            return score

        return sorted(comps, key=relevance_score, reverse=True)

    def _generate_search_summary(
        self, final_comps: List[Dict], input_data: Dict, 
        all_raw_comps: List[Dict], deduped_comps: List[Dict], recent_comps_list: List[Dict]
    ) -> str:
        summary_parts = []
        summary_parts.append(f"Comparable sales search for {input_data.get('subjectPropertyType', 'N/A')} in {input_data.get('subjectCity', 'N/A')}, {input_data.get('subjectCounty', 'N/A')}.")
        summary_parts.append(f"Initial search yielded {len(all_raw_comps)} raw entries.")
        summary_parts.append(f"After deduplication & enhancement: {len(deduped_comps)} unique properties.")
        summary_parts.append(f"Filtered to {len(recent_comps_list)} properties from the last ~3 years.")
        
        if not final_comps:
            summary_parts.append("No suitable comparable sales found matching all criteria.")
            return " ".join(summary_parts)

        summary_parts.append(f"Selected top {len(final_comps)} comparables based on relevance.")

        sources_set = set()
        for comp_list in [all_raw_comps, deduped_comps, final_comps]: # Check sources at different stages
            for comp in comp_list:
                source_name = comp.get('source', 'Unknown')
                if " - " in source_name: source_name = source_name.split(' - ')[0] # Get primary source type
                if "Multiple Sources" not in source_name: sources_set.add(source_name)
        
        if sources_set:
            summary_parts.append(f"Data sources consulted include: {', '.join(sorted(list(sources_set)))}.")
        else:
            summary_parts.append("No specific data sources were successfully identified in the final comps.")

        sale_dates = [comp.get('saleDate') for comp in final_comps if comp.get('saleDate')]
        if sale_dates:
            try:
                parsed_dates = [datetime.strptime(d, '%Y-%m-%d') for d in sale_dates]
                earliest = min(parsed_dates).strftime('%b %Y')
                latest = max(parsed_dates).strftime('%b %Y')
                summary_parts.append(f"Final selected sales range from {earliest} to {latest}.")
            except ValueError: pass # If dates are not uniform

        prices = [comp.get('salePrice') for comp in final_comps if isinstance(comp.get('salePrice'), (int, float))]
        if prices:
            min_price, max_price = min(prices), max(prices)
            summary_parts.append(f"Sale prices in final set range from ${min_price:,.0f} to ${max_price:,.0f}.")
        
        return " ".join(summary_parts) 