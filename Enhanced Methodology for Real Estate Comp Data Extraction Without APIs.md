# Enhanced Methodology for Real Estate Comp Data Extraction Without APIs

## Overview

This document outlines an enhanced methodology for boosting real estate comparable sales data extraction and analysis using only free web-based sources without relying on paid APIs. The approach focuses on recent transactions (last 3 years) and builds upon the existing codebase's structure while introducing new techniques for more comprehensive data gathering.

## Core Enhancement Strategy

The enhanced methodology employs a multi-layered approach:

1. **Parallel Multi-Source Scraping** - Simultaneously extract data from multiple free sources
2. **Search Engine Result Page (SERP) Parsing** - Extract structured data from search results
3. **Dynamic Web Navigation** - Intelligently navigate municipal websites
4. **Data Triangulation** - Cross-reference information across multiple sources
5. **Temporal Filtering** - Focus specifically on transactions within the last 3 years

## Detailed Implementation Approach

### 1. Enhanced Municipal Assessor Database Scraping

The current code already includes a Registry of Deeds scraper, but we can significantly expand municipal assessor database coverage:

```python
class MunicipalAssessorScraperFactory:
    """Factory for creating municipal assessor scrapers based on platform type."""
    
    @staticmethod
    def create_scraper(municipality: str, county: str) -> BaseMunicipalScraper:
        """Create appropriate scraper based on municipality."""
        # Determine platform type from lookup table
        platform = MUNICIPALITY_PLATFORM_MAP.get(municipality)
        
        if platform == "VISION":
            return VisionGovScraper(municipality, county)
        elif platform == "AXISGIS":
            return AxisGISScraper(municipality, county)
        elif platform == "PATRIOT":
            return PatriotPropertiesScraper(municipality, county)
        elif municipality == "Boston":
            return BostonAssessorScraper(municipality, county)
        elif municipality == "Cambridge":
            return CambridgeAssessorScraper(municipality, county)
        else:
            return GenericMunicipalScraper(municipality, county)
```

#### Vision Government Solutions Scraper

Many Massachusetts municipalities use Vision Government Solutions. A dedicated scraper for this platform:

```python
class VisionGovScraper(BaseMunicipalScraper):
    """Scraper for Vision Government Solutions assessor databases."""
    
    def __init__(self, municipality: str, county: str):
        super().__init__(municipality, county)
        self.base_url = f"https://gis.vgsi.com/{municipality.lower()}ma/"
    
    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        """Search for recent sales of specified property type."""
        sales = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to sales search
            await page.goto(f"{self.base_url}/Sales/SalesSearch.aspx")
            
            # Set date range for last 3 years
            current_year = datetime.now().year
            start_year = current_year - years_back
            
            # Fill search form
            await page.select_option('select[name$="ddlSaleYear1"]', str(start_year))
            await page.select_option('select[name$="ddlSaleYear2"]', str(current_year))
            
            # Select property type
            property_code = self._map_property_type_to_code(property_type)
            if property_code:
                await page.select_option('select[name$="ddlUseCode"]', property_code)
            
            # Submit search
            await page.click('input[type="submit"][value="Search"]')
            await page.wait_for_load_state('networkidle')
            
            # Extract results
            sales = await self._extract_sales_from_results(page)
            
            await browser.close()
        
        return sales
    
    async def _extract_sales_from_results(self, page) -> List[Dict]:
        """Extract sales data from results page."""
        sales = []
        
        # Check if we have results
        if await page.query_selector('table.sales-results') is None:
            return sales
        
        # Extract rows
        rows = await page.query_selector_all('table.sales-results tr:not(:first-child)')
        
        for row in rows:
            try:
                # Extract cells
                cells = await row.query_selector_all('td')
                
                # Extract parcel ID for details lookup
                parcel_link = await cells[0].query_selector('a')
                if parcel_link:
                    parcel_url = await parcel_link.get_attribute('href')
                    parcel_id = self._extract_parcel_id_from_url(parcel_url)
                    
                    # Extract basic sale info
                    sale_date = await cells[1].inner_text()
                    sale_price = await cells[2].inner_text()
                    address = await cells[3].inner_text()
                    
                    # Get detailed property info
                    property_details = await self._get_property_details(page, parcel_id)
                    
                    # Combine data
                    sale_data = {
                        'address': address,
                        'saleDate': self._format_date(sale_date),
                        'salePrice': self._parse_price(sale_price),
                        'parcelId': parcel_id,
                        'source': f"Vision Government Solutions - {self.municipality} Assessor",
                        'confidenceScore': 0.9,  # High confidence for official assessor data
                        **property_details
                    }
                    
                    sales.append(sale_data)
            except Exception as e:
                logger.error(f"Error extracting sale data: {e}")
        
        return sales
    
    async def _get_property_details(self, page, parcel_id: str) -> Dict:
        """Get detailed property information."""
        details = {}
        
        # Navigate to property details page
        details_url = f"{self.base_url}/Parcel.aspx?pid={parcel_id}"
        await page.goto(details_url)
        await page.wait_for_load_state('networkidle')
        
        # Extract building size
        building_size_elem = await page.query_selector('td:has-text("Building Area") + td')
        if building_size_elem:
            building_size_text = await building_size_elem.inner_text()
            details['buildingSizeSqFt'] = self._parse_area(building_size_text)
        
        # Extract lot size
        lot_size_elem = await page.query_selector('td:has-text("Land Area") + td')
        if lot_size_elem:
            lot_size_text = await lot_size_elem.inner_text()
            details['lotSizeSqFt'] = self._parse_area(lot_size_text)
        
        # Extract year built
        year_built_elem = await page.query_selector('td:has-text("Year Built") + td')
        if year_built_elem:
            year_built_text = await year_built_elem.inner_text()
            details['yearBuilt'] = self._parse_year(year_built_text)
        
        # Extract property type
        property_type_elem = await page.query_selector('td:has-text("Property Use") + td')
        if property_type_elem:
            details['propertyType'] = await property_type_elem.inner_text()
        
        # Extract description/notes
        description_parts = []
        
        # Add building style
        style_elem = await page.query_selector('td:has-text("Building Style") + td')
        if style_elem:
            style_text = await style_elem.inner_text()
            description_parts.append(f"Style: {style_text}")
        
        # Add grade/condition if available
        condition_elem = await page.query_selector('td:has-text("Grade") + td, td:has-text("Condition") + td')
        if condition_elem:
            condition_text = await condition_elem.inner_text()
            description_parts.append(f"Condition: {condition_text}")
        
        details['briefDescription'] = "; ".join(description_parts) if description_parts else "Standard commercial property"
        
        return details
    
    def _map_property_type_to_code(self, property_type: str) -> Optional[str]:
        """Map general property type to Vision code."""
        # Common Vision property type codes
        type_map = {
            "retail": "300",
            "office": "340",
            "industrial": "400",
            "warehouse": "401",
            "apartment": "111",
            "mixed use": "013",
            "commercial": "3",  # First digit for commercial
        }
        
        # Try exact match first
        property_type_lower = property_type.lower()
        if property_type_lower in type_map:
            return type_map[property_type_lower]
        
        # Try partial match
        for key, code in type_map.items():
            if key in property_type_lower:
                return code
        
        return None
    
    def _parse_price(self, price_text: str) -> int:
        """Parse price text to integer."""
        return int(re.sub(r'[^\d]', '', price_text))
    
    def _parse_area(self, area_text: str) -> Optional[int]:
        """Parse area text to integer square feet."""
        match = re.search(r'([\d,]+)', area_text)
        if match:
            return int(match.group(1).replace(',', ''))
        return None
    
    def _parse_year(self, year_text: str) -> Optional[int]:
        """Parse year text to integer."""
        match = re.search(r'(\d{4})', year_text)
        if match:
            return int(match.group(1))
        return None
    
    def _format_date(self, date_text: str) -> str:
        """Format date to YYYY-MM-DD."""
        try:
            date_obj = datetime.strptime(date_text.strip(), '%m/%d/%Y')
            return date_obj.strftime('%Y-%m-%d')
        except:
            return date_text
    
    def _extract_parcel_id_from_url(self, url: str) -> str:
        """Extract parcel ID from URL."""
        match = re.search(r'pid=([^&]+)', url)
        if match:
            return match.group(1)
        return ""
```

### 2. Search Engine Result Page (SERP) Parser

Create a specialized SERP parser to extract structured data from search engine results:

```python
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
        
        # Generate search queries
        queries = self._generate_search_queries(property_type, city, county, state)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=self.user_agent)
            page = await context.new_page()
            
            for query in queries:
                try:
                    # Search Google
                    await page.goto(f"https://www.google.com/search?q={query}")
                    await page.wait_for_load_state('networkidle')
                    
                    # Extract structured data from search results
                    google_results = await self._extract_google_results(page, property_type)
                    sales_data.extend(google_results)
                    
                    # Add delay to avoid rate limiting
                    await asyncio.sleep(random.uniform(2, 5))
                    
                    # Search Bing
                    await page.goto(f"https://www.bing.com/search?q={query}")
                    await page.wait_for_load_state('networkidle')
                    
                    # Extract structured data from Bing results
                    bing_results = await self._extract_bing_results(page, property_type)
                    sales_data.extend(bing_results)
                    
                    # Add delay to avoid rate limiting
                    await asyncio.sleep(random.uniform(2, 5))
                    
                except Exception as e:
                    logger.error(f"Error searching {query}: {e}")
            
            await browser.close()
        
        # Remove duplicates based on address
        unique_sales = self._remove_duplicates(sales_data)
        
        # Filter for recent sales (last 3 years)
        recent_sales = self._filter_recent_sales(unique_sales)
        
        return recent_sales
    
    def _generate_search_queries(self, property_type: str, city: str, county: str, state: str) -> List[str]:
        """Generate search queries for finding recent sales."""
        current_year = datetime.now().year
        three_years_ago = current_year - 3
        
        queries = [
            f"{property_type} sold {city} {state} {three_years_ago}-{current_year}",
            f"recent {property_type} sales {city} {county} county {state}",
            f"{city} {state} commercial property transactions {three_years_ago}-{current_year}",
            f"{property_type} sale records {city} {state} assessor",
            f"{county} county {state} {property_type} sold listings",
            f"MassLandRecords {property_type} sales {city} {county}",
            f"commercial real estate transactions {city} {state} {three_years_ago}-{current_year}"
        ]
        
        return [urllib.parse.quote(query) for query in queries]
    
    async def _extract_google_results(self, page, property_type: str) -> List[Dict]:
        """Extract structured data from Google search results."""
        sales_data = []
        
        # Look for result items
        result_elements = await page.query_selector_all('div.g')
        
        for element in result_elements:
            try:
                # Extract title and link
                title_elem = await element.query_selector('h3')
                link_elem = await element.query_selector('a')
                snippet_elem = await element.query_selector('div[style*="line-height"]')
                
                if not title_elem or not link_elem:
                    continue
                
                title = await title_elem.inner_text()
                link = await link_elem.get_attribute('href')
                snippet = await snippet_elem.inner_text() if snippet_elem else ""
                
                # Check if this result likely contains sales data
                if not self._is_relevant_result(title, snippet, property_type):
                    continue
                
                # Extract structured data
                sale_data = self._extract_sale_data_from_text(title, snippet)
                
                if sale_data and 'address' in sale_data:
                    sale_data['source'] = f"Google Search Result - {link}"
                    sale_data['confidenceScore'] = 0.6  # Medium confidence for search results
                    sales_data.append(sale_data)
            
            except Exception as e:
                logger.error(f"Error extracting Google result: {e}")
        
        return sales_data
    
    async def _extract_bing_results(self, page, property_type: str) -> List[Dict]:
        """Extract structured data from Bing search results."""
        sales_data = []
        
        # Look for result items
        result_elements = await page.query_selector_all('li.b_algo')
        
        for element in result_elements:
            try:
                # Extract title and link
                title_elem = await element.query_selector('h2')
                link_elem = await element.query_selector('a')
                snippet_elem = await element.query_selector('p')
                
                if not title_elem or not link_elem:
                    continue
                
                title = await title_elem.inner_text()
                link = await link_elem.get_attribute('href')
                snippet = await snippet_elem.inner_text() if snippet_elem else ""
                
                # Check if this result likely contains sales data
                if not self._is_relevant_result(title, snippet, property_type):
                    continue
                
                # Extract structured data
                sale_data = self._extract_sale_data_from_text(title, snippet)
                
                if sale_data and 'address' in sale_data:
                    sale_data['source'] = f"Bing Search Result - {link}"
                    sale_data['confidenceScore'] = 0.6  # Medium confidence for search results
                    sales_data.append(sale_data)
            
            except Exception as e:
                logger.error(f"Error extracting Bing result: {e}")
        
        return sales_data
    
    def _is_relevant_result(self, title: str, snippet: str, property_type: str) -> bool:
        """Determine if search result is relevant to real estate sales."""
        combined_text = (title + " " + snippet).lower()
        
        # Keywords indicating sales data
        sale_keywords = ['sold', 'sale', 'transaction', 'property record', 'deed', 'transfer']
        property_keywords = [property_type.lower(), 'commercial', 'property', 'real estate']
        
        # Check for sale indicators
        has_sale_keyword = any(keyword in combined_text for keyword in sale_keywords)
        has_property_keyword = any(keyword in combined_text for keyword in property_keywords)
        
        # Check for price patterns
        has_price = bool(re.search(r'\$[\d,]+', combined_text))
        
        # Check for date patterns that might indicate a sale date
        has_date = bool(re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}', combined_text))
        
        return (has_sale_keyword and has_property_keyword) and (has_price or has_date)
    
    def _extract_sale_data_from_text(self, title: str, snippet: str) -> Optional[Dict]:
        """Extract structured sale data from text."""
        combined_text = title + " " + snippet
        
        # Extract address
        address_pattern = r'\b\d+\s+[A-Za-z0-9\s,]+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct)[,.\s]'
        address_match = re.search(address_pattern, combined_text, re.IGNORECASE)
        
        # Extract price
        price_pattern = r'\$\s*([\d,]+)'
        price_match = re.search(price_pattern, combined_text)
        
        # Extract date
        date_pattern = r'(?:sold|sale|closed|recorded)(?:\s+on)?\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})'
        date_match = re.search(date_pattern, combined_text, re.IGNORECASE)
        
        # If we don't have at least an address and either price or date, return None
        if not address_match or (not price_match and not date_match):
            return None
        
        # Create sale data dictionary
        sale_data = {
            'address': address_match.group(0).strip(),
        }
        
        # Add price if found
        if price_match:
            try:
                price_str = price_match.group(1).replace(',', '')
                sale_data['salePrice'] = int(price_str)
            except:
                pass
        
        # Add date if found
        if date_match:
            try:
                date_str = date_match.group(1)
                date_obj = datetime.strptime(date_str, '%B %d, %Y')
                sale_data['saleDate'] = date_obj.strftime('%Y-%m-%d')
            except:
                # Try alternate format
                try:
                    date_obj = datetime.strptime(date_str, '%B %d %Y')
                    sale_data['saleDate'] = date_obj.strftime('%Y-%m-%d')
                except:
                    pass
        
        # Extract property type if mentioned
        property_type_pattern = r'(retail|office|industrial|warehouse|commercial|mixed use|apartment)\s+building'
        property_type_match = re.search(property_type_pattern, combined_text, re.IGNORECASE)
        if property_type_match:
            sale_data['propertyType'] = property_type_match.group(0)
        
        # Extract square footage if mentioned
        sqft_pattern = r'(\d{1,3}(?:,\d{3})+|\d+)\s*(?:square feet|sq\.? ?ft\.?|SF)'
        sqft_match = re.search(sqft_pattern, combined_text, re.IGNORECASE)
        if sqft_match:
            try:
                sqft_str = sqft_match.group(1).replace(',', '')
                sale_data['buildingSizeSqFt'] = int(sqft_str)
            except:
                pass
        
        return sale_data
    
    def _remove_duplicates(self, sales_data: List[Dict]) -> List[Dict]:
        """Remove duplicate sales based on address."""
        unique_sales = {}
        
        for sale in sales_data:
            address = sale.get('address', '').lower()
            if not address:
                continue
                
            # If we already have this address, keep the one with more information
            if address in unique_sales:
                existing_sale = unique_sales[address]
                existing_fields = sum(1 for v in existing_sale.values() if v)
                new_fields = sum(1 for v in sale.values() if v)
                
                # Keep the one with more fields or higher confidence
                if new_fields > existing_fields or sale.get('confidenceScore', 0) > existing_sale.get('confidenceScore', 0):
                    unique_sales[address] = sale
            else:
                unique_sales[address] = sale
        
        return list(unique_sales.values())
    
    def _filter_recent_sales(self, sales_data: List[Dict]) -> List[Dict]:
        """Filter sales to only include those from the last 3 years."""
        recent_sales = []
        current_date = datetime.now()
        three_years_ago = current_date.replace(year=current_date.year - 3)
        
        for sale in sales_data:
            sale_date_str = sale.get('saleDate')
            if not sale_date_str:
                # If no date, include but with lower confidence
                sale['confidenceScore'] = min(sale.get('confidenceScore', 0.5), 0.5)
                recent_sales.append(sale)
                continue
                
            try:
                sale_date = datetime.strptime(sale_date_str, '%Y-%m-%d')
                if sale_date >= three_years_ago:
                    recent_sales.append(sale)
            except:
                # If date parsing fails, include but with lower confidence
                sale['confidenceScore'] = min(sale.get('confidenceScore', 0.5), 0.5)
                recent_sales.append(sale)
        
        return recent_sales
```

### 3. MassGIS Property Data Extractor

MassGIS provides valuable property data that can be accessed without APIs:

```python
class MassGISPropertyExtractor:
    """Extractor for MassGIS property data."""
    
    def __init__(self):
        self.base_url = "https://massgis.maps.arcgis.com/apps/OnePane/basicviewer/index.html"
        self.app_id = "47689963e7bb4007961676ad9fc56ae9"
    
    async def search_properties(self, city: str, property_type: str = None) -> List[Dict]:
        """Search for properties in a specific city."""
        properties = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to MassGIS viewer
            await page.goto(f"{self.base_url}?appid={self.app_id}")
            await page.wait_for_load_state('networkidle')
            
            # Search for city
            await page.fill('input#searchInput', city)
            await page.press('input#searchInput', 'Enter')
            await page.wait_for_load_state('networkidle')
            
            # Wait for map to load
            await asyncio.sleep(3)
            
            # Click on property parcels layer to ensure it's active
            parcels_layer = await page.query_selector('span.layer-name:has-text("Property Tax Parcels")')
            if parcels_layer:
                await parcels_layer.click()
            
            # Extract visible properties
            properties = await self._extract_visible_properties(page)
            
            await browser.close()
        
        # Filter by property type if specified
        if property_type:
            properties = [p for p in properties if self._matches_property_type(p, property_type)]
        
        return properties
    
    async def _extract_visible_properties(self, page) -> List[Dict]:
        """Extract property data from visible parcels."""
        properties = []
        
        # Click on several parcels to extract data
        # This is a sampling approach since we can't get all parcels at once
        parcel_elements = await page.query_selector_all('path[stroke="#000000"]')
        
        # Limit to a reasonable number of parcels to check
        sample_parcels = parcel_elements[:30]
        
        for parcel in sample_parcels:
            try:
                # Click on parcel to see details
                await parcel.click()
                await asyncio.sleep(1)
                
                # Extract data from popup
                popup = await page.query_selector('div.esriPopup')
                if popup:
                    property_data = await self._extract_popup_data(popup)
                    if property_data:
                        properties.append(property_data)
                
                # Close popup
                close_button = await page.query_selector('div.esriPopup div.close')
                if close_button:
                    await close_button.click()
                    await asyncio.sleep(0.5)
            
            except Exception as e:
                logger.error(f"Error extracting parcel data: {e}")
        
        return properties
    
    async def _extract_popup_data(self, popup) -> Optional[Dict]:
        """Extract property data from popup."""
        property_data = {}
        
        # Extract address
        address_elem = await popup.query_selector('div.hzLine:has-text("Site Address")')
        if address_elem:
            address_text = await address_elem.inner_text()
            address_match = re.search(r'Site Address: (.+)', address_text)
            if address_match:
                property_data['address'] = address_match.group(1).strip()
        
        # Extract property type/use code
        use_code_elem = await popup.query_selector('div.hzLine:has-text("Use Code")')
        if use_code_elem:
            use_code_text = await use_code_elem.inner_text()
            use_code_match = re.search(r'Use Code: (\d+) - (.+)', use_code_text)
            if use_code_match:
                property_data['useCode'] = use_code_match.group(1)
                property_data['propertyType'] = use_code_match.group(2)
        
        # Extract assessed value
        value_elem = await popup.query_selector('div.hzLine:has-text("Total Value")')
        if value_elem:
            value_text = await value_elem.inner_text()
            value_match = re.search(r'Total Value: \$(.+)', value_text)
            if value_match:
                try:
                    property_data['assessedValue'] = int(value_match.group(1).replace(',', ''))
                except:
                    pass
        
        # Extract lot size
        lot_size_elem = await popup.query_selector('div.hzLine:has-text("Lot Size")')
        if lot_size_elem:
            lot_size_text = await lot_size_elem.inner_text()
            lot_size_match = re.search(r'Lot Size: (.+)', lot_size_text)
            if lot_size_match:
                lot_size_str = lot_size_match.group(1)
                # Convert acres to square feet if needed
                if 'acres' in lot_size_str.lower():
                    acres_match = re.search(r'([\d.]+)', lot_size_str)
                    if acres_match:
                        try:
                            acres = float(acres_match.group(1))
                            property_data['lotSizeSqFt'] = int(acres * 43560)
                        except:
                            pass
                else:
                    # Assume square feet
                    sqft_match = re.search(r'([\d,]+)', lot_size_str)
                    if sqft_match:
                        try:
                            property_data['lotSizeSqFt'] = int(sqft_match.group(1).replace(',', ''))
                        except:
                            pass
        
        # Extract last sale info if available
        sale_date_elem = await popup.query_selector('div.hzLine:has-text("Last Sale Date")')
        sale_price_elem = await popup.query_selector('div.hzLine:has-text("Last Sale Price")')
        
        if sale_date_elem and sale_price_elem:
            sale_date_text = await sale_date_elem.inner_text()
            sale_price_text = await sale_price_elem.inner_text()
            
            date_match = re.search(r'Last Sale Date: (.+)', sale_date_text)
            price_match = re.search(r'Last Sale Price: \$(.+)', sale_price_text)
            
            if date_match:
                try:
                    date_str = date_match.group(1).strip()
                    date_obj = datetime.strptime(date_str, '%m/%d/%Y')
                    property_data['saleDate'] = date_obj.strftime('%Y-%m-%d')
                except:
                    pass
            
            if price_match:
                try:
                    property_data['salePrice'] = int(price_match.group(1).replace(',', ''))
                except:
                    pass
        
        # Add source and confidence
        if 'address' in property_data:
            property_data['source'] = "MassGIS Property Viewer"
            property_data['confidenceScore'] = 0.85  # High confidence for official GIS data
            
            # Add brief description
            description_parts = []
            if 'propertyType' in property_data:
                description_parts.append(property_data['propertyType'])
            if 'lotSizeSqFt' in property_data:
                description_parts.append(f"{property_data['lotSizeSqFt']} sq ft lot")
            
            property_data['briefDescription'] = ", ".join(description_parts) if description_parts else "Property from MassGIS"
            
            return property_data
        
        return None
    
    def _matches_property_type(self, property_data: Dict, target_type: str) -> bool:
        """Check if property matches target type."""
        if 'propertyType' not in property_data:
            return False
            
        property_type = property_data['propertyType'].lower()
        target_type = target_type.lower()
        
        # Commercial property type mapping
        commercial_types = {
            'retail': ['retail', 'store', 'shop', 'market'],
            'office': ['office', 'professional'],
            'industrial': ['industrial', 'manufacturing', 'factory'],
            'warehouse': ['warehouse', 'storage'],
            'mixed use': ['mixed use', 'mixed-use'],
            'commercial': ['commercial', 'business']
        }
        
        # Check for direct match
        if target_type in property_type:
            return True
            
        # Check for related terms
        if target_type in commercial_types:
            return any(term in property_type for term in commercial_types[target_type])
            
        return False
```

### 4. Enhanced Comparable Sales Orchestrator

Create an orchestrator to manage multiple data sources and combine results:

```python
class EnhancedComparableSalesOrchestrator:
    """Orchestrator for enhanced comparable sales data extraction."""
    
    def __init__(self):
        self.registry_lookup = RegistryLookupService()
    
    async def gather_comparable_sales(self, input_data: Dict) -> Dict:
        """Gather comparable sales from multiple sources in parallel."""
        property_type = input_data.get('subjectPropertyType', 'Commercial Property')
        city = input_data.get('subjectCity', '')
        county = input_data.get('subjectCounty', '')
        state = input_data.get('subjectState', 'MA')
        
        # Create tasks for parallel execution
        tasks = [
            self._get_municipal_assessor_data(property_type, city, county),
            self._get_registry_of_deeds_data(property_type, city, county),
            self._get_massgis_data(city, property_type),
            self._get_serp_data(property_type, city, county, state)
        ]
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks)
        
        # Combine and deduplicate results
        municipal_data, registry_data, massgis_data, serp_data = results
        all_comps = municipal_data + registry_data + massgis_data + serp_data
        
        # Remove duplicates and enhance data
        unique_comps = self._deduplicate_and_enhance(all_comps)
        
        # Filter for recent sales (last 3 years)
        recent_comps = self._filter_recent_sales(unique_comps)
        
        # Sort by relevance and limit to top results
        top_comps = self._sort_by_relevance(recent_comps, input_data)[:5]
        
        return {
            "comparableSales": top_comps,
            "searchSummary": self._generate_search_summary(top_comps, input_data)
        }
    
    async def _get_municipal_assessor_data(self, property_type: str, city: str, county: str) -> List[Dict]:
        """Get data from municipal assessor database."""
        try:
            # Create appropriate scraper for this municipality
            scraper = MunicipalAssessorScraperFactory.create_scraper(city, county)
            
            # Search for recent sales
            return await scraper.search_recent_sales(property_type, years_back=3)
        except Exception as e:
            logger.error(f"Error getting municipal assessor data: {e}")
            return []
    
    async def _get_registry_of_deeds_data(self, property_type: str, city: str, county: str) -> List[Dict]:
        """Get data from registry of deeds."""
        try:
            # Find registry for this location
            registry_info = self.registry_lookup.find_registry_for_address(f"{city}, {county}, MA")
            
            # Create scraper
            scraper = MassLandRecordsScraper(registry_info, RequestThrottler())
            
            # Search for property records
            # Note: This would need to be adapted to search for commercial properties by type
            # The current implementation searches by address/parcel
            
            # For now, return empty list as the existing scraper needs modification
            return []
        except Exception as e:
            logger.error(f"Error getting registry of deeds data: {e}")
            return []
    
    async def _get_massgis_data(self, city: str, property_type: str) -> List[Dict]:
        """Get data from MassGIS."""
        try:
            extractor = MassGISPropertyExtractor()
            return await extractor.search_properties(city, property_type)
        except Exception as e:
            logger.error(f"Error getting MassGIS data: {e}")
            return []
    
    async def _get_serp_data(self, property_type: str, city: str, county: str, state: str) -> List[Dict]:
        """Get data from search engine results."""
        try:
            scraper = RealEstateSERPScraper()
            return await scraper.search_recent_sales(property_type, city, county, state)
        except Exception as e:
            logger.error(f"Error getting SERP data: {e}")
            return []
    
    def _deduplicate_and_enhance(self, comps: List[Dict]) -> List[Dict]:
        """Remove duplicates and enhance data by combining information."""
        # Group by address
        address_groups = {}
        
        for comp in comps:
            address = comp.get('address', '').lower()
            if not address:
                continue
                
            if address not in address_groups:
                address_groups[address] = []
                
            address_groups[address].append(comp)
        
        # Combine data for each address
        enhanced_comps = []
        
        for address, comp_group in address_groups.items():
            if not comp_group:
                continue
                
            # Start with the highest confidence comp
            comp_group.sort(key=lambda x: x.get('confidenceScore', 0), reverse=True)
            enhanced_comp = comp_group[0].copy()
            
            # Combine data from other sources
            for comp in comp_group[1:]:
                for key, value in comp.items():
                    # Skip source and confidence
                    if key in ['source', 'confidenceScore']:
                        continue
                        
                    # If the field is missing or empty in enhanced_comp, use this value
                    if key not in enhanced_comp or not enhanced_comp[key]:
                        enhanced_comp[key] = value
            
            # Update source to reflect multiple sources
            if len(comp_group) > 1:
                sources = set(comp.get('source', '').split(' - ')[0] for comp in comp_group)
                enhanced_comp['source'] = "Multiple Sources - " + ", ".join(sources)
                
                # Increase confidence for multiple corroborating sources
                enhanced_comp['confidenceScore'] = min(enhanced_comp.get('confidenceScore', 0) + 0.1 * (len(comp_group) - 1), 1.0)
            
            enhanced_comps.append(enhanced_comp)
        
        return enhanced_comps
    
    def _filter_recent_sales(self, comps: List[Dict]) -> List[Dict]:
        """Filter sales to only include those from the last 3 years."""
        recent_comps = []
        current_date = datetime.now()
        three_years_ago = current_date.replace(year=current_date.year - 3)
        
        for comp in comps:
            sale_date_str = comp.get('saleDate')
            if not sale_date_str:
                # If no date, include but with lower confidence
                comp['confidenceScore'] = min(comp.get('confidenceScore', 0.5), 0.5)
                recent_comps.append(comp)
                continue
                
            try:
                sale_date = datetime.strptime(sale_date_str, '%Y-%m-%d')
                if sale_date >= three_years_ago:
                    recent_comps.append(comp)
            except:
                # If date parsing fails, include but with lower confidence
                comp['confidenceScore'] = min(comp.get('confidenceScore', 0.5), 0.5)
                recent_comps.append(comp)
        
        return recent_comps
    
    def _sort_by_relevance(self, comps: List[Dict], input_data: Dict) -> List[Dict]:
        """Sort comparables by relevance to subject property."""
        subject_size = input_data.get('subjectSizeSqFt')
        subject_year = input_data.get('subjectYearBuilt')
        
        def relevance_score(comp):
            score = comp.get('confidenceScore', 0) * 0.5  # Base on confidence
            
            # Recency of sale (newer is better)
            try:
                sale_date = datetime.strptime(comp.get('saleDate', '2000-01-01'), '%Y-%m-%d')
                days_ago = (datetime.now() - sale_date).days
                recency_score = max(0, 1 - (days_ago / (3 * 365)))  # Scale from 0 to 1 over 3 years
                score += recency_score * 0.3
            except:
                pass
            
            # Size similarity if available
            if subject_size and 'buildingSizeSqFt' in comp:
                try:
                    comp_size = comp['buildingSizeSqFt']
                    size_diff_pct = abs(subject_size - comp_size) / subject_size
                    size_score = max(0, 1 - size_diff_pct)  # 0 to 1, higher for closer sizes
                    score += size_score * 0.1
                except:
                    pass
            
            # Age similarity if available
            if subject_year and 'yearBuilt' in comp:
                try:
                    comp_year = comp['yearBuilt']
                    year_diff = abs(subject_year - comp_year)
                    age_score = max(0, 1 - (year_diff / 50))  # 0 to 1, higher for closer ages
                    score += age_score * 0.1
                except:
                    pass
            
            return score
        
        return sorted(comps, key=relevance_score, reverse=True)
    
    def _generate_search_summary(self, comps: List[Dict], input_data: Dict) -> str:
        """Generate a summary of the search process and results."""
        if not comps:
            return f"No comparable sales found for {input_data.get('subjectPropertyType')} in {input_data.get('subjectCity')}, {input_data.get('subjectCounty')}, {input_data.get('subjectState')}."
        
        sources = set()
        for comp in comps:
            source = comp.get('source', '').split(' - ')[0]
            sources.add(source)
        
        summary = f"Found {len(comps)} comparable sales for {input_data.get('subjectPropertyType')} in {input_data.get('subjectCity')}, {input_data.get('subjectCounty')}, {input_data.get('subjectState')}. "
        summary += f"Data sources include: {', '.join(sources)}. "
        
        # Add date range
        sale_dates = []
        for comp in comps:
            if 'saleDate' in comp:
                try:
                    sale_dates.append(datetime.strptime(comp['saleDate'], '%Y-%m-%d'))
                except:
                    pass
        
        if sale_dates:
            earliest = min(sale_dates).strftime('%B %Y')
            latest = max(sale_dates).strftime('%B %Y')
            summary += f"Sales range from {earliest} to {latest}. "
        
        # Add price range
        prices = [comp.get('salePrice') for comp in comps if 'salePrice' in comp]
        if prices:
            min_price = min(prices)
            max_price = max(prices)
            summary += f"Sale prices range from ${min_price:,} to ${max_price:,}."
        
        return summary
```

### 5. Enhanced LLM Integration

Modify the existing comparable-sales-flow.ts to use the enhanced scraping approach:

```typescript
// Enhanced comparable-sales-flow.ts
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// Schema definitions remain the same
// ...

export const enhancedComparableSalesFlow = ai.defineFlow(
  {
    name: 'enhancedComparableSalesFlow',
    inputSchema: ComparableSalesInputSchema,
    outputSchema: ComparableSalesOutputSchema,
  },
  async (input: ComparableSalesInput, flowContext?: any) => {
    try {
      // Two-phase approach:
      // 1. Use Python scrapers to gather data
      // 2. Use LLM to analyze and enhance the data

      // Phase 1: Run Python scrapers
      const scrapedData = await runPythonScrapers(input);
      
      if (!scrapedData || !scrapedData.comparableSales || scrapedData.comparableSales.length === 0) {
        // Fallback to LLM-only approach if scraping fails
        console.log('Scraping returned no results, falling back to LLM-only approach');
        return await fallbackToLLMOnly(input, flowContext);
      }
      
      // Phase 2: Use LLM to analyze and enhance the data
      const enhancedData = await enhanceWithLLM(scrapedData, input, flowContext);
      
      return enhancedData;
    } catch (error: any) {
      console.error("Error in enhancedComparableSalesFlow:", error);
      
      // Fallback to LLM-only approach if there's an error
      try {
        console.log('Error in enhanced flow, falling back to LLM-only approach');
        return await fallbackToLLMOnly(input, flowContext);
      } catch (fallbackError: any) {
        console.error("Error in fallback approach:", fallbackError);
        return {
          comparableSales: [],
          searchSummary: `Error generating comparable sales: ${error.message}. Fallback also failed: ${fallbackError.message}`,
        };
      }
    }
  }
);

async function runPythonScrapers(input: ComparableSalesInput): Promise<ComparableSalesOutput> {
  // Create a temporary JSON file with the input data
  const tempDir = path.join(process.cwd(), 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const inputFile = path.join(tempDir, `input_${Date.now()}.json`);
  const outputFile = path.join(tempDir, `output_${Date.now()}.json`);
  
  await fs.writeFile(inputFile, JSON.stringify(input, null, 2));
  
  // Run the Python script
  const scriptPath = path.join(process.cwd(), 'scripts', 'enhanced_comp_scraper.py');
  
  try {
    await execAsync(`python ${scriptPath} --input ${inputFile} --output ${outputFile}`);
    
    // Read the output file
    const outputData = await fs.readFile(outputFile, 'utf-8');
    const parsedOutput = JSON.parse(outputData) as ComparableSalesOutput;
    
    // Clean up temporary files
    await fs.unlink(inputFile);
    await fs.unlink(outputFile);
    
    return parsedOutput;
  } catch (error) {
    console.error("Error running Python scrapers:", error);
    throw error;
  }
}

async function enhanceWithLLM(
  scrapedData: ComparableSalesOutput, 
  input: ComparableSalesInput, 
  flowContext?: any
): Promise<ComparableSalesOutput> {
  const prompt = `
You are an AI Real Estate Analyst specializing in analyzing comparable sales data in Eastern Massachusetts.

I have gathered the following comparable sales data for a ${input.subjectPropertyType} located in/near ${input.subjectCity}, ${input.subjectCounty}, ${input.subjectState}.
Subject property approximate size: ${input.subjectSizeSqFt ? input.subjectSizeSqFt + ' sq ft' : 'N/A'}.
Subject property year built: ${input.subjectYearBuilt || 'N/A'}.

Here are the comparable sales that were found through web scraping:
${JSON.stringify(scrapedData.comparableSales, null, 2)}

Please analyze this data and:
1. Fill in any missing information where possible based on other available data
2. Standardize property type descriptions
3. Enhance the brief descriptions to be more informative
4. Adjust confidence scores based on data completeness and relevance
5. Remove any comparables that appear to be duplicates or irrelevant
6. Ensure all comparables are from the last 3 years
7. Provide an improved searchSummary that analyzes the quality and relevance of the comps

Return the enhanced data in the same JSON format, matching the ComparableSalesOutputSchema.
`;

  const { output } = await ai.runPrompt(
    {
      name: 'enhanceScrapedDataPrompt',
      prompt,
      output: { schema: ComparableSalesOutputSchema, format: 'json' },
    },
    { context: flowContext }
  );

  if (!output) {
    console.error('LLM enhancement returned no output.');
    return scrapedData;
  }
  
  return output;
}

async function fallbackToLLMOnly(
  input: ComparableSalesInput, 
  flowContext?: any
): Promise<ComparableSalesOutput> {
  const prompt = assembleComparableSalesPrompt(input);
  const { output } = await ai.runPrompt(
    {
      name: 'comparableSalesPrompt',
      prompt,
      output: { schema: ComparableSalesOutputSchema, format: 'json' },
    },
    { context: flowContext }
  );

  if (!output) {
    console.error('ComparableSalesFlow: LLM returned no output.');
    return {
      comparableSales: [],
      searchSummary: "Error: Could not generate comparable sales. LLM returned no output.",
    };
  }
  
  return output;
}
```

### 6. Python Script for Enhanced Comp Scraping

Create a Python script that uses the enhanced orchestrator:

```python
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
from datetime import datetime
from typing import Dict, List, Optional

# Import the orchestrator and related classes
# Assuming they're defined in separate modules
from scraper import RequestThrottler, RegistryLookupService
from municipal_scraper import MunicipalAssessorScraperFactory
from serp_scraper import RealEstateSERPScraper
from massgis_extractor import MassGISPropertyExtractor
from orchestrator import EnhancedComparableSalesOrchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("enhanced_comp_scraper")

async def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="Enhanced Comparable Sales Scraper")
    parser.add_argument("--input", required=True, help="Path to input JSON file")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    
    args = parser.parse_args()
    
    # Read input file
    try:
        with open(args.input, 'r') as f:
            input_data = json.load(f)
            logger.info(f"Loaded input data for {input_data.get('subjectPropertyType')} in {input_data.get('subjectCity')}")
    except Exception as e:
        logger.error(f"Error reading input file: {e}")
        sys.exit(1)
    
    # Create orchestrator
    orchestrator = EnhancedComparableSalesOrchestrator()
    
    # Gather comparable sales
    try:
        logger.info("Starting comparable sales search...")
        results = await orchestrator.gather_comparable_sales(input_data)
        logger.info(f"Found {len(results.get('comparableSales', []))} comparable sales")
    except Exception as e:
        logger.error(f"Error gathering comparable sales: {e}")
        results = {
            "comparableSales": [],
            "searchSummary": f"Error gathering comparable sales: {str(e)}"
        }
    
    # Write output file
    try:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
            logger.info(f"Wrote results to {args.output}")
    except Exception as e:
        logger.error(f"Error writing output file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
```

## Implementation Strategy

To implement this enhanced methodology, follow these steps:

1. **Create Base Classes**
   - Implement the `BaseMunicipalScraper` abstract class
   - Implement the `RequestThrottler` class (already exists)
   - Set up the directory structure for the new modules

2. **Implement Specialized Scrapers**
   - Create the `VisionGovScraper` for Vision Government Solutions
   - Create the `AxisGISScraper` for AxisGIS
   - Create the `RealEstateSERPScraper` for search engine results
   - Create the `MassGISPropertyExtractor` for MassGIS data

3. **Implement the Orchestrator**
   - Create the `EnhancedComparableSalesOrchestrator` class
   - Implement the deduplication and enhancement logic
   - Add the relevance scoring and filtering functions

4. **Modify the TypeScript Flow**
   - Update the `comparable-sales-flow.ts` to use the enhanced approach
   - Implement the Python script execution from TypeScript
   - Add the LLM enhancement step

5. **Create the Python Script**
   - Implement the main script that uses the orchestrator
   - Add command-line argument parsing
   - Set up proper error handling and logging

## Key Advantages Over Current Implementation

1. **Multi-Source Data Integration**
   - Current implementation relies primarily on LLM-based web searches
   - Enhanced approach directly scrapes multiple authoritative sources
   - Cross-references data across sources for higher accuracy

2. **Structured Data Extraction**
   - Current implementation depends on LLM's ability to extract structured data from search results
   - Enhanced approach uses purpose-built scrapers for each data source
   - Directly extracts structured data from HTML/JSON responses

3. **Temporal Filtering**
   - Current implementation has limited ability to filter by date
   - Enhanced approach explicitly filters for transactions within the last 3 years
   - Implements date parsing and validation for accurate filtering

4. **Confidence Scoring**
   - Current implementation uses simple confidence scoring
   - Enhanced approach uses multi-factor confidence scoring
   - Increases confidence when multiple sources corroborate the same data

5. **Parallel Processing**
   - Current implementation processes sequentially
   - Enhanced approach uses asynchronous processing for multiple sources
   - Significantly reduces total processing time

6. **Fallback Mechanisms**
   - Current implementation has no fallback if LLM fails
   - Enhanced approach includes fallback to LLM-only method
   - Gracefully handles failures in individual data sources

## Conclusion

This enhanced methodology significantly improves the process of finding and pulling comparable sales data for commercial real estate in Eastern Massachusetts. By leveraging multiple free web-based sources, implementing parallel processing, and combining programmatic scraping with LLM analysis, the approach provides more comprehensive, accurate, and recent comparable data without relying on paid APIs.

The implementation builds upon the existing codebase while introducing new techniques for data extraction, validation, and integration. The modular design allows for easy extension to additional data sources and property types in the future.
