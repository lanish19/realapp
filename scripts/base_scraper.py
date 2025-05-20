from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)

class BaseMunicipalScraper(ABC):
    """Abstract base class for municipal assessor scrapers."""

    def __init__(self, municipality: str, county: str):
        self.municipality = municipality
        self.county = county
        self.base_url: Optional[str] = None

    @abstractmethod
    async def search_recent_sales(self, property_type: str, years_back: int = 3) -> List[Dict]:
        """Search for recent sales of the specified property type."""
        pass

    def _parse_price(self, price_text: str) -> Optional[int]:
        """Parse price text to integer."""
        try:
            return int(re.sub(r'[^\d]', '', price_text))
        except ValueError:
            logger.warning(f"Could not parse price: {price_text}")
            return None

    def _parse_area(self, area_text: str) -> Optional[int]:
        """Parse area text to integer square feet."""
        match = re.search(r'([\d,]+)', area_text)
        if match:
            try:
                return int(match.group(1).replace(',', ''))
            except ValueError:
                logger.warning(f"Could not parse area: {area_text}")
                return None
        logger.warning(f"Could not find area pattern in: {area_text}")
        return None

    def _parse_year(self, year_text: str) -> Optional[int]:
        """Parse year text to integer."""
        match = re.search(r'(\d{4})', year_text)
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                logger.warning(f"Could not parse year: {year_text}")
                return None
        logger.warning(f"Could not find year pattern in: {year_text}")
        return None

    def _format_date(self, date_text: str, input_format: str = '%m/%d/%Y') -> Optional[str]:
        """Format date to YYYY-MM-DD."""
        try:
            date_obj = datetime.strptime(date_text.strip(), input_format)
            return date_obj.strftime('%Y-%m-%d')
        except ValueError:
            logger.warning(f"Could not parse date: {date_text} with format {input_format}")
            return None 