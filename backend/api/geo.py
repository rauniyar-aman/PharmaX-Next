"""Geographic service-area gating for physical fulfillment (medicine delivery + lab home
collection). Doctor consultation is online-only and is never routed through here.

Serviceability is a two-layer check, both configurable from admin Settings so coverage can be
widened without a redeploy:

  1. district (coarse) — the address's structured `district` must be one of the serviceable
     districts (default: the three Kathmandu Valley districts). Fast reject for the rest of Nepal.
  2. coverage circles (fine) — the address's map pin must fall inside at least one admin-drawn
     circle (center lat/lng + radius km). This is what lets us serve only the pockets of the
     valley we can actually reach in an early phase. With no circles configured, the fine layer
     is skipped and the gate degrades to district-only (safe to ship before circles are drawn).
"""
import json
import math

from .models import SystemSetting

DEFAULT_SERVICEABLE_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur']


def _get_setting(key, default):
    # Local reader (mirrors views._get_setting) so this module doesn't import views — geo is
    # imported *by* views, and reaching back would be a circular import.
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance in kilometers between two lat/lng points."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_in_any_circle(lat, lng, circles):
    """True if (lat, lng) falls within any {lat, lng, radius_km} circle in the list. A malformed
    circle entry is skipped — bad config never silently *widens* coverage."""
    for c in circles:
        try:
            if haversine_km(lat, lng, float(c['lat']), float(c['lng'])) <= float(c['radius_km']):
                return True
        except (KeyError, TypeError, ValueError):
            continue
    return False


def _load_json_list(key, default):
    raw = _get_setting(key, None)
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else default
    except (ValueError, TypeError):
        return default


def service_area_config():
    """Current serviceable districts + coverage circles, as configured in admin Settings.
    Shape mirrors what the public GET /service-area/ endpoint returns to the frontend."""
    return {
        'districts': _load_json_list('serviceable_districts', list(DEFAULT_SERVICEABLE_DISTRICTS)),
        'circles': _load_json_list('service_area_circles', []),
    }


def check_address_serviceable(address):
    """Gate a physical-fulfillment address. Returns (ok: bool, message: str).

    Called from every delivery / lab-collection create path. Consult never calls this."""
    config = service_area_config()
    serviceable = {str(d).strip().lower() for d in config['districts'] if str(d).strip()}
    circles = config['circles']

    district = (getattr(address, 'district', '') or '').strip()
    if not district or district.lower() not in serviceable:
        names = ', '.join(str(d) for d in config['districts']) or 'our current service area'
        return False, (f'We currently deliver only within {names}. '
                       'Please choose a delivery address in our service area, or update this '
                       "address's district.")

    if address.lat is None or address.lng is None:
        return False, ("Please pin this address on the map so we can confirm it's within our "
                       'delivery area.')

    if circles and not point_in_any_circle(address.lat, address.lng, circles):
        return False, ("This location is just outside our current delivery zone. We're expanding "
                       'soon — thank you for your patience.')

    return True, ''
