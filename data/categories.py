"""Map Overture taxonomy to the four friendly categories in the data contract.

Overture's TAXONOMY:hierarchy starts with a top-level group (food_and_drink,
shopping, ...) then a subgroup; TAXONOMY:primary is the most specific category.
"""

FRIENDLY = ("cafe", "restaurant", "retail", "services")

TOP = {
    "shopping": "retail",
    "services_and_business": "services",
    "lifestyle_services": "services",
}
# Not walk-in local businesses; they swamped "services" in the Pomona extract.
SKIP_SUBS = {"b2b_service", "technical_service", "corporate_or_business_office", "real_estate_service",
             "home_service", "professional_service", "legal_service", "family_service"}
SKIP_PRIMARY = {"atm", "money_transfer_service"}
CAFE_SUBS = {"non_alcoholic_beverage_venue"}
# Whole words only, so steakhouse doesn't match "tea".
CAFE_WORDS = {"cafe", "coffee", "tea", "bakery", "donut", "dessert", "ice", "yogurt", "juice"}


def friendly_category(top, sub=None, primary=None):
    """Return cafe/restaurant/retail/services, or None if the place is out of scope."""
    if sub in SKIP_SUBS or primary in SKIP_PRIMARY:
        return None
    if top == "food_and_drink":
        if sub in CAFE_SUBS or CAFE_WORDS & set(str(primary).split("_")):
            return "cafe"
        return "restaurant"
    return TOP.get(top)
