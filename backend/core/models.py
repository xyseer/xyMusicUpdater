# mypy: ignore-errors
from django.db import models
from django.utils import timezone
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from django.db.models.manager import Manager

class DownloadJob(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    JOB_TYPES = (
        ('manual', 'Manual'),
        ('cron', 'Cron'),
    )
    STATUS_CHOICES = (
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    )
    job_type: models.CharField = models.CharField(max_length=10, choices=JOB_TYPES)
    url: models.URLField = models.URLField(max_length=500, null=True, blank=True)
    status: models.CharField = models.CharField(max_length=10, choices=STATUS_CHOICES, default='queued')
    error: models.TextField = models.TextField(null=True, blank=True)
    created_at: models.DateTimeField = models.DateTimeField(default=timezone.now)
    started_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    finished_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.job_type} - {self.status} ({self.created_at})"

class Song(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('deleted', 'Deleted'),
        ('moved', 'Moved'),
    )
    filename: models.CharField = models.CharField(max_length=255, unique=True)
    filepath: models.CharField = models.CharField(max_length=500)
    video_id: models.CharField = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    title: models.CharField = models.CharField(max_length=255, null=True, blank=True)
    artist: models.CharField = models.CharField(max_length=255, null=True, blank=True)
    album: models.CharField = models.CharField(max_length=255, null=True, blank=True)
    album_artist: models.CharField = models.CharField(max_length=255, null=True, blank=True)
    source: models.CharField = models.CharField(max_length=100, null=True, blank=True)
    file_size: models.BigIntegerField = models.BigIntegerField(default=0)
    status: models.CharField = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    needs_tagging: models.BooleanField = models.BooleanField(default=False)
    pending_confirmation: models.BooleanField = models.BooleanField(default=False)
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)
    deleted_at: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    jobs: models.ManyToManyField = models.ManyToManyField(DownloadJob, related_name='songs_added')

    def __str__(self) -> str:
        return str(self.title or self.filename)

class ActivityLog(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    LEVEL_CHOICES = (
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    )
    job: models.ForeignKey = models.ForeignKey(DownloadJob, on_delete=models.CASCADE, related_name='logs', null=True, blank=True)
    level: models.CharField = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='info')
    message: models.TextField = models.TextField()
    timestamp: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

class PermanentLog(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    song: models.ForeignKey = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='permanent_logs')
    filename: models.CharField = models.CharField(max_length=255)
    reason: models.CharField = models.CharField(max_length=255)
    playlist: models.CharField = models.CharField(max_length=255, null=True, blank=True)
    moved_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.filename} - {self.reason}"

class SystemConfig(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    key: models.CharField = models.CharField(max_length=50, unique=True)
    value: models.TextField = models.TextField()

    def __str__(self) -> str:
        return f"{self.key}: {self.value}"

class SearchSubscription(models.Model):
    id: models.BigAutoField = models.BigAutoField(primary_key=True)
    label: models.CharField = models.CharField(max_length=100)
    keywords: models.TextField = models.TextField(help_text="Comma separated")
    keyword_blacklist: models.TextField = models.TextField(blank=True, default='', help_text="Comma separated title keywords to skip")
    source: models.CharField = models.CharField(max_length=50, default="youtube")
    amount: models.IntegerField = models.IntegerField(default=10)
    cycle_days: models.IntegerField = models.IntegerField(default=7)
    last_run: models.DateTimeField = models.DateTimeField(null=True, blank=True)
    active: models.BooleanField = models.BooleanField(default=True)
    created_at: models.DateTimeField = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.label)
