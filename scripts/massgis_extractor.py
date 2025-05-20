import asyncio
import logging
import re
from typing import Dict, List, Optional
from datetime import datetime

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

class MassGISPropertyExtractor:
    """Extractor for MassGIS property data."""

    def __init__(self):
        self.base_url = "https://massgis.maps.arcgis.com/apps/OnePane/basicviewer/index.html"
        self.app_id = "47689963e7bb4007961676ad9fc56ae9" # Standard MassGIS Property Tax Parcel Viewer

    async def search_properties(self, city: str, property_type: Optional[str] = None, max_parcels_to_check: int = 20) -> List[Dict]:
        """Search for properties in a specific city, optionally filtering by type."""
        properties = []
        logger.info(f"Starting MassGIS search for {city}, property type: {property_type}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=USER_AGENT)
            page = await context.new_page()

            try:
                await page.goto(f"{self.base_url}?appid={self.app_id}", timeout=90000)
                await page.wait_for_load_state('networkidle', timeout=60000) 
                logger.info(f"MassGIS page loaded for appid {self.app_id}")

                # Wait for search input to be available and fill it
                search_input_selector = 'input#searchInput, input[placeholder="Find address or place"]'
                await page.wait_for_selector(search_input_selector, timeout=30000)
                await page.fill(search_input_selector, city)
                await page.press(search_input_selector, 'Enter')
                logger.info(f"MassGIS search submitted for city: {city}")
                
                # Wait for map to pan/zoom and for results to potentially load
                await page.wait_for_timeout(7000) # Allow time for map to settle after search
                await page.wait_for_load_state('networkidle', timeout=60000)

                # Ensure "Property Tax Parcels" layer is visible/active if possible (heuristic)
                try:
                    parcels_layer_toggle = await page.query_selector('span.layer-name:has-text("Property Tax Parcels")')
                    if parcels_layer_toggle:
                        # Check if it might be a checkbox for visibility
                        checkbox = await parcels_layer_toggle.query_selector('input[type="checkbox"]')
                        if checkbox and not await checkbox.is_checked():
                            logger.info("Attempting to enable 'Property Tax Parcels' layer.")
                            await parcels_layer_toggle.click() # Try clicking the text/span
                            await page.wait_for_timeout(2000)
                except Exception as e:
                    logger.warning(f"Could not ensure 'Property Tax Parcels' layer is active: {e}")
                
                properties = await self._extract_visible_properties(page, max_parcels_to_check)

            except Exception as e:
                logger.error(f"Error during MassGIS scraping for {city}: {e}")
            finally:
                await browser.close()

        if property_type:
            properties = [p for p in properties if self._matches_property_type(p, property_type)]
        
        logger.info(f"MassGIS extractor found {len(properties)} properties for {city} (after type filter if any)." )
        return properties

    async def _extract_visible_properties(self, page, max_parcels_to_check: int) -> List[Dict]:
        properties = []
        # Attempt to click on graphics elements representing parcels on the map
        # These selectors are highly dependent on ArcGIS JS API rendering
        # Prioritize more specific selectors if possible, fall back to generic paths
        parcel_graphic_selectors = [
            'svg g[clip-path] g path', # Common for vector tile layers
            'path[d^="M"][fill-opacity="0"][stroke="#000000"]' # From original example, more specific
        ]
        
        parcel_elements = []
        for selector in parcel_graphic_selectors:
            elements = await page.query_selector_all(selector)
            if elements:
                parcel_elements.extend(elements)
                logger.info(f"Found {len(elements)} potential parcel graphics with selector: {selector}")
        
        if not parcel_elements:
            logger.warning("No parcel graphics found on the map to click.")
            return []
            
        # Deduplicate elements if multiple selectors found some of the same
        # This is a simple way; more robust might involve element properties if playwright offers
        unique_elements = list(dict.fromkeys(parcel_elements))
        logger.info(f"Total {len(unique_elements)} unique parcel graphics elements to check.")

        sample_parcels = unique_elements[:max_parcels_to_check]
        logger.info(f"Sampling {len(sample_parcels)} parcel graphics.")

        for i, parcel_graphic in enumerate(sample_parcels):
            try:
                logger.debug(f"Attempting to click parcel graphic {i+1}/{len(sample_parcels)}.")
                await parcel_graphic.click(timeout=5000, force=True) # Force may be needed for overlayed elements
                await page.wait_for_timeout(1500) # Wait for popup to appear

                popup_selector = 'div.esriPopup, div.esri-popup, div.esri-view-popup__main-container'
                popup = await page.query_selector(popup_selector)
                
                if popup and await popup.is_visible():
                    logger.debug(f"Popup detected for parcel {i+1}.")
                    property_data = await self._extract_popup_data(popup)
                    if property_data and property_data.get('address'):
                        properties.append(property_data)
                        logger.info(f"Extracted data from MassGIS popup: {property_data.get('address')}")
                    
                    # Try to close popup to not interfere with next click
                    # Common close button selectors for esri popups
                    close_button_selectors = [
                        'div.esriPopup div.close', 
                        'div.esri-popup__header-buttons button[title="Close"]'
                    ]
                    for cb_selector in close_button_selectors:
                        close_button = await page.query_selector(cb_selector)
                        if close_button and await close_button.is_visible():
                            await close_button.click(timeout=2000)
                            await page.wait_for_timeout(500)
                            logger.debug(f"Closed popup for parcel {i+1}.")
                            break 
                else:
                    logger.debug(f"No visible popup after clicking parcel graphic {i+1}.")
            
            except Exception as e:
                # Don't let one parcel click error stop the whole process
                logger.warning(f"Error interacting with parcel graphic {i+1}: {e}") 
        return properties

    async def _extract_popup_data(self, popup_element) -> Optional[Dict]:
        property_data = {}
        try:
            # More generic field extraction based on common label/value patterns in ArcGIS popups
            # Prefer direct text extraction or attribute maps where possible
            content_html = await popup_element.inner_html()
            
            # Address (often a title or clearly labeled)
            addr_patterns = [
                r'(?:Site Address|Address|Location):\s*<strong>([^<]+)<\/strong>',
                r'<div[^>]*class="title"[^>]*>([^<]+)<\/div>', # Common title element
                r'<div[^>]*class="hzLine"[^>]*>Site Address:\s*([^<]+)<\/div>' # Original example
            ]
            for pattern in addr_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match:
                    property_data['address'] = match.group(1).strip()
                    break
            
            # Use Code / Property Type
            use_code_patterns = [
                r'(?:Use Code|Property Use|Prop Class):\s*<strong>(\d+)\s*-\s*([^<]+)<\/strong>',
                r'(?:Use Code|Property Use|Prop Class):\s*<strong>([^<]+)<\/strong>',
                r'<div[^>]*class="hzLine"[^>]*>Use Code:\s*(\d+)\s*-\s*([^<]+)<\/div>'
            ]
            for pattern in use_code_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match:
                    if len(match.groups()) == 2:
                        property_data['useCode'] = match.group(1).strip()
                        property_data['propertyType'] = match.group(2).strip()
                    else:
                        property_data['propertyType'] = match.group(1).strip()
                    break

            # Assessed Value
            val_patterns = [
                r'(?:Total Value|Assessed Value):\s*<strong>\$([\d,]+)<\/strong>',
                r'<div[^>]*class="hzLine"[^>]*>Total Value:\s*\$([\d,]+)<\/div>'
            ]
            for pattern in val_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match:
                    try: property_data['assessedValue'] = int(match.group(1).replace(',', ''))
                    except ValueError: logger.warning(f"Could not parse assessed value: {match.group(1)}")
                    break
            
            # Lot Size (Acres or SqFt)
            lot_size_patterns = [
                r'(?:Lot Size|Land Area):\s*<strong>([^<]+)<\/strong>',
                r'<div[^>]*class="hzLine"[^>]*>Lot Size:\s*([^<]+)<\/div>'
            ]
            for pattern in lot_size_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match:
                    lot_size_str = match.group(1).strip()
                    if 'acres' in lot_size_str.lower():
                        acres_val_match = re.search(r'([\d\.]+)', lot_size_str)
                        if acres_val_match:
                            try: property_data['lotSizeSqFt'] = int(float(acres_val_match.group(1)) * 43560)
                            except ValueError: logger.warning(f"Could not parse lot size acres: {acres_val_match.group(1)}")
                    else: # Assume SqFt if not acres
                        sqft_val_match = re.search(r'([\d,]+)', lot_size_str)
                        if sqft_val_match:
                            try: property_data['lotSizeSqFt'] = int(sqft_val_match.group(1).replace(',',''))
                            except ValueError: logger.warning(f"Could not parse lot size sqft: {sqft_val_match.group(1)}")
                    break
            
            # Last Sale Date & Price
            sale_date_patterns = [
                r'(?:Last Sale Date|Sale Date):\s*<strong>([^<]+)<\/strong>',
                r'<div[^>]*class="hzLine"[^>]*>Last Sale Date:\s*([^<]+)<\/div>'
            ]
            sale_price_patterns = [
                r'(?:Last Sale Price|Sale Price):\s*<strong>\$([\d,]+)<\/strong>',
                r'<div[^>]*class="hzLine"[^>]*>Last Sale Price:\s*\$([\d,]+)<\/div>'
            ]
            
            sale_date_str = None
            for pattern in sale_date_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match: sale_date_str = match.group(1).strip(); break
            
            sale_price_str = None
            for pattern in sale_price_patterns:
                match = re.search(pattern, content_html, re.IGNORECASE)
                if match: sale_price_str = match.group(1).replace(',',''); break

            if sale_date_str:
                try:
                    # Common date formats found in GIS data
                    date_formats = ['%m/%d/%Y', '%Y/%m/%d', '%b %d, %Y', '%B %d, %Y']
                    for fmt in date_formats:
                        try:
                            dt_obj = datetime.strptime(sale_date_str, fmt)
                            property_data['saleDate'] = dt_obj.strftime('%Y-%m-%d')
                            break
                        except ValueError: continue
                    if 'saleDate' not in property_data: logger.warning(f"Could not parse sale date from MassGIS: {sale_date_str}")
                except Exception as e: logger.warning(f"Error parsing MassGIS sale date '{sale_date_str}': {e}")
            
            if sale_price_str:
                try: property_data['salePrice'] = int(sale_price_str)
                except ValueError: logger.warning(f"Could not parse sale price from MassGIS: {sale_price_str}")

        except Exception as e:
            logger.error(f"Error parsing MassGIS popup content: {e}")
            return None

        if property_data.get('address'):
            property_data['source'] = "MassGIS Property Viewer"
            property_data['confidenceScore'] = 0.8 # High-ish confidence for GIS data, but less than direct assessor sale record
            
            desc_parts = []
            if property_data.get('propertyType'): desc_parts.append(property_data['propertyType'])
            if property_data.get('lotSizeSqFt'): desc_parts.append(f"{property_data['lotSizeSqFt']:,} sq ft lot")
            if property_data.get('assessedValue'): desc_parts.append(f"Assessed: ${property_data['assessedValue']:,}")
            property_data['briefDescription'] = ", ".join(desc_parts) or "Property data from MassGIS"
            return property_data
        
        return None

    def _matches_property_type(self, property_data: Dict, target_type: str) -> bool:
        if 'propertyType' not in property_data: return False
        
        pt_lower = property_data['propertyType'].lower()
        target_lower = target_type.lower()
        
        # Simple substring check is often good enough for broad categories
        if target_lower in pt_lower:
            return True
        
        # Handle common commercial keywords
        commercial_keywords = ['commercial', 'retail', 'office', 'industrial', 'warehouse', 'mixed use', 'business', 'store', 'shop']
        if target_lower == 'commercial' and any(keyword in pt_lower for keyword in commercial_keywords):
            return True
        if target_lower == 'industrial' and any(keyword in pt_lower for keyword in ['industrial', 'mfg', 'manufacturing', 'warehouse']):
            return True
        if target_lower == 'office' and 'office' in pt_lower:
            return True
        if target_lower == 'retail' and any(keyword in pt_lower for keyword in ['retail', 'store', 'shop']):
            return True

        # Check use code if property type is too generic (e.g. "Commercial Building")
        use_code = property_data.get('useCode')
        if use_code: # Assuming use codes like Vision's (3xx commercial, 4xx industrial)
            if target_lower == 'commercial' and use_code.startswith('3'): return True
            if target_lower == 'industrial' and use_code.startswith('4'): return True
            if target_lower == 'office' and use_code in ['340', '341', '343', '344']: return True # Common office codes
            if target_lower == 'retail' and use_code in ['300','301','325','327']: return True # Common retail codes

        logger.debug(f"Property type '{pt_lower}' (use code: {use_code}) does not match target '{target_lower}'")
        return False 