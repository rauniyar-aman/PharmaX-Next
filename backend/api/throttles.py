from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """10 requests per 15 minutes per IP, matching the reference project's authLimiter."""
    scope = 'auth'

    def parse_rate(self, rate):
        return (10, 15 * 60)
