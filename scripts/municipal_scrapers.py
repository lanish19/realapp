from typing import List, Dict, Optional
from playwright.async_api import async_playwright
from datetime import datetime
import logging
import re

from base_scraper import BaseMunicipalScraper # Assuming base_scraper.py is in the same directory

logger = logging.getLogger(__name__)

# TODO: Populate this map with municipality: platform_type pairs
# e.g., "Weymouth": "VISION", "Quincy": "PATRIOT"
MUNICIPALITY_PLATFORM_MAP = {
    "boston": "BOSTON_SPECIFIC", # Example: Boston might have its own unique system
    "cambridge": "CAMBRIDGE_SPECIFIC", # Example: Cambridge might also be unique
    "weymouth": "VISION",
    "quincy": "PATRIOT", # Placeholder, actual platform for Quincy needs verification
    "dedham": "VISION",
    # Add more known municipalities and their platforms here
    # This map is crucial for the factory to instantiate the correct scraper.
    # Ensure keys are lowercase for consistent lookup.
}

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

class VisionGovScraper(BaseMunicipalScraper):
    """Scraper for Vision Government Solutions assessor databases."""
    
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county)
        # Ensure municipality name is clean for URL (e.g., remove spaces, ensure correct casing if needed)
        # This might need adjustment based on actual Vision URL patterns
        clean_municipality = municipality.lower().replace(' ', '')
        self.base_url = f"https://gis.vgsi.com/{clean_municipality}ma/"
    
    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        """Search for recent sales of specified property type."""
        sales = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                await page.goto(f"{self.base_url}Sales/SalesSearch.aspx", timeout=60000)
                
                current_year = datetime.now().year
                start_year = current_year - years_back
                
                await page.select_option('select[name$="ddlSaleYear1"]', str(start_year))
                await page.select_option('select[name$="ddlSaleYear2"]', str(current_year))
                
                property_code = self._map_property_type_to_vision_code(property_type)
                if property_code:
                    # This field might not always be present, handle gracefully
                    try:
                        await page.select_option('select[name$="ddlUseCode"]', property_code, timeout=5000)
                    except Exception as e:
                        logger.warning(f"Could not select property type code {property_code} for {self.municipality}: {e}")
                
                await page.click('input[type="submit"][value="Search"]|input[type="submit"][name*="btnSearch"]|input[name*="btnSearchSales"]')
                await page.wait_for_load_state('networkidle', timeout=60000)
                
                sales = await self._extract_sales_from_results(page, browser) # Pass browser for new pages
            except Exception as e:
                logger.error(f"Error during VisionGov scraping for {self.municipality}: {e}")
            finally:
                await browser.close()
        
        return sales
    
    async def _extract_sales_from_results(self, page, browser) -> List[Dict]:
        sales = []
        result_table_selectors = ['table.sales-results', 'table[summary="Sales List"]' , '#searchResults']
        
        result_table = None
        for selector in result_table_selectors:
            table_candidate = await page.query_selector(selector)
            if table_candidate:
                result_table = table_candidate
                break
        
        if not result_table:
            logger.info(f"No sales results table found on {page.url} for {self.municipality}")
            return sales

        rows = await result_table.query_selector_all('tr:not(:first-child)') # Skip header row
        if not rows:
             rows = await result_table.query_selector_all('tbody > tr') # Alternative row selection

        logger.info(f"Found {len(rows)} potential sales rows in {self.municipality} VisionGov results.")

        for row_index, row in enumerate(rows):
            try:
                cells = await row.query_selector_all('td')
                if not cells or len(cells) < 4: # Expect at least parcel ID, date, price, address
                    logger.warning(f"Skipping row {row_index} due to insufficient cells in {self.municipality}")
                    continue

                parcel_link_elem = await cells[0].query_selector('a')
                parcel_id_text = await cells[0].inner_text()
                parcel_url = None
                if parcel_link_elem:
                    parcel_url = await parcel_link_elem.get_attribute('href')
                
                # Extract parcel ID either from link or text
                parcel_id = self._extract_parcel_id_from_url(parcel_url) if parcel_url else parcel_id_text.strip()
                if not parcel_id:
                    logger.warning(f"Could not extract Parcel ID from row {row_index} in {self.municipality}")
                    continue

                sale_date_str = await cells[1].inner_text()
                sale_price_str = await cells[2].inner_text()
                address_str = await cells[3].inner_text()

                sale_date = self._format_date(sale_date_str.strip())
                sale_price = self._parse_price(sale_price_str)

                if not sale_date or sale_price is None:
                    logger.warning(f"Skipping row {row_index} due to missing sale date or price in {self.municipality}")
                    continue
                
                property_details_page = await browser.new_page()
                property_details = await self._get_property_details(property_details_page, parcel_id, parcel_url)
                await property_details_page.close()

                sale_data = {
                    'address': address_str.strip(),
                    'saleDate': sale_date,
                    'salePrice': sale_price,
                    'parcelId': parcel_id,
                    'source': f"Vision Government Solutions - {self.municipality} Assessor",
                    'confidenceScore': 0.9,
                    **property_details
                }
                sales.append(sale_data)
            except Exception as e:
                logger.error(f"Error extracting sale data row {row_index} for {self.municipality}: {e}")
        return sales

    async def _get_property_details(self, page, parcel_id: str, parcel_url: Optional[str]) -> Dict:
        details = {}
        details_page_url_str = "unknown"
        try:
            details_page_url_str = parcel_url if parcel_url and parcel_url.startswith('http') else f"{self.base_url}Parcel.aspx?pid={parcel_id}"
            if not details_page_url_str.startswith('http'):
                 details_page_url_str = self.base_url + details_page_url_str.lstrip('/')

            await page.goto(details_page_url_str, timeout=60000)
            await page.wait_for_load_state('networkidle', timeout=30000)

            # Corrected XPath selectors
            building_size_elem = await page.query_selector("//*[contains(text(),'Building Area') or contains(text(),'Total Living Area') or contains(text(),'GBA')]/following-sibling::td[1]")
            if not building_size_elem: building_size_elem = await page.query_selector('#MainContent_lblTotalBuildingArea')
            if building_size_elem: details['buildingSizeSqFt'] = self._parse_area(await building_size_elem.inner_text())

            lot_size_elem = await page.query_selector("//*[contains(text(),'Land Area') or contains(text(),'Lot Size')]/following-sibling::td[1]")
            if not lot_size_elem: lot_size_elem = await page.query_selector('#MainContent_lblLndArea')
            if lot_size_elem: 
                lot_text = await lot_size_elem.inner_text()
                if "AC" in lot_text.upper():
                    acres_match = re.search(r'([\d\.]+)', lot_text)
                    if acres_match:
                        try: details['lotSizeSqFt'] = int(float(acres_match.group(1)) * 43560)
                        except ValueError: logger.warning(f'Could not parse acres from {lot_text}')
                else:
                    details['lotSizeSqFt'] = self._parse_area(lot_text)

            year_built_elem = await page.query_selector("//*[contains(text(),'Year Built')]/following-sibling::td[1]")
            if not year_built_elem: year_built_elem = await page.query_selector('#MainContent_lblYearBuilt')
            if year_built_elem: details['yearBuilt'] = self._parse_year(await year_built_elem.inner_text())

            property_type_elem = await page.query_selector("//*[contains(text(),'Property Use') or contains(text(),'Use Code') or contains(text(), 'Prop Class')]/following-sibling::td[1]")
            if not property_type_elem: property_type_elem = await page.query_selector('#MainContent_lblUseCode')
            if property_type_elem: details['propertyType'] = (await property_type_elem.inner_text()).strip()
            
            description_parts = []
            style_elem = await page.query_selector("//*[contains(text(),'Building Style') or contains(text(),'Style')]/following-sibling::td[1]")
            if style_elem: description_parts.append(f"Style: {(await style_elem.inner_text()).strip()}")
            
            condition_elem = await page.query_selector("//*[contains(text(),'Grade') or contains(text(),'Condition')]/following-sibling::td[1]")
            if condition_elem: description_parts.append(f"Condition: {(await condition_elem.inner_text()).strip()}")
            
            details['briefDescription'] = "; ".join(description_parts) if description_parts else "-"

        except Exception as e:
            logger.error(f'Error getting property details for {parcel_id} at {details_page_url_str}: {e}')
        return details

    def _map_property_type_to_vision_code(self, property_type: str) -> Optional[str]:
        type_map = {
            "retail": "300", "office": "340", "industrial": "400",
            "warehouse": "401", "apartment": "111", "mixed use": "013",
            "commercial": "3", "residential": "1" # Broad categories
        }
        pt_lower = property_type.lower()
        if pt_lower in type_map: return type_map[pt_lower]
        for key, code in type_map.items():
            if key in pt_lower: return code
        logger.warning(f"Could not map property type '{property_type}' to Vision code.")
        return None

    def _extract_parcel_id_from_url(self, url: Optional[str]) -> Optional[str]:
        if not url: return None
        match = re.search(r'pid=([^&]+)', url, re.IGNORECASE)
        if match: return match.group(1)
        match = re.search(r'parid=([^&]+)', url, re.IGNORECASE) # Alternative common param
        if match: return match.group(1)
        # Fallback: try to get last segment if it looks like a parcel ID
        if '/' in url:
            last_segment = url.split('=')[-1] # often after an = sign
            if last_segment and (last_segment.isalnum() or '-' in last_segment):
                 return last_segment
        return None

class GenericMunicipalScraper(BaseMunicipalScraper):
    """Generic scraper for unknown municipal platforms. Relies on SERP for now."""
    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        logger.warning(f"GenericMunicipalScraper is being used for '{self.municipality}' (County: {self.county}). "
                       f"This means no specific assessor platform was mapped for this municipality in MUNICIPALITY_PLATFORM_MAP. "
                       f"No direct municipal assessor data will be scraped by this class. "
                       f"Data for this area will primarily depend on SERPScraper and MassGISPropertyExtractor results.")
        # This scraper doesn't perform actions itself but signals that other data sources will be primary.
        return []

# Placeholder for other specific scrapers like AxisGIS, Patriot, Boston, Cambridge
class AxisGISScraper(BaseMunicipalScraper):
    """Scraper for AxisGIS-based assessor databases."""
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county)
        # Example: self.base_url = f"http://www.axisgis.com/{municipality.upper()}MA/"
        logger.info(f"AxisGISScraper initialized for {municipality}. Base URL might need adjustment.")

    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        logger.warning(f"AxisGISScraper.search_recent_sales for {self.municipality} is NOT implemented.")
        # TODO: Implement Playwright logic to navigate AxisGIS site for the specific municipality,
        # search for sales (often involves navigating map layers or specific search forms),
        # and parse results.
        raise NotImplementedError("AxisGISScraper.search_recent_sales is not implemented.")
        return []

class PatriotPropertiesScraper(BaseMunicipalScraper):
    """Scraper for Patriot Properties assessor databases."""
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county)
        # Example: self.base_url = f"http://gis.patriotproperties.com/Default.asp?TownID={municipality_code_for_patriot}"
        logger.info(f"PatriotPropertiesScraper initialized for {municipality}. Base URL and town ID will be specific.")

    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        logger.warning(f"PatriotPropertiesScraper.search_recent_sales for {self.municipality} is NOT implemented.")
        # TODO: Implement Playwright logic for Patriot Properties. This often involves:
        # 1. Finding the municipality via their main portal or a direct link.
        # 2. Navigating to sales search section.
        # 3. Filling search criteria (date range, property class/type).
        # 4. Parsing tabular results and potentially individual property cards.
        raise NotImplementedError("PatriotPropertiesScraper.search_recent_sales is not implemented.")
        return []

class BostonAssessorScraper(BaseMunicipalScraper):
    """Specific scraper for City of Boston's assessor database."""
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county) # Should be "Boston", "Suffolk"
        self.base_url = "https://www.cityofboston.gov/assessing/search/"
        logger.info(f"BostonAssessorScraper initialized.")

    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        logger.warning(f"BostonAssessorScraper.search_recent_sales for {self.municipality} is NOT implemented.")
        # TODO: Implement Playwright logic for Boston's specific assessing search portal.
        # This will involve understanding their form inputs and results display.
        # Boston may have a more API-like or structured data access point than typical vendor sites.
        raise NotImplementedError("BostonAssessorScraper.search_recent_sales is not implemented.")
        return []

class CambridgeAssessorScraper(BaseMunicipalScraper):
    """Specific scraper for City of Cambridge's assessor database."""
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county) # Should be "Cambridge", "Middlesex"
        self.base_url = "https://www.cambridgema.gov/propertydatabase"
        logger.info(f"CambridgeAssessorScraper initialized.")

    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        logger.warning(f"CambridgeAssessorScraper.search_recent_sales for {self.municipality} is NOT implemented.")
        # TODO: Implement Playwright logic for Cambridge's property database.
        raise NotImplementedError("CambridgeAssessorScraper.search_recent_sales is not implemented.")
        return []

class MunicipalAssessorScraperFactory:
    """Factory for creating municipal assessor scrapers based on platform type."""
    
    @staticmethod
    def create_scraper(municipality: str, county: str) -> BaseMunicipalScraper:
        # Normalize municipality name for lookup (lowercase)
        municipality_key = municipality.lower().strip()
        platform = MUNICIPALITY_PLATFORM_MAP.get(municipality_key)
        
        logger.info(f"Creating scraper for '{municipality}' (County: {county}), mapped platform: {platform}")
        
        if platform == "VISION":
            return VisionGovScraper(municipality, county)
        elif platform == "AXISGIS": # Ensure "AXISGIS" is used as the key in MUNICIPALITY_PLATFORM_MAP
            return AxisGISScraper(municipality, county)
        elif platform == "PATRIOT": # Ensure "PATRIOT" is used as the key in MUNICIPALITY_PLATFORM_MAP
            return PatriotPropertiesScraper(municipality, county)
        elif platform == "BOSTON_SPECIFIC": # From our example map
            return BostonAssessorScraper(municipality, county)
        elif platform == "CAMBRIDGE_SPECIFIC": # From our example map
            return CambridgeAssessorScraper(municipality, county)
        else:
            logger.warning(f"No specific scraper platform identified for '{municipality}' (key: '{municipality_key}', mapped platform: {platform}). "
                           f"Using GenericMunicipalScraper. Update MUNICIPALITY_PLATFORM_MAP for better coverage.")
            return GenericMunicipalScraper(municipality, county) 