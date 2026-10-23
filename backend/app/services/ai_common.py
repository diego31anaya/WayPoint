import json
import re
from app.schemas import Recommendation, RecommendationBatch

LIMITATION = 'Mapped locations do not establish purchasing demand, traffic, revenue, or profitability; validate through a small experiment.'


def generation_schema(evidence):
    """Constrain citation fields; the validator enforces complete observed triples."""
    schema = RecommendationBatch.model_json_schema()
    # Flat property enums narrow the structured generation vocabulary.
    # Cross-field equality remains enforced by validate_evidence after generation.
    properties = schema['$defs']['Evidence']['properties']
    properties['metric_id']['enum'] = sorted({e.metric_id for e in evidence})
    properties['value']['enum'] = sorted({e.value for e in evidence})
    properties['unit']['enum'] = sorted({e.unit for e in evidence})
    # English experiment prose uses letters/punctuation; observed numbers stay in citations.
    prose_pattern = r'''^[A-Za-z ,.;:!?()/&'"-]*$'''
    recommendation = schema['$defs']['Recommendation']['properties']
    for field in ['title', 'description', 'reason']:
        recommendation[field]['pattern'] = prose_pattern
    for field in ['action_steps', 'limitations']:
        recommendation[field]['items']['pattern'] = prose_pattern
    return schema


def validate_prose(text):
    if re.search(r'\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|percent)\b', text, re.I):
        raise ValueError('Numerical claims must appear only in structured evidence')
    if re.search(r'\b(guarantee\w*|proven|will increase|will boost)\b', text, re.I):
        raise ValueError('Unsupported certainty')


def validate_evidence(batch, evidence):
    lookup = {e.metric_id: e for e in evidence}
    if len({r.title.strip().casefold() for r in batch.recommendations}) != 3:
        raise ValueError('Recommendations must be distinct')
    for rec in batch.recommendations:
        for cited in rec.supporting_evidence:
            original = lookup.get(cited.metric_id)
            if original is None or cited.value != original.value or cited.unit != original.unit:
                raise ValueError('Unsupported evidence')
        # Keep numeric observations exclusively in server-verified evidence fields.
        text = ' '.join([rec.title, rec.description, rec.reason, *rec.action_steps, *rec.limitations])
        validate_prose(text)
    return batch


def fallback(evidence, context=None):
    lookup = {e.metric_id: e for e in evidence}
    strategies = [
        ('Test a distinctive offer', 'Experiment with an offer that distinguishes your business.',
         'competitor_count', ['Compare publicly available competitor offers.', 'Pilot a distinctive offer.', 'Measure customer feedback and your own sales.']),
        ('Explore local partnerships', 'Ask nearby complementary organizations about a small joint promotion.',
         'complementary_count', ['Verify potential partners and their interest.', 'Agree on a small pilot.', 'Track redemptions and customer feedback.']),
        ('Validate a neighborhood hypothesis', 'Ask customers what would make your business more useful to them.',
         'total_businesses', ['Interview customers about their needs.', 'Test a suggested service with a limited budget.', 'Review your own results before expanding.']),
    ]
    if lookup['complementary_count'].value == 0:
        strategies[1] = ('Investigate possible partnerships', 'Interview local owners to investigate whether a partnership is feasible.',
                         'complementary_count', ['Verify the local directory and potential collaborators.', 'Ask about shared interests before proposing a partnership.', 'Pilot only after validating partner interest.'])
    recommendations = [Recommendation(title=title, description=description,
            reason='This is an experiment informed by the cited mapped-location metric, not a demand prediction.',
            supporting_evidence=[lookup[metric].model_copy(deep=True)], action_steps=steps, priority='medium', limitations=[LIMITATION])
            for title, description, metric, steps in strategies]
    if context is not None:
        for rec in recommendations:
            rec.reason += ' Owner goal: ' + context.business_goal + '.'
            if context.business_stage == 'planning':
                rec.action_steps[0] = 'Interview prospective customers before committing to a location or launch.'
            if context.monthly_marketing_budget == 0:
                rec.action_steps.insert(0, 'Use existing channels and direct outreach without paid advertising.')
            if context.existing_marketing_strategies:
                rec.action_steps.append('Compare this experiment against your existing strategies; avoid repeating an unchanged campaign.')
            rec.action_steps = rec.action_steps[:5]
    return recommendations


