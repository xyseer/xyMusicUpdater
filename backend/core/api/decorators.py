from functools import wraps
from django.http import JsonResponse

def api_auth_required(view_func):
    """
    Decorator to ensure that the user is authenticated before accessing an API view.
    Designed for standard Django views that are not using DRF's @api_view.
    (DRF views should rely on the default IsAuthenticated permission class).
    """
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)
        return view_func(request, *args, **kwargs)
    return _wrapped_view
