import os
import base64
from django.conf import settings
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
except ImportError:
    AES = None # Fallback if library not yet installed

def decrypt_password(encrypted_pw):
    if not AES or not encrypted_pw:
        return encrypted_pw
    try:
        # Use first 16 bytes of SECRET_KEY, padded with zeros if necessary
        key_str = settings.SECRET_KEY[:16]
        key = key_str.encode('utf-8').ljust(16, b'\0')[:16]
        
        raw = base64.b64decode(encrypted_pw)
        if len(raw) < 16:
            print(f"Decryption error: Raw data too short ({len(raw)} bytes)")
            return encrypted_pw
            
        iv = raw[:16]
        ciphertext = raw[16:]
        
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_raw = cipher.decrypt(ciphertext)
        decrypted = unpad(decrypted_raw, AES.block_size)
        return decrypted.decode('utf-8')
    except Exception as e:
        print(f"Decryption failed: {e}")
        # If it fails, return original to try as plain text (legacy fallback)
        return encrypted_pw

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username")
    encrypted_password = request.data.get("password")
    
    password = decrypt_password(encrypted_password)
    
    env_user = os.environ.get("APP_USER", "admin")
    env_pass = os.environ.get("APP_PASSWORD", "xyseer")
    
    if username == env_user and password == env_pass:
        from ..logic import cleanup_previews
        cleanup_previews(force_all=True) 
        
        user, _ = User.objects.get_or_create(username=username)
        login(request, user)
        return Response({"status": "ok", "user": user.username})
    
    print(f"Login failed for user '{username}'. Input len: {len(password) if password else 0}, Expected len: {len(env_pass)}")
    return Response({"error": "Invalid credentials"}, status=401)

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    logout(request)
    return Response({"status": "ok"})

@api_view(["GET"])
@permission_classes([AllowAny])
def session_view(request):
    if request.user.is_authenticated:
        return Response({"authenticated": True, "user": request.user.username})
    return Response({"authenticated": False})
