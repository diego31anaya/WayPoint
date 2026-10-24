from typing import Annotated, Literal
from pydantic import AliasChoices, BaseModel, ConfigDict, StringConstraints, Field, field_validator, model_validator

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
    include_location_summary: bool = False
    include_score_explanation: bool = False

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
    data_source: Literal['mock', 'snowflake']
    simulated: bool
    dataset: str = 'Overture Maps Places'
    dataset_release: str
    ai_model: str | None
    recommendation_source: Literal['open_weight_model', 'cortex_ai', 'deterministic_fallback', 'insufficient_evidence']
    ai_provider: str = 'snowflake_cortex'
    warnings: list[str]
    map_truncated: bool
    category_mapping_status: str = 'candidate mappings; confirm against listing'


class AgentContextReference(StrictModel):
    business_id: str
    location_id: str


class AnalysisResponse(StrictModel):
    agent_context: AgentContextReference | None = None
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
    location_summary: 'LocationExplanation | None' = None
    score_explanation: 'LocationExplanation | None' = None


class ExplanationContent(StrictModel):
    summary: str = Field(min_length=1, max_length=1600)
    factors: list[Text] = Field(min_length=1, max_length=8)
    supporting_evidence: list[Evidence] = Field(min_length=1, max_length=20)


class LocationExplanation(ExplanationContent):
    source: Literal['open_weight_model', 'cortex_ai', 'deterministic_fallback']
    model: str | None
    limitations: list[str]
    population: None = None
    survival_probability: None = None


class StoredLocationContext(StrictModel):
    business_information: AnalysisRequest
    metrics: Metrics
    data_source: Literal['snowflake']
    dataset_release: str


class AgentChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=3000)
    business_id: Text | None = None
    location_id: Text | None = None
    business_information: AnalysisRequest | None = None
    selected_zone: 'SelectedZoneContext | None' = None
    comparison_location_ids: list[Text] = Field(default_factory=list, max_length=4)
    conversation_id: str | None = Field(default=None, min_length=1, max_length=100, pattern=r'^[0-9]+$')

    @model_validator(mode='after')
    def validate_context(self):
        if bool(self.business_id) != bool(self.location_id):
            raise ValueError('business_id and location_id must be supplied together')
        if self.comparison_location_ids and not self.business_id:
            raise ValueError('Location comparisons require verified business/location IDs')
        if self.business_information and self.business_id:
            raise ValueError('Supply either context IDs or business_information, not both')
        if self.selected_zone and not (self.business_id or self.business_information):
            raise ValueError('A selected zone requires verified location analysis context')
        return self


class AgentChatResponse(StrictModel):
    response: Annotated[str, StringConstraints(strip_whitespace=False)]
    conversation_id: str
    supporting_metrics: dict[str, list[Evidence]]
    relevant_location_ids: list[str]
    analyst_query_ids: list[str]
    metadata: dict


class OpportunityMapRequest(StrictModel):
    business_type: Literal['coffee_shop', 'restaurant', 'bakery', 'bookstore']
    location: Location
    resolution: Literal[7, 8, 9] = 8
    grid_disk_k: int = Field(default=2, ge=0, le=4)


class SelectedZoneContext(StrictModel):
    h3_cell: Text
    map_request: OpportunityMapRequest


class ZoneGeometry(StrictModel):
    type: Literal['Polygon']
    coordinates: list[list[list[float]]]


class ZoneProperties(StrictModel):
    h3_cell: str
    area_sq_km: float = Field(gt=0)
    competitor_count: int = Field(ge=0)
    competitor_density_per_sq_km: float = Field(ge=0)
    complementary_count: int = Field(ge=0)
    total_businesses: int = Field(ge=0)
    unknown_category_count: int = Field(ge=0)
    category_distribution: dict[str, int]
    opportunity_score: float | None = Field(default=None, ge=0, le=100)
    confidence: Literal['insufficient', 'limited']
    geographic_coverage: Literal['unknown'] = 'unknown'
    population: None = None


class ZoneFeature(StrictModel):
    type: Literal['Feature'] = 'Feature'
    geometry: ZoneGeometry
    properties: ZoneProperties


class OpportunityMapResponse(StrictModel):
    type: Literal['FeatureCollection'] = 'FeatureCollection'
    features: list[ZoneFeature]
    metadata: dict
