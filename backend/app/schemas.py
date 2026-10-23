from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

CATEGORIES = {
    'coffee_shop': ['coffee_shop', 'cafe'],
    'restaurant': ['restaurant'],
    'bakery': ['bakery'],
    'bookstore': ['bookstore', 'book_store'],
}
COMPLEMENTS = {
    'coffee_shop': ['school', 'college', 'university', 'library', 'bookstore', 'office'],
    'restaurant': ['office', 'hotel', 'theatre', 'cinema'],
    'bakery': ['coffee_shop', 'cafe', 'school', 'office'],
    'bookstore': ['school', 'college', 'university', 'library', 'coffee_shop', 'cafe'],
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Location(StrictModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AnalysisRequest(StrictModel):
    business_type: Literal['coffee_shop', 'restaurant', 'bakery', 'bookstore']
    location: Location
    radius_m: int = Field(default=1500, ge=100, le=5000)
    business_goal: str = Field(default='Attract more customers', min_length=1, max_length=300)
    owner_preferences: list[str] = Field(default_factory=list, max_length=10)


class Business(StrictModel):
    business_id: str | None = None
    name: str
    category: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    distance_m: float = Field(ge=0)
    ownership: Literal['unknown'] = 'unknown'


class Evidence(StrictModel):
    metric_id: str
    value: float
    unit: str


class Metrics(StrictModel):
    competitor_count: int
    competitor_density_per_sq_km: float
    nearest_competitor_distance_m: float | None
    complementary_count: int
    total_businesses: int
    category_distribution: dict[str, int]


class Signal(StrictModel):
    signal_id: str
    score: float = Field(ge=0, le=100)
    explanation: str
    evidence_ids: list[str]


class Recommendation(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=800)
    reason: str = Field(min_length=1, max_length=800)
    supporting_evidence: list[Evidence] = Field(min_length=1, max_length=6)
    action_steps: list[str] = Field(min_length=1, max_length=5)
    priority: Literal['low', 'medium', 'high']
    limitations: list[str] = Field(min_length=1)


class RecommendationBatch(StrictModel):
    recommendations: list[Recommendation] = Field(min_length=3, max_length=3)


class Metadata(StrictModel):
    data_source: Literal['mock', 'snowflake']
    simulated: bool
    dataset: str = 'Overture Maps Places'
    dataset_release: str
    ai_model: str | None
    recommendation_source: Literal['open_weight_model', 'deterministic_fallback', 'insufficient_evidence']
    warnings: list[str]
    map_truncated: bool
    category_mapping_status: str = 'candidate mappings; confirm against listing'


class AnalysisResponse(StrictModel):
    business_type: str
    location: Location
    radius_m: int
    metrics: Metrics
    evidence: list[Evidence]
    nearby_businesses: list[Business]
    opportunity_signals: list[Signal]
    recommendations: list[Recommendation]
    metadata: Metadata
