from typing import Annotated, Literal
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

Text = Annotated[str, Field(min_length=1, max_length=300, pattern=r'\S')]
BusinessGoal = Literal['Attract more customers', 'Stand out from competitors',
    'Identify new products or services', 'Find partnership opportunities',
    'Explore opening a new location', 'Understand the local market']
BUSINESS_GOALS = list(BusinessGoal.__args__)

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
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)


class Location(StrictModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AnalysisRequest(StrictModel):
    business_type: Literal['coffee_shop', 'restaurant', 'bakery', 'bookstore'] = Field(
        validation_alias=AliasChoices('business_type', 'business_category', 'category'))
    location: Location
    radius_m: int = Field(default=1500, ge=100, le=5000)
    business_goal: Text = 'Attract more customers'
    owner_preferences: list[Text] = Field(default_factory=list, max_length=10)
    business_name: Text | None = None
    business_description: str = Field(default='', max_length=2000)
    products_and_services: list[Text] = Field(default_factory=list, max_length=30)
    target_customers: list[Text] = Field(default_factory=list, max_length=20)
    monthly_marketing_budget: float | None = Field(default=None, ge=0, le=1_000_000_000)
    current_challenges: list[Text] = Field(default_factory=list, max_length=20)
    existing_marketing_strategies: list[Text] = Field(default_factory=list, max_length=20)
    business_stage: Literal['planning', 'newly_opened', 'established'] | None = None

    @field_validator('business_type', mode='before')
    @classmethod
    def normalize_category(cls, value):
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower().replace(' ', '_')
        return {'cafe': 'coffee_shop', 'café': 'coffee_shop', 'coffee': 'coffee_shop',
                'book_store': 'bookstore'}.get(normalized, normalized)


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
    competitor_share: float = Field(default=0, ge=0, le=1)
    unknown_category_count: int = Field(default=0, ge=0)


class Signal(StrictModel):
    signal_id: str
    score: float = Field(ge=0, le=100)
    explanation: str
    evidence_ids: list[str]
    contributing_metrics: list[Evidence] = Field(default_factory=list)


class DataQuality(StrictModel):
    mapped_record_count: int
    classified_record_count: int
    category_completeness: float | None
    geographic_coverage: Literal['unknown'] = 'unknown'
    confidence: Literal['insufficient', 'limited']
    limitations: list[str]


class NeighborhoodInsights(StrictModel):
    complementary_categories: dict[str, int]
    points_of_interest: list[Business]
    nearest_competitors: list[Business]
    marker_subset_only: bool
    data_quality: DataQuality
    limitations: list[str]


class Recommendation(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=800)
    reason: str = Field(min_length=1, max_length=800)
    supporting_evidence: list[Evidence] = Field(min_length=1, max_length=6)
    action_steps: list[Text] = Field(min_length=1, max_length=5)
    priority: Literal['low', 'medium', 'high']
    limitations: list[Text] = Field(min_length=1, max_length=6)


class RecommendationBatch(StrictModel):
    recommendations: list[Recommendation] = Field(min_length=3, max_length=3)


class Metadata(StrictModel):
    data_source: Literal['local', 'mock', 'snowflake']
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
    business_information: AnalysisRequest | None = None
    neighborhood_insights: NeighborhoodInsights | None = None


class ChatMessage(StrictModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(StrictModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    # Plain-text neighborhood facts from the frontend (ZIP, business type, numbers). Untrusted data.
    context: str = Field(default='', max_length=4000)


class ChatResponse(StrictModel):
    reply: str
    source: Literal['open_weight_model', 'fallback']
    warnings: list[str]
