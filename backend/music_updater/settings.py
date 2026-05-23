import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-default-key')

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'whitenoise.runserver_nostatic',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'music_updater.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'static')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'music_updater.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.environ.get('DB_PATH', BASE_DIR / 'db.sqlite3'),
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_DIRS = [os.path.join(BASE_DIR, 'static')]

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOW_ALL_ORIGINS = True

# Music Config
MUSIC_CONFIG = {
    "TEMP_FOLDER": os.environ.get("TEMP_FOLDER", "/music/temp"),
    "PERMANENT_SAVING_DIR": os.environ.get("PERMANENT_SAVING_DIR", "/music/permanent"),
    "MAX_STORAGE_SIZE": int(os.environ.get("MAX_STORAGE_SIZE", "10")),
    "PURGE_BATCH_SIZE": int(os.environ.get("PURGE_BATCH_SIZE", "20")),
    "SOURCES": {
        "Default": os.environ.get("SOURCES", "https://www.youtube.com/playlist?list=PLzXW0R_iJb6jO_H6V9lFfC4h9a-6Y-oO").split(","),
    },
    "MAX_SONGS_PER_SOURCE": int(os.environ.get("MAX_SONGS_PER_SOURCE", "10")),
    "MB_APP_NAME": "MusicUpdater",
    "MB_APP_VERSION": "0.1.0",
    "MB_CONTACT": os.environ.get("MB_CONTACT", "admin@example.com"),
    "NAVIDROME_URL": os.environ.get("NAVIDROME_URL", "http://navidrome:4533"),
    "NAVIDROME_USER": os.environ.get("NAVIDROME_USER", "admin"),
    "NAVIDROME_PASSWORD": os.environ.get("NAVIDROME_PASSWORD", "changeme"),
    "DAEMON_INTERVAL_HOURS": int(os.environ.get("DAEMON_INTERVAL_HOURS", "24")),
    "YTDLP_COOKIES": os.environ.get("YTDLP_COOKIES", ""),
    "YTDLP_USERNAME": os.environ.get("YTDLP_USERNAME", ""),
    "YTDLP_PASSWORD": os.environ.get("YTDLP_PASSWORD", ""),
    "YTDLP_PROXY": os.environ.get("YTDLP_PROXY", ""),
}
