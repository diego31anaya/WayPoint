"""Map Overture primary categories to the four friendly ones in the data contract."""

FRIENDLY = ("cafe", "restaurant", "retail", "services")

# Exact matches win; checked before the keyword rules below.
EXACT = {
    "cafe": "cafe",
    "coffee_shop": "cafe",
    "tea_room": "cafe",
    "bubble_tea": "cafe",
    "bakery": "cafe",
    "dessert_shop": "cafe",
    "donuts": "cafe",
    "juice_bar": "cafe",
    "ice_cream_shop": "cafe",
    "bar": "restaurant",
    "pub": "restaurant",
    "fast_food_restaurant": "restaurant",
    "food_truck": "restaurant",
    "pizza_restaurant": "restaurant",
    "sandwich_shop": "restaurant",
    "grocery_store": "retail",
    "convenience_store": "retail",
    "supermarket": "retail",
    "pharmacy": "retail",
    "florist": "retail",
    "bookstore": "retail",
    "gas_station": "services",
    "hotel": "services",
    "gym": "services",
    "bank_credit_union": "services",
    "laundromat": "services",
    "dry_cleaning": "services",
}

# (substring, friendly) checked in order; first hit wins.
KEYWORDS = (
    ("coffee", "cafe"),
    ("cafe", "cafe"),
    ("bakery", "cafe"),
    ("restaurant", "restaurant"),
    ("food", "restaurant"),
    ("grill", "restaurant"),
    ("diner", "restaurant"),
    ("steak", "restaurant"),
    ("bbq", "restaurant"),
    ("barbecue", "restaurant"),
    ("burger", "restaurant"),
    ("pizza", "restaurant"),
    ("sushi", "restaurant"),
    ("taco", "restaurant"),
    ("store", "retail"),
    ("shop", "retail"),
    ("retail", "retail"),
    ("market", "retail"),
    ("boutique", "retail"),
    ("salon", "services"),
    ("barber", "services"),
    ("spa", "services"),
    ("repair", "services"),
    ("service", "services"),
    ("dentist", "services"),
    ("doctor", "services"),
    ("clinic", "services"),
    ("lawyer", "services"),
    ("insurance", "services"),
    ("real_estate", "services"),
    ("auto", "services"),
    ("fitness", "services"),
    ("studio", "services"),
    ("tutor", "services"),
    ("school", None),  # not a local business for our purposes
)


def friendly_category(raw):
    """Return cafe/restaurant/retail/services, or None if the place is out of scope."""
    if not isinstance(raw, str) or not raw:
        return None
    raw = raw.lower()
    if raw in EXACT:
        return EXACT[raw]
    for key, friendly in KEYWORDS:
        if key in raw:
            return friendly
    return None
