#!/usr/bin/env bash
# Pre-demo smoke test for the rehearsed search (coffee shop, 91768, 2 mi).
# Start the backend (:8000) and frontend (:5173) first, then: bash scripts/smoke_demo.sh
set -u
FRONT=${FRONT:-http://localhost:5173}
API=${API:-http://localhost:8000}
fail=0
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }

check "frontend serves the app"        "curl -sf $FRONT/ | grep -q '<div id=\"root\">'"
check "91768 ZIP data: 20 cafes in 2 mi" "curl -sf $FRONT/data/zip/91768.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"categories\"][\"cafe\"][\"2\"][\"competitors\"] == 20'"
check "heatmap files load"              "curl -sf $FRONT/data/heat/cells.json -o /dev/null && curl -sf $FRONT/data/heat/cafe.json -o /dev/null"
check "About the data story loads"      "curl -sf $FRONT/data/story.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d[\"findings\"][\"dataset\"][\"places\"] == 342543'"
check "backend health"                  "curl -sf $API/api/health | grep -q '\"status\":\"ok\"'"
check "analyze 91768 coffee 2 mi: 20 competitors, labeled source" \
  "curl -sf $API/api/analyze -H 'Content-Type: application/json' -d '{\"business_type\":\"coffee_shop\",\"location\":{\"latitude\":34.06047,\"longitude\":-117.79182},\"radius_m\":3219}' | python3 -c 'import json,sys; j=json.load(sys.stdin); assert j[\"metrics\"][\"competitor_count\"] == 20; print(\"      source:\", j[\"metadata\"][\"data_source\"], \"/\", j[\"metadata\"][\"recommendation_source\"])'"
check "frontend proxies /api to backend" "curl -sf $FRONT/api/health | grep -q '\"status\":\"ok\"'"
exit $fail
