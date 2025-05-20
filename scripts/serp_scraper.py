import asyncio
import logging
import random
import re
import urllib.parse
from datetime import datetime
from typing import Dict, List, Optional

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

class RealEstateSERPScraper:
    """Scraper for extracting real estate sales data from search engine results."""

    def __init__(self, user_agent: str = USER_AGENT):
        self.user_agent = user_agent
        self.headers = {
            'User-Agent': self.user_agent
        }

    async def search_recent_sales(self, property_type: str, city: str, county: str, state: str = "MA") -> List[Dict]:
        """Search for recent sales using search engines."""
        sales_data = []
        queries = self._generate_search_queries(property_type, city, county, state)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=self.user_agent)
            page = await context.new_page()

            for query in queries:
                try:
                    logger.info(f"Searching Google for: {query}")
                    await page.goto(f"https://www.google.com/search?q={query}", timeout=60000)
                    await page.wait_for_load_state('networkidle', timeout=30000)
                    google_results = await self._extract_google_results(page, property_type)
                    sales_data.extend(google_results)
                    await asyncio.sleep(random.uniform(2, 5))

                    logger.info(f"Searching Bing for: {query}")
                    await page.goto(f"https://www.bing.com/search?q={query}", timeout=60000)
                    await page.wait_for_load_state('networkidle', timeout=30000)
                    bing_results = await self._extract_bing_results(page, property_type)
                    sales_data.extend(bing_results)
                    await asyncio.sleep(random.uniform(2, 5))

                except Exception as e:
                    logger.error(f"Error searching query '{query}': {e}")
            
            await browser.close()

        unique_sales = self._remove_duplicates(sales_data)
        recent_sales = self._filter_recent_sales(unique_sales)
        logger.info(f"SERP scraper found {len(recent_sales)} unique recent sales.")
        return recent_sales

    def _generate_search_queries(self, property_type: str, city: str, county: str, state: str) -> List[str]:
        current_year = datetime.now().year
        three_years_ago = current_year - 3
        queries = [
            f'{property_type} sold {city} {state} {three_years_ago}-{current_year}',
            f'recent {property_type} sales {city} {county} county {state}',
            f'{city} {state} commercial property transactions {three_years_ago}-{current_year}',
            f'{property_type} sale records {city} {state} assessor',
            f'{county} county {state} {property_type} sold listings',
            f'MassLandRecords {property_type} sales {city} {county}',
            f'commercial real estate transactions {city} {state} {three_years_ago}-{current_year}'
        ]
        return [urllib.parse.quote(query) for query in queries]

    async def _extract_google_results(self, page, property_type: str) -> List[Dict]:
        sales_data = []
        result_elements = await page.query_selector_all('div.g')
        logger.info(f"Found {len(result_elements)} Google result elements.")

        for i, element in enumerate(result_elements):
            try:
                title_elem = await element.query_selector('h3')
                link_elem = await element.query_selector('a')
                # More robust snippet selection
                snippet_elem = await element.query_selector('div[data-sncf="1"] span:not([class]), div[style*="line-height"] span:not([class]), .VwiC3b span, .MUxGbd span') 

                if not title_elem or not link_elem:
                    logger.debug(f"Skipping Google result {i} due to missing title or link.")
                    continue

                title = await title_elem.inner_text()
                link = await link_elem.get_attribute('href')
                snippet = await snippet_elem.inner_text() if snippet_elem else ""
                logger.debug(f"Google Result {i}: Title='{title}', Link='{link}', Snippet Present: {bool(snippet_elem)}")

                if not self._is_relevant_result(title, snippet, property_type):
                    logger.debug(f"Google result {i} deemed not relevant.")
                    continue
                
                sale_data = self._extract_sale_data_from_text(title, snippet)
                if sale_data and sale_data.get('address'):
                    sale_data['source'] = f"Google Search Result - {link}"
                    sale_data['confidenceScore'] = 0.6 
                    sales_data.append(sale_data)
                    logger.info(f"Extracted sale from Google: {sale_data.get('address')}")
            except Exception as e:
                logger.error(f"Error extracting Google result {i} ('{title if 'title' in locals() else 'N/A'}'): {e}")
        return sales_data

    async def _extract_bing_results(self, page, property_type: str) -> List[Dict]:
        sales_data = []
        result_elements = await page.query_selector_all('li.b_algo')
        logger.info(f"Found {len(result_elements)} Bing result elements.")

        for i, element in enumerate(result_elements):
            try:
                title_elem = await element.query_selector('h2 a') # Link is usually within h2
                snippet_elem = await element.query_selector('.b_caption p')

                if not title_elem:
                    logger.debug(f"Skipping Bing result {i} due to missing title.")
                    continue

                title = await title_elem.inner_text()
                link = await title_elem.get_attribute('href')
                snippet = await snippet_elem.inner_text() if snippet_elem else ""
                logger.debug(f"Bing Result {i}: Title='{title}', Link='{link}', Snippet Present: {bool(snippet_elem)}")

                if not self._is_relevant_result(title, snippet, property_type):
                    logger.debug(f"Bing result {i} deemed not relevant.")
                    continue

                sale_data = self._extract_sale_data_from_text(title, snippet)
                if sale_data and sale_data.get('address'):
                    sale_data['source'] = f"Bing Search Result - {link}"
                    sale_data['confidenceScore'] = 0.6
                    sales_data.append(sale_data)
                    logger.info(f"Extracted sale from Bing: {sale_data.get('address')}")
            except Exception as e:
                logger.error(f"Error extracting Bing result {i} ('{title if 'title' in locals() else 'N/A'}'): {e}")
        return sales_data

    def _is_relevant_result(self, title: str, snippet: str, property_type: str) -> bool:
        combined_text = (title + " " + snippet).lower()
        sale_keywords = ['sold', 'sale', 'transaction', 'property record', 'deed', 'transfer', 'closed']
        property_keywords = [property_type.lower(), 'commercial', 'property', 'real estate', 'building']
        
        has_sale_keyword = any(keyword in combined_text for keyword in sale_keywords)
        has_property_keyword = any(keyword in combined_text for keyword in property_keywords)
        has_price = bool(re.search(r'\$[\d,]+', combined_text))
        has_date = bool(re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b', combined_text, re.IGNORECASE))
        
        # More weight if price and date are present
        if has_price and has_date and has_property_keyword:
            return True
        # If it has sale and property keywords, and either price or date, it's likely relevant
        if has_sale_keyword and has_property_keyword and (has_price or has_date):
            return True
        return False

    def _extract_sale_data_from_text(self, title: str, snippet: str) -> Optional[Dict]:
        combined_text = title + " " + snippet
        sale_data = {}

        address_pattern = r'\b\d+\s+[A-Za-z0-9\s.,#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct|Parkway|Pkwy)\b'
        address_match = re.search(address_pattern, combined_text, re.IGNORECASE)
        if address_match: sale_data['address'] = address_match.group(0).strip(' .,')

        price_pattern = r'\$\s*([\d,]+(?:\.\d{2})?)'
        price_match = re.search(price_pattern, combined_text)
        if price_match:
            try: sale_data['salePrice'] = int(re.sub(r'[^\d]','', price_match.group(1).split('.')[0]))
            except ValueError: logger.warning(f"Could not parse price from SERP text: {price_match.group(1)}")

        # Improved date extraction, looking for various formats and keywords
        date_keywords = ['sold', 'sale date', 'closed', 'recorded', 'transferred']
        date_regexes = [
            r'(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b)',
            r'(\b\d{1,2}/\d{1,2}/\d{2,4}\b)' 
        ]
        found_date_str = None
        for keyword in date_keywords:
            for regex in date_regexes:
                match = re.search(f'{keyword}\s*(?:on|as of|date)?\s*:?\s*{regex}', combined_text, re.IGNORECASE)
                if match: found_date_str = match.group(1); break
            if found_date_str: break
        if not found_date_str: # Try regex without keywords if no keyword match
             for regex in date_regexes:
                match = re.search(regex, combined_text, re.IGNORECASE)
                if match: found_date_str = match.group(1); break

        if found_date_str:
            try: # Try common formats
                dt_obj = datetime.strptime(found_date_str, '%B %d, %Y')
                sale_data['saleDate'] = dt_obj.strftime('%Y-%m-%d')
            except ValueError:
                try: 
                    dt_obj = datetime.strptime(found_date_str, '%b %d, %Y')
                    sale_data['saleDate'] = dt_obj.strftime('%Y-%m-%d')
                except ValueError:
                    try:
                        dt_obj = datetime.strptime(found_date_str, '%m/%d/%Y')
                        sale_data['saleDate'] = dt_obj.strftime('%Y-%m-%d')
                    except ValueError:
                        try:
                            dt_obj = datetime.strptime(found_date_str, '%m/%d/%y')
                            sale_data['saleDate'] = dt_obj.strftime('%Y-%m-%d')
                        except ValueError:
                             logger.warning(f"Could not parse date from SERP text: {found_date_str}")

        # Only return if we have an address and at least a price or a date
        if not sale_data.get('address') or not (sale_data.get('salePrice') or sale_data.get('saleDate')):
            return None
        
        # Extract property type (basic)
        pt_match = re.search(r'(retail|office|industrial|warehouse|commercial|mixed use|apartment|multi-family|land|condo)', combined_text, re.IGNORECASE)
        if pt_match: sale_data['propertyType'] = pt_match.group(1).capitalize()

        # Extract square footage (basic)
        sf_match = re.search(r'([\d,]+)\s*(?:sf|sq.?ft.?|square feet)', combined_text, re.IGNORECASE)
        if sf_match:
            try: sale_data['buildingSizeSqFt'] = int(sf_match.group(1).replace(',',''))
            except ValueError: logger.warning(f"Could not parse sqft from SERP text: {sf_match.group(1)}")
            
        return sale_data

    def _remove_duplicates(self, sales_data: List[Dict]) -> List[Dict]:
        unique_sales_map: Dict[str, Dict] = {}
        for sale in sales_data:
            address = sale.get('address')
            if not address: continue
            # Normalize address somewhat for better matching
            norm_address = re.sub(r'[^\w]', '', address.lower())
            
            if norm_address not in unique_sales_map:
                unique_sales_map[norm_address] = sale
            else: # Combine if new one has more info or higher confidence
                current_sale = unique_sales_map[norm_address]
                current_fields = sum(1 for v in current_sale.values() if v is not None)
                new_fields = sum(1 for v in sale.values() if v is not None)
                if new_fields > current_fields or sale.get('confidenceScore', 0) > current_sale.get('confidenceScore', 0):
                    # Merge data, preferring more complete entry
                    merged_sale = {**current_sale, **sale} # new sale overwrites current
                    # Prefer non-None values after merge
                    for key in list(merged_sale.keys()):
                        if merged_sale[key] is None and current_sale.get(key) is not None:
                            merged_sale[key] = current_sale[key]
                        elif merged_sale[key] is None and sale.get(key) is not None:
                             merged_sale[key] = sale[key]
                    unique_sales_map[norm_address] = merged_sale
        return list(unique_sales_map.values())

    def _filter_recent_sales(self, sales_data: List[Dict], years_back: int = 3) -> List[Dict]:
        recent_sales = []
        current_year = datetime.now().year
        cutoff_year = current_year - years_back

        for sale in sales_data:
            sale_date_str = sale.get('saleDate')
            if sale_date_str:
                try:
                    sale_year = datetime.strptime(sale_date_str, '%Y-%m-%d').year
                    if sale_year >= cutoff_year:
                        recent_sales.append(sale)
                    else:
                        logger.debug(f"Filtered out old sale (date: {sale_date_str}): {sale.get('address')}")
                except ValueError:
                    logger.warning(f"Could not parse saleDate '{sale_date_str}' for filtering. Including sale: {sale.get('address')}")
                    # Include if date is unparseable but might be recent, adjust confidence if needed
                    sale['confidenceScore'] = min(sale.get('confidenceScore', 0.5), 0.4) 
                    recent_sales.append(sale)
            else:
                # If no date, include but with lower confidence
                sale['confidenceScore'] = min(sale.get('confidenceScore', 0.5), 0.3)
                recent_sales.append(sale)
                logger.debug(f"Including sale with no date (will have low confidence): {sale.get('address')}")
        return recent_sales 